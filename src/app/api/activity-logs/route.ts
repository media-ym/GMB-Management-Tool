import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/activity-logs — user activity history (doc 06 §17)
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "audit.view")) return forbidden();

  const url = new URL(req.url);
  const moduleFilter = url.searchParams.get("module") || undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  const where: any = {};
  if (moduleFilter) where.module = moduleFilter;

  const logs = await db.activityLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true, email: true, avatar: true } } },
  });

  return ok(logs.map((l) => ({
    id: l.id,
    userId: l.userId,
    userName: l.user?.name ?? "System",
    userEmail: l.user?.email ?? null,
    userAvatar: l.user?.avatar ?? null,
    module: l.module,
    action: l.action,
    entityType: l.entityType,
    entityId: l.entityId,
    ipAddress: l.ipAddress,
    userAgent: l.userAgent,
    createdAt: l.createdAt.toISOString(),
  })));
}
