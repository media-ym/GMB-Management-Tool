import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ok, unauthorized } from "@/lib/api-response";
import type { NotificationItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const onlyUnread = url.searchParams.get("unread") === "1";

  const where: any = { OR: [{ userId: user.id }, { userId: null }] };
  if (onlyUnread) where.read = false;

  const notifs = await db.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const data: NotificationItem[] = notifs.map((n) => ({
    id: n.id, type: n.type, title: n.title, message: n.message,
    severity: n.severity as any, read: n.read, link: n.link,
    createdAt: n.createdAt.toISOString(),
  }));

  return ok(data);
}

// PATCH /api/notifications — mark all read
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  await db.notification.updateMany({ where: { OR: [{ userId: user.id }, { userId: null }], read: false }, data: { read: true } });
  return ok({ marked: true }, "All notifications marked as read");
}

// PATCH /api/notifications/[id] — mark single as read
export async function PATCH_ID(req: NextRequest, { id }: { id: string }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  await db.notification.update({ where: { id }, data: { read: true } });
  return ok({ id }, "Notification marked as read");
}
