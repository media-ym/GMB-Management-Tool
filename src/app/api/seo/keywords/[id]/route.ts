import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, notFound, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// PUT /api/seo/keywords/[id] — update keyword
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "seo.manage")) return forbidden();

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: any = {};
  if (body.keyword) data.keyword = body.keyword;
  if (body.city !== undefined) data.city = body.city;
  if (body.state !== undefined) data.state = body.state;
  if (body.status) data.status = body.status;
  if (body.locationId !== undefined) data.locationId = body.locationId || null;

  const updated = await db.keyword.update({ where: { id }, data });
  await logAudit({ userId: user.id, userName: user.name, action: "keyword.update", entity: "keyword", entityId: id, newValue: data, ip: req.headers.get("x-forwarded-for") ?? undefined });
  return ok({ id: updated.id }, "Keyword updated");
}

// DELETE /api/seo/keywords/[id] — delete keyword + its rankings
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "seo.manage")) return forbidden();

  const { id } = await params;
  await db.keyword.delete({ where: { id } });
  await logAudit({ userId: user.id, userName: user.name, action: "keyword.delete", entity: "keyword", entityId: id, ip: req.headers.get("x-forwarded-for") ?? undefined });
  return ok({ id }, "Keyword deleted");
}
