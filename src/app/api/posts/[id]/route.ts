import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, notFound, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// PATCH /api/posts/[id] — update status (publish/schedule/draft)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.manage")) return forbidden();

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const post = await db.post.findUnique({ where: { id } });
  if (!post) return notFound("Post not found");

  const data: any = {};
  if (body.status) {
    data.status = body.status;
    if (body.status === "published") data.publishedAt = new Date();
    if (body.status === "scheduled" && body.scheduledAt) data.scheduledAt = new Date(body.scheduledAt);
  }
  if (body.title) data.title = body.title;
  if (body.content) data.content = body.content;
  if (body.ctaType) data.ctaType = body.ctaType;
  if (body.ctaUrl !== undefined) data.ctaUrl = body.ctaUrl;

  const updated = await db.post.update({ where: { id }, data });
  await logAudit({ userId: user.id, userName: user.name, action: `post.${body.status ?? "update"}`, entity: "post", entityId: id, newValue: data, ip: req.headers.get("x-forwarded-for") ?? undefined });
  return ok({ id: updated.id, status: updated.status }, `Post ${body.status ?? "updated"}`);
}

// DELETE /api/posts/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.manage")) return forbidden();
  const { id } = await params;
  await db.post.delete({ where: { id } });
  await logAudit({ userId: user.id, userName: user.name, action: "post.delete", entity: "post", entityId: id, ip: req.headers.get("x-forwarded-for") ?? undefined });
  return ok({ id }, "Post deleted");
}
