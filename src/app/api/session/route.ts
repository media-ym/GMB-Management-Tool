import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
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
