import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidRoleValue } from "@/lib/rbac";
import { validatePassword } from "@/lib/password";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "users.manage")) return forbidden();

  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true, status: true, phone: true, avatar: true, assignedLocationIds: true, failedLoginAttempts: true, lockedUntil: true, lastLoginAt: true, lastLoginIp: true, createdAt: true },
  });

  return ok(users.map((u) => ({
    ...u,
    lockedUntil: u.lockedUntil?.toISOString() ?? null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    lastLoginIp: u.lastLoginIp ?? null,
    createdAt: u.createdAt.toISOString(),
    assignedLocationIds: u.assignedLocationIds ? u.assignedLocationIds.split(",").filter(Boolean) : [],
  })));
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "users.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { name, email, role, password, assignedLocationIds, invite } = body;
  if (!name || !email || !role) return fail("name, email, role required");

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return fail("Email already in use");
  if (!(await isValidRoleValue(String(role)))) return fail("Invalid role");

  // Invitation flow (doc 06 §3): if invite=true, create user with status=invited and no password
  if (invite) {
    const { generateToken } = await import("@/lib/password");
    const token = generateToken();
    const created = await db.user.create({
      data: {
        name, email: normalizedEmail,
        role: role as Role,
        password: null,
        status: "invited",
        invitationToken: token,
        invitationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        assignedLocationIds: Array.isArray(assignedLocationIds) ? assignedLocationIds.join(",") : null,
      },
    });
    await logAudit({ userId: user.id, userName: user.name, action: "user.invite", entity: "user", entityId: created.id, newValue: { name, email: normalizedEmail, role }, ip: req.headers.get("x-forwarded-for") ?? undefined });
    return ok({ id: created.id, invitationToken: token }, "Invitation sent");
  }

  // Direct create with password — validate password policy (doc 06 §9)
  if (!password) return fail("password required (or set invite=true to send invitation)");
  const pwCheck = validatePassword(password);
  if (!pwCheck.valid) return fail(`Password policy violation: ${pwCheck.errors.join("; ")}`);

  // Login uses Supabase Auth — create auth user first, then link Prisma row.
  const supabase = createAdminClient();
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password: String(password),
    email_confirm: true,
    user_metadata: { name, role, full_name: name },
  });
  if (authError || !authData.user) {
    return fail(authError?.message || "Failed to create auth user");
  }

  try {
    const created = await db.user.create({
      data: {
        name,
        email: normalizedEmail,
        role: role as Role,
        password: null,
        authId: authData.user.id,
        status: "active",
        assignedLocationIds: Array.isArray(assignedLocationIds) ? assignedLocationIds.join(",") : null,
      },
    });

    await logAudit({
      userId: user.id,
      userName: user.name,
      action: "user.create",
      entity: "user",
      entityId: created.id,
      newValue: { name, email: normalizedEmail, role },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });
    return ok({ id: created.id }, "User created");
  } catch (e: any) {
    // Roll back auth user if Prisma insert fails
    await supabase.auth.admin.deleteUser(authData.user.id).catch(() => null);
    return fail(e?.message || "Failed to create user");
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "users.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { id, role, status, assignedLocationIds, name, password, confirmPassword, active } = body;
  if (!id) return fail("id required");

  const existing = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, authId: true },
  });
  if (!existing) return fail("User not found", 404);

  const data: Record<string, unknown> = {};
  if (role) {
    if (!(await isValidRoleValue(String(role)))) return fail("Invalid role");
    data.role = role;
  }
  if (status || typeof active === "boolean") {
    const nextStatus =
      typeof active === "boolean" ? (active ? "active" : "inactive") : status;
    const validStatuses = ["active", "invited", "locked", "suspended", "inactive"];
    if (!validStatuses.includes(nextStatus)) return fail("Invalid status");
    data.status = nextStatus;
    if (nextStatus === "active") {
      data.failedLoginAttempts = 0;
      data.lockedUntil = null;
    }
    if (nextStatus === "locked") {
      data.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
  }
  if (Array.isArray(assignedLocationIds)) data.assignedLocationIds = assignedLocationIds.join(",");
  if (name) data.name = name;

  if (password) {
    if (confirmPassword != null && password !== confirmPassword) {
      return fail("New password and confirmation do not match");
    }
    const pwCheck = validatePassword(String(password));
    if (!pwCheck.valid) return fail(`Password policy violation: ${pwCheck.errors.join("; ")}`);

    const supabase = createAdminClient();
    let authId = existing.authId;
    if (!authId) {
      const { data: listed } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
      authId =
        listed?.users.find((u) => (u.email || "").toLowerCase() === existing.email.toLowerCase())
          ?.id || null;
    }
    if (!authId) return fail("Auth account not found for this user");
    const { error } = await supabase.auth.admin.updateUserById(authId, {
      password: String(password),
    });
    if (error) return fail(error.message || "Failed to update password");
    data.authId = authId;
    data.password = null;

    // Keep portal temp-password visible for client_portal users
    try {
      const { getClientIdForUser, setPortalCredentials } = await import("@/lib/portal-link");
      const clientId = await getClientIdForUser(existing.id);
      if (clientId) {
        await setPortalCredentials(existing.id, clientId, existing.email, String(password));
      }
    } catch {
      /* non-portal user or link missing */
    }
  }

  const updated = await db.user.update({
    where: { id },
    data,
    select: { id: true, email: true, role: true },
  });
  await logAudit({
    userId: user.id,
    userName: user.name,
    action: password ? "user.password_reset" : "user.update",
    entity: "user",
    entityId: id,
    newValue: { ...data, password: password ? "[updated]" : undefined },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });
  return ok({ id: updated.id }, password ? "Password updated" : "User updated");
}
