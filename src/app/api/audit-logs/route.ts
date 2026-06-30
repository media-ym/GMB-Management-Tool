import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import type { AuditLogItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "audit.view")) return forbidden();

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  const where: any = {};
  if (action) where.action = action;

  const logs = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const data: AuditLogItem[] = logs.map((l) => ({
    id: l.id, userName: l.userName, action: l.action, entity: l.entity, entityId: l.entityId,
    status: l.status as any, ip: l.ip, createdAt: l.createdAt.toISOString(), newValue: l.newValue,
  }));

  return ok(data);
}
