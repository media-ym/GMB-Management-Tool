import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, notFound, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { createGooglePost, deleteGooglePost, patchGooglePost, getValidAccessToken } from "@/lib/google-service";

export const dynamic = "force-dynamic";

// PATCH /api/posts/[id] — update status (publish/schedule/draft) or edit content
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

  // ─── Already-published post: push content edits to Google ──────────────
  // topicType is immutable on Google's side — only title/summary/callToAction are patchable.
  const editingPublished = post.status === "published"
    && post.googlePostId
    && (body.title || body.content || body.ctaType || body.ctaUrl !== undefined);

  let googlePatchError: string | null = null;
  if (editingPublished) {
    const gbp = post.location?.googleProfiles?.[0];
    const accessToken = gbp ? await getValidAccessToken() : null;
    if (gbp && accessToken) {
      const newTitle = body.title ?? post.title;
      const newSummary = body.content ?? post.content;
      const ctaType = body.ctaType ?? post.ctaType;
      const ctaUrl = body.ctaUrl !== undefined ? body.ctaUrl : post.ctaUrl;
      const patchPayload: any = {
        title: newTitle,
        summary: newSummary,
        callToAction: ctaType ? { actionType: ctaType.toUpperCase(), url: ctaUrl || undefined } : undefined,
      };
      try {
        await patchGooglePost(accessToken, post.googlePostId!, patchPayload, "summary,title,callToAction");
      } catch (e: any) {
        googlePatchError = e.message;
        await logAudit({
          userId: user.id, userName: user.name, action: "post.google_patch_failed",
          entity: "post", entityId: id, newValue: { error: e.message, googlePostId: post.googlePostId },
          ip: req.headers.get("x-forwarded-for") ?? undefined,
        });
        return fail(`Failed to sync edits to Google: ${e.message}`, 500);
      }
    }
  }

  const updated = await db.post.update({ where: { id }, data });
  await logAudit({ userId: user.id, userName: user.name, action: `post.${body.status ?? "update"}`, entity: "post", entityId: id, newValue: data, ip: req.headers.get("x-forwarded-for") ?? undefined });
  const message = editingPublished
    ? (googlePatchError ? `Post updated locally — Google sync failed: ${googlePatchError}` : "Post updated and synced to Google Business Profile")
    : `Post ${body.status ?? "updated"}`;
  return ok({ id: updated.id, status: updated.status, googlePostId: updated.googlePostId }, message);
}

// DELETE /api/posts/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.manage")) return forbidden();
  const { id } = await params;

  // Fetch with location+googleProfiles so we can best-effort delete on Google's side
  const post = await db.post.findUnique({
    where: { id },
    include: { location: { include: { googleProfiles: true } } },
  });
  if (!post) return notFound("Post not found");

  // ─── Best-effort Google delete — never block local delete ──────────────
  let googleDeleted = false;
  let googleError: string | null = null;

  if (post.googlePostId && post.location?.googleProfiles?.[0]) {
    const accessToken = await getValidAccessToken();
    if (accessToken) {
      try {
        await deleteGooglePost(accessToken, post.googlePostId);
        googleDeleted = true;
      } catch (e: any) {
        googleError = e.message;
        await logAudit({
          userId: user.id, userName: user.name, action: "post.google_delete_failed",
          entity: "post", entityId: id, newValue: { error: e.message, googlePostId: post.googlePostId },
          ip: req.headers.get("x-forwarded-for") ?? undefined,
        });
      }
    }
  }

  await db.post.delete({ where: { id } });
  await logAudit({
    userId: user.id, userName: user.name, action: "post.delete",
    entity: "post", entityId: id,
    newValue: { googleDeleted, googleError },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  const message = googleDeleted
    ? "Post deleted locally and on Google Business Profile"
    : googleError
      ? `Post deleted locally — Google delete failed: ${googleError}`
      : "Post deleted";

  return ok({ id, googleDeleted, googleError }, message);
}
