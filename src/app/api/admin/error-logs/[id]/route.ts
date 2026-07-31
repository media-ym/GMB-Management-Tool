import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** PATCH /api/admin/error-logs/[id] — mark error resolved/unresolved */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "system.view") && !can(user.role, "settings.manage")) return forbidden();

  const { id } = await params;
  if (!id) return fail("id required");

  const body = await req.json().catch(() => ({}));
  const resolved = body.resolved !== false;

  const existing = await db.errorLog.findUnique({ where: { id } });
  if (!existing) return fail("Error log not found", 404);

  const updated = await db.errorLog.update({
    where: { id },
    data: { resolved },
  });

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: resolved ? "error.resolve" : "error.unresolve",
    entity: "error_log",
    entityId: id,
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok({
    id: updated.id,
    resolved: updated.resolved,
  }, resolved ? "Error marked resolved" : "Error reopened");
}
