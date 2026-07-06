import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, notFound, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { createGooglePost, getValidAccessToken } from "@/lib/google-service";

export const dynamic = "force-dynamic";

// PATCH /api/posts/[id] — update status (publish/schedule/draft)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.manage")) return forbidden();

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const post = await db.post.findUnique({ where: { id }, include: { location: { include: { googleProfiles: true } } } });
  if (!post) return notFound("Post not found");

  const data: any = {};

  // ─── If publishing: push to REAL Google Business Profile ───────────────
  if (body.status === "published" && post.status !== "published") {
    const gbp = post.location?.googleProfiles?.[0];
    if (gbp) {
      const accessToken = await getValidAccessToken();
      if (accessToken) {
        try {
          const googleTopicType = post.type === "offer" ? "OFFER" : post.type === "event" ? "EVENT" : "STANDARD";

          const googlePostData: any = {
            languageCode: "en",
            summary: post.content,
            topicType: googleTopicType,
            callToAction: post.ctaType ? { actionType: post.ctaType.toUpperCase(), url: post.ctaUrl || undefined } : undefined,
          };

          if (post.title) googlePostData.title = post.title;

          if (post.type === "offer") {
            googlePostData.offer = { redeemUrl: post.ctaUrl || undefined };
          }

          if (post.type === "event") {
            googlePostData.event = {
              title: post.title,
              schedule: post.startDate ? {
                startDate: { year: new Date(post.startDate).getFullYear(), month: new Date(post.startDate).getMonth() + 1, day: new Date(post.startDate).getDate() },
                endDate: post.endDate ? { year: new Date(post.endDate).getFullYear(), month: new Date(post.endDate).getMonth() + 1, day: new Date(post.endDate).getDate() } : undefined,
              } : undefined,
            };
          }

          const gPost = await createGooglePost(accessToken, gbp.googleLocationId, googlePostData);
          data.googlePostId = gPost.name || null;
        } catch (e: any) {
          return fail(`Failed to publish to Google: ${e.message}`, 500);
        }
      }
    }
    data.publishedAt = new Date();
  }

  if (body.status) data.status = body.status;
  if (body.status === "scheduled" && body.scheduledAt) data.scheduledAt = new Date(body.scheduledAt);
  if (body.title) data.title = body.title;
  if (body.content) data.content = body.content;
  if (body.ctaType) data.ctaType = body.ctaType;
  if (body.ctaUrl !== undefined) data.ctaUrl = body.ctaUrl;

  const updated = await db.post.update({ where: { id }, data });
  await logAudit({ userId: user.id, userName: user.name, action: `post.${body.status ?? "update"}`, entity: "post", entityId: id, newValue: data, ip: req.headers.get("x-forwarded-for") ?? undefined });
  return ok({ id: updated.id, status: updated.status, googlePostId: updated.googlePostId }, `Post ${body.status ?? "updated"}`);
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
