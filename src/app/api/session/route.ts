import { NextRequest } from "next/server";
import { getSessionUser, logAudit, touchLastLogin } from "@/lib/session";
import { ok, unauthorized } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return ok({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatar: user.avatar,
    assignedLocationIds: user.assignedLocationIds,
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
