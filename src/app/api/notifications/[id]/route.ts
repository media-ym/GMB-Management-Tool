import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ok, unauthorized } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  await db.notification.update({ where: { id }, data: { read: true } });
  return ok({ id }, "Notification marked as read");
}
