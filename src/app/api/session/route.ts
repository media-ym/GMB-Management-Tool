import { NextRequest } from "next/server";
import { getSessionUser, logAudit, touchLastLogin } from "@/lib/session";
import { ok, unauthorized } from "@/lib/api-response";
import { getPortalCredentialsByUserId } from "@/lib/portal-link";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  let portalLogin: {
    email: string | null;
    temporaryPassword: string | null;
    mustChangePassword: boolean;
  } | null = null;

  if (user.role === "client_portal") {
    const creds = await getPortalCredentialsByUserId(user.id);
    if (creds?.temporaryPassword) {
      portalLogin = {
        email: creds.loginEmail || user.email,
        temporaryPassword: creds.temporaryPassword,
        mustChangePassword: creds.mustChangePassword,
      };
    }
  }

  return ok({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatar: user.avatar,
    assignedLocationIds: user.assignedLocationIds,
    clientId: user.clientId,
    portalLogin,
  });
}

/** Called right after Supabase Auth sign-in to record last login + audit. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    undefined;

  await touchLastLogin(user.id, ip);
  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "login.success",
    entity: "user",
    entityId: user.id,
    ip,
  });

  return ok({ id: user.id, email: user.email, role: user.role });
}
