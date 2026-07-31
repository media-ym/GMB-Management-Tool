import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePassword, generateToken } from "@/lib/password";
import { sendMail, isSmtpConfigured } from "@/lib/mail";
import { getSmtpConfig } from "@/lib/app-settings";
import { getClientIdForUser, setPortalCredentials } from "@/lib/portal-link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Never select User.clientId — column may be missing on this DB. */
const USER_SAFE_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  authId: true,
  status: true,
} as const;

/**
 * POST /api/clients/[id]/portal-invite
 * Create (or reset) a client_portal user linked to this Client.
 * body: { email?, name?, password? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "users.manage") && !can(user.role, "settings.manage")) {
    return forbidden();
  }

  const { id: clientId } = await params;
  let client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return fail("Client not found", 404);

  // Terminate flow removed — revive legacy terminated clients on invite
  if (client.status === "terminated") {
    client = await db.client.update({
      where: { id: clientId },
      data: { status: "active" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || client.contactEmail || "")
    .trim()
    .toLowerCase();
  const name = String(body.name || client.contactName || client.name).trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("Valid portal login email is required (set contact email or pass email)");
  }

  let password = String(body.password || "").trim();
  if (!password) {
    password = `MyFNG@${generateToken().slice(0, 10)}!`;
  }
  const pwCheck = validatePassword(password);
  if (!pwCheck.valid) {
    return fail(`Password policy: ${pwCheck.errors.join("; ")}`);
  }

  const existing = await db.user.findUnique({
    where: { email },
    select: USER_SAFE_SELECT,
  });
  if (existing) {
    const linkedClientId = await getClientIdForUser(existing.id);
    if (linkedClientId && linkedClientId !== clientId) {
      return fail("This email is already linked to another client");
    }
    // Only allow reuse if already a portal user (or re-invite same client)
    if (existing.role !== "client_portal") {
      return fail("This email belongs to a staff user — use a different email for the portal");
    }
  }

  const supabase = createAdminClient();
  let authId = existing?.authId || null;

  if (authId) {
    const { error } = await supabase.auth.admin.updateUserById(authId, {
      password,
      email_confirm: true,
      user_metadata: { name, role: "client_portal", clientId },
    });
    if (error) return fail(error.message || "Failed to update auth user");
  } else {
    // Try find by email in auth
    const { data: listed } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = listed?.users.find((u) => (u.email || "").toLowerCase() === email);
    if (found) {
      authId = found.id;
      const { error } = await supabase.auth.admin.updateUserById(authId, {
        password,
        email_confirm: true,
        user_metadata: { name, role: "client_portal", clientId },
      });
      if (error) return fail(error.message || "Failed to update auth user");
    } else {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role: "client_portal", clientId, full_name: name },
      });
      if (authError || !authData.user) {
        return fail(authError?.message || "Failed to create auth user");
      }
      authId = authData.user.id;
    }
  }

  // Do not write User.clientId — column may not exist (DB role cannot ALTER User).
  // Link is stored in ClientPortalLink instead.
  const portalUser = existing
    ? await db.user.update({
        where: { id: existing.id },
        data: {
          name,
          role: "client_portal",
          authId,
          status: "active",
          password: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
        select: USER_SAFE_SELECT,
      })
    : await db.user.create({
        data: {
          name,
          email,
          role: "client_portal",
          authId,
          status: "active",
          password: null,
        },
        select: USER_SAFE_SELECT,
      });

  await setPortalCredentials(portalUser.id, clientId, email, password);

  // Keep client contact email in sync
  if (!client.contactEmail) {
    await db.client.update({
      where: { id: clientId },
      data: { contactEmail: email, contactName: name },
    });
  }

  const origin =
    req.headers.get("origin") ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  // Same site as staff — gmb.myfng.in / localhost (no separate portal.login)
  const loginUrl = origin.replace(/\/$/, "");

  let emailSent = false;
  let emailError: string | null = null;
  const smtp = await getSmtpConfig();
  if (isSmtpConfigured(smtp)) {
    try {
      await sendMail({
        to: email,
        subject: `Your MyFNG login — ${client.name}`,
        text: `Hello ${name},

You have been invited to manage Google Business Profile for ${client.name} on MyFNG.

Login at: ${loginUrl}
Email: ${email}
Temporary password: ${password}

Sign in with these credentials (same page as MyFNG). After login you will see Connect Google to authorize your Business Profile locations.

— MyFNG Local AI Manager`,
      });
      emailSent = true;
    } catch (e: any) {
      emailError = e?.message || "Email failed";
    }
  }

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "portal.invite",
    entity: "client",
    entityId: clientId,
    newValue: { email, userId: portalUser.id, emailSent },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok(
    {
      userId: portalUser.id,
      email,
      portalUrl: loginUrl,
      loginUrl,
      temporaryPassword: password,
      emailSent,
      emailError,
    },
    emailSent
      ? "Client login created and email sent"
      : "Client login created — share the password with the client (SMTP not configured or email failed)",
  );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invite failed";
    console.error("[portal-invite]", e);
    return fail(message, 500);
  }
}
