import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, notFound, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import {
  attachLocalPostMedia,
  createGooglePost,
  deleteGooglePost,
  patchGooglePost,
  getValidAccessToken,
  resolveV4LocationName,
} from "@/lib/google-service";
import { requireClientAuth } from "@/lib/client-auth";
import { computeNextWeeklyOccurrence } from "@/lib/post-recurrence";

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
    // End-client authorization gate — must hold "post.create" scope before
    // we can publish to Google on behalf of the linked client.
    const authCheck = await requireClientAuth(post.locationId, "post.create");
    if (!authCheck.ok) return authCheck.response;

    const gbp = post.location?.googleProfiles?.[0];
    if (!gbp) return fail("No Google Business Profile linked to this location. Connect Google first.", 400);
    if (gbp.verificationState !== "verified") {
      return fail(
        "This Google listing is unverified. Verify it in Google Business Profile before publishing posts.",
        400,
      );
    }
    const accessToken = await getValidAccessToken();
    if (!accessToken) return fail("No valid Google access token. Please reconnect your Google account.", 401);
    {
      {
        try {
          const googleTopicType = post.type === "offer" ? "OFFER" : post.type === "event" ? "EVENT" : "STANDARD";

          const googlePostData: any = {
            languageCode: "en",
            summary: post.content,
            topicType: googleTopicType,
          };

          // CTA is only supported for STANDARD and EVENT, NOT for OFFER
          if (googleTopicType !== "OFFER") {
            const actionType = post.ctaType?.toUpperCase();
            const ctaPayload = (actionType && actionType !== "NONE")
              ? actionType === "CALL"
                ? { actionType: "CALL" }
                : post.ctaUrl ? { actionType, url: post.ctaUrl } : undefined
              : undefined;
            if (ctaPayload) googlePostData.callToAction = ctaPayload;
          }

          function buildDateObj(d: Date | null | undefined) {
            if (!d) return undefined;
            return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
          }
          function buildTimeObj(timeStr: string | null | undefined) {
            if (!timeStr) return undefined;
            const [h, m] = timeStr.split(":").map(Number);
            return { hours: h, minutes: m, seconds: 0, nanos: 0 };
          }

          if (post.type === "offer") {
            googlePostData.offer = {};
            if (post.couponCode) googlePostData.offer.couponCode = post.couponCode;
            if (post.redeemUrl) googlePostData.offer.redeemOnlineUrl = post.redeemUrl;
            if (post.offerTerms) googlePostData.offer.termsConditions = post.offerTerms;
          }

          if (post.type === "event" || (post.type === "offer" && post.startDate)) {
            googlePostData.event = {
              title: post.title,
              schedule: {
                startDate: buildDateObj(post.startDate),
                startTime: buildTimeObj(post.startTime),
                endDate: buildDateObj(post.endDate),
                endTime: buildTimeObj(post.endTime),
              },
            };
          }

          const v4Name = await resolveV4LocationName(accessToken, gbp.googleLocationId);
          await attachLocalPostMedia(accessToken, v4Name, googlePostData, post.imageUrl);
          const gPost = await createGooglePost(accessToken, v4Name, googlePostData);
          data.googlePostId = gPost.name || null;
          if (!data.googlePostId) {
            return fail("Google did not return a post id — not marked published.", 500);
          }
        } catch (e: any) {
          return fail(`Failed to publish to Google: ${e.message}`, 500);
        }
      }
    }
    data.publishedAt = new Date();
  }

  if (body.status) data.status = body.status;
  if (body.status === "scheduled") {
    if (body.recurrenceType === "weekly") {
      if (body.recurrenceDayOfWeek == null || !body.recurrenceTime) {
        return fail("Weekly schedule requires a day and time", 400);
      }
      data.recurrenceType = "weekly";
      data.recurrenceDayOfWeek = body.recurrenceDayOfWeek;
      data.recurrenceTime = body.recurrenceTime;
      data.scheduledAt = computeNextWeeklyOccurrence(body.recurrenceDayOfWeek, body.recurrenceTime);
    } else {
      data.recurrenceType = null;
      data.recurrenceDayOfWeek = null;
      data.recurrenceTime = null;
      if (body.scheduledAt) data.scheduledAt = new Date(body.scheduledAt);
    }
  } else if (body.status === "draft") {
    data.scheduledAt = null;
    data.recurrenceType = null;
    data.recurrenceDayOfWeek = null;
    data.recurrenceTime = null;
  } else if (body.recurrenceType === "weekly" && post.status === "scheduled") {
    if (body.recurrenceDayOfWeek == null || !body.recurrenceTime) {
      return fail("Weekly schedule requires a day and time", 400);
    }
    data.recurrenceType = "weekly";
    data.recurrenceDayOfWeek = body.recurrenceDayOfWeek;
    data.recurrenceTime = body.recurrenceTime;
    data.scheduledAt = computeNextWeeklyOccurrence(body.recurrenceDayOfWeek, body.recurrenceTime);
  } else if (body.scheduledAt && post.status === "scheduled") {
    data.scheduledAt = new Date(body.scheduledAt);
    data.recurrenceType = null;
    data.recurrenceDayOfWeek = null;
    data.recurrenceTime = null;
  }
  if (body.title !== undefined) data.title = body.title;
  if (body.content) data.content = body.content;
  if (body.ctaType) data.ctaType = body.ctaType;
  if (body.ctaUrl !== undefined) data.ctaUrl = body.ctaUrl;
  if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl;
  if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.startTime !== undefined) data.startTime = body.startTime || null;
  if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.endTime !== undefined) data.endTime = body.endTime || null;
  if (body.couponCode !== undefined) data.couponCode = body.couponCode || null;
  if (body.redeemUrl !== undefined) data.redeemUrl = body.redeemUrl || null;
  if (body.offerTerms !== undefined) data.offerTerms = body.offerTerms || null;

  // ─── Already-published post: push content edits to Google ──────────────
  // topicType is immutable on Google's side — only title/summary/callToAction are patchable.
  const editingPublished = post.status === "published"
    && post.googlePostId
    && (body.title || body.content || body.ctaType || body.ctaUrl !== undefined);

  let googlePatchError: string | null = null;
  if (editingPublished) {
    // End-client authorization gate — must hold "post.update" scope before
    // we push edits to an already-published Google post.
    const authCheck = await requireClientAuth(post.locationId, "post.update");
    if (!authCheck.ok) return authCheck.response;

    const gbp = post.location?.googleProfiles?.[0];
    const accessToken = gbp ? await getValidAccessToken() : null;
    if (gbp && accessToken) {
      const newTitle = body.title ?? post.title;
      const newSummary = body.content ?? post.content;
      const ctaType = body.ctaType ?? post.ctaType;
      const ctaUrl = body.ctaUrl !== undefined ? body.ctaUrl : post.ctaUrl;
      const patchAction = ctaType?.toUpperCase();
      const patchCta = (patchAction && patchAction !== "NONE")
        ? patchAction === "CALL"
          ? { actionType: "CALL" }
          : ctaUrl ? { actionType: patchAction, url: ctaUrl } : undefined
        : undefined;
      const patchPayload: any = {
        summary: newSummary,
      };
      if (patchCta) patchPayload.callToAction = patchCta;
      try {
        await patchGooglePost(accessToken, post.googlePostId!, patchPayload);
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

  // ─── End-client authorization gate ─────────────────────────────────────
  // Deleting a post that has been pushed to Google requires the
  // "post.delete" scope. If the client's authorization has been revoked, we
  // block the entire delete (local + Google) so the user can re-establish
  // authorization or contact support — silently deleting only locally would
  // leave a published post live on Google indefinitely, which is the worst
  // outcome for the client's reputation.
  if (post.googlePostId) {
    const authCheck = await requireClientAuth(post.locationId, "post.delete");
    if (!authCheck.ok) return authCheck.response;
  }

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
