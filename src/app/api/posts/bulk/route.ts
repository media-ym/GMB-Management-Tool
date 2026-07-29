import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import {
  attachLocalPostMedia,
  createGooglePost,
  getValidAccessToken,
  resolveV4LocationName,
} from "@/lib/google-service";
import { requireClientAuth } from "@/lib/client-auth";

export const dynamic = "force-dynamic";

// POST /api/posts/bulk — bulk operations (doc 09 §18)
// Body: { action: "publish"|"schedule"|"archive"|"delete"|"publish-multi", postIds: string[], scheduledAt?: string, locationIds?: string[] }
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { action, postIds, scheduledAt, locationIds } = body;
  if (!action) return fail("action required");

  if (action === "publish" && Array.isArray(postIds)) {
    const posts = await db.post.findMany({
      where: { id: { in: postIds }, status: { in: ["draft", "scheduled", "failed"] } },
      include: { location: { include: { googleProfiles: { take: 1 } } } },
    });
    let updated = 0;
    const errors: string[] = [];
    for (const post of posts) {
      try {
        const authCheck = await requireClientAuth(post.locationId, "post.create");
        if (!authCheck.ok) throw new Error("Client authorization required");
        const gbp = post.location?.googleProfiles?.[0];
        if (!gbp) throw new Error("No Google Business Profile linked");
        if (gbp.verificationState !== "verified") throw new Error("Unverified listing");
        const accessToken = await getValidAccessToken();
        if (!accessToken) throw new Error("No valid Google access token");

        const googleTopicType = post.type === "offer" ? "OFFER" : post.type === "event" ? "EVENT" : "STANDARD";
        const googlePostData: Record<string, unknown> = {
          languageCode: "en",
          summary: post.content,
          topicType: googleTopicType,
        };
        if (googleTopicType !== "OFFER") {
          const actionType = post.ctaType?.toUpperCase();
          const ctaPayload = (actionType && actionType !== "NONE")
            ? actionType === "CALL"
              ? { actionType: "CALL" }
              : post.ctaUrl ? { actionType, url: post.ctaUrl } : undefined
            : undefined;
          if (ctaPayload) googlePostData.callToAction = ctaPayload;
        }
        const v4Name = await resolveV4LocationName(accessToken, gbp.googleLocationId);
        await attachLocalPostMedia(accessToken, v4Name, googlePostData, post.imageUrl);
        const gPost = await createGooglePost(accessToken, v4Name, googlePostData);
        if (!gPost?.name) throw new Error("Google did not return a post id");

        await db.post.update({
          where: { id: post.id },
          data: {
            status: "published",
            publishedAt: new Date(),
            scheduledAt: null,
            googlePostId: gPost.name,
          },
        });
        updated++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Publish failed";
        errors.push(`${post.location?.name || post.id}: ${msg}`);
        await db.post.update({
          where: { id: post.id },
          data: { status: "failed", publishedAt: null },
        }).catch(() => {});
      }
    }
    await logAudit({
      userId: user.id,
      userName: user.name,
      action: "bulk.post.publish",
      entity: "post",
      newValue: { postIds, count: updated, errors },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });
    const msg = errors.length
      ? `Published ${updated} · ${errors.length} failed`
      : `Published ${updated} posts to Google`;
    return ok({ updated, errors }, msg);
  }

  if (action === "schedule" && Array.isArray(postIds) && scheduledAt) {
    const result = await db.post.updateMany({
      where: { id: { in: postIds }, status: { in: ["draft", "scheduled", "published", "failed"] } },
      data: { status: "scheduled", scheduledAt: new Date(scheduledAt), publishedAt: null },
    });
    await logAudit({ userId: user.id, userName: user.name, action: "bulk.post.schedule", entity: "post", newValue: { postIds, scheduledAt, count: result.count }, ip: req.headers.get("x-forwarded-for") ?? undefined });
    return ok({ updated: result.count }, `Scheduled ${result.count} post(s)`);
  }

  if (action === "archive" && Array.isArray(postIds)) {
    const result = await db.post.updateMany({
      where: { id: { in: postIds } },
      data: { status: "failed" }, // using "failed" as archive proxy since we don't have "archived" status
    });
    await logAudit({ userId: user.id, userName: user.name, action: "bulk.post.archive", entity: "post", newValue: { postIds, count: result.count }, ip: req.headers.get("x-forwarded-for") ?? undefined });
    return ok({ updated: result.count }, `Archived ${result.count} posts`);
  }

  if (action === "delete" && Array.isArray(postIds)) {
    // Also attempt to delete from Google for published posts
    const postsToDelete = await db.post.findMany({
      where: { id: { in: postIds } },
      include: { location: { include: { googleProfiles: true } } },
    });
    for (const p of postsToDelete) {
      if (p.googlePostId && p.location?.googleProfiles?.[0]) {
        try {
          const { deleteGooglePost, getValidAccessToken } = await import("@/lib/google-service");
          const accessToken = await getValidAccessToken();
          if (accessToken) await deleteGooglePost(accessToken, p.googlePostId);
        } catch { /* best-effort */ }
      }
    }
    const result = await db.post.deleteMany({ where: { id: { in: postIds } } });
    await logAudit({ userId: user.id, userName: user.name, action: "bulk.post.delete", entity: "post", newValue: { postIds, count: result.count }, ip: req.headers.get("x-forwarded-for") ?? undefined });
    return ok({ deleted: result.count }, `Deleted ${result.count} post(s)`);
  }

  // Multi-location publish: create the same post for multiple locations (doc 09 §10)
  if (action === "publish-multi" && Array.isArray(locationIds) && body.post) {
    const post = body.post;
    const scoped = scopeLocationIds(user);
    const requestedIds = scoped ? locationIds.filter((id: string) => scoped.includes(id)) : locationIds;
    const created: string[] = [];
    const errors: string[] = [];
    let skippedUnverified = 0;

    const locationRows = await db.location.findMany({
      where: { id: { in: requestedIds } },
      select: {
        id: true,
        name: true,
        phone: true,
        googleProfiles: { select: { verificationState: true }, take: 1 },
      },
    });
    const locById = new Map(locationRows.map((l) => [l.id, l]));

    for (const locId of requestedIds) {
      const loc = locById.get(locId);
      const verificationState = loc?.googleProfiles[0]?.verificationState ?? "verified";
      if (verificationState !== "verified") {
        skippedUnverified++;
        errors.push(`${loc?.name || locId}: skipped — unverified Google listing (posts not allowed)`);
        continue;
      }

      let googlePostId: string | null = null;
      let finalStatus = (post.status || "draft") as string;
      // CALL CTA has no URL on Google — each listing uses its own GBP phone.
      const isCallCta = (post.ctaType || "").toLowerCase() === "call";
      const locationCtaUrl = isCallCta ? (loc?.phone || null) : (post.ctaUrl ?? null);

      if (finalStatus === "published") {
        try {
          const authCheck = await requireClientAuth(locId, "post.create");
          if (!authCheck.ok) {
            throw new Error("Client authorization required for post.create");
          }
          const gbp = await db.googleBusinessProfile.findFirst({ where: { locationId: locId } });
          if (!gbp) throw new Error("No Google Business Profile linked");
          if (gbp.verificationState !== "verified") {
            throw new Error("Unverified Google listing — posts not allowed");
          }
          const accessToken = await getValidAccessToken();
          if (!accessToken) throw new Error("No valid Google access token");

          const googleTopicType = post.type === "offer" ? "OFFER" : post.type === "event" ? "EVENT" : "STANDARD";
          const googlePostData: any = { languageCode: "en", summary: post.content, topicType: googleTopicType };

          if (googleTopicType !== "OFFER") {
            const actionType = post.ctaType?.toUpperCase();
            const ctaPayload = (actionType && actionType !== "NONE")
              ? actionType === "CALL"
                ? { actionType: "CALL" }
                : post.ctaUrl ? { actionType, url: post.ctaUrl } : undefined
              : undefined;
            if (ctaPayload) googlePostData.callToAction = ctaPayload;
          }

          function buildDateObj(dateStr?: string) {
            if (!dateStr) return undefined;
            const d = new Date(dateStr);
            return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
          }
          function buildTimeObj(timeStr?: string) {
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
          if ((post.type === "event" || post.type === "offer") && post.startDate) {
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
          googlePostId = gPost.name || null;
          if (!googlePostId) throw new Error("Google did not return a post id");
        } catch (e: any) {
          errors.push(`${loc?.name || locId}: ${e.message}`);
          // Never show "Published" in UI if Google push failed
          finalStatus = "failed";
          googlePostId = null;
        }
      }

      const p = await db.post.create({
        data: {
          locationId: locId,
          type: post.type,
          title: post.title || "",
          content: post.content,
          ctaType: post.ctaType ?? null,
          ctaUrl: locationCtaUrl,
          imageUrl: post.imageUrl ?? null,
          status: finalStatus,
          source: post.source || "manual",
          authorId: user.id,
          googlePostId,
          scheduledAt: post.scheduledAt ? new Date(post.scheduledAt) : null,
          recurrenceType: post.recurrenceType ?? null,
          recurrenceDayOfWeek: post.recurrenceDayOfWeek ?? null,
          recurrenceTime: post.recurrenceTime ?? null,
          publishedAt: finalStatus === "published" && googlePostId ? new Date() : null,
          startDate: post.startDate ? new Date(post.startDate) : null,
          startTime: post.startTime || null,
          endDate: post.endDate ? new Date(post.endDate) : null,
          endTime: post.endTime || null,
          couponCode: post.couponCode || null,
          redeemUrl: post.redeemUrl || null,
          offerTerms: post.offerTerms || null,
        },
      });
      created.push(p.id);
    }
    await logAudit({
      userId: user.id,
      userName: user.name,
      action: "post.multi_publish",
      entity: "post",
      newValue: { locationIds: requestedIds, count: created.length, skippedUnverified, errors },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });
    const publishedCount = created.length - (errors.length - skippedUnverified);
    const googleFailCount = Math.max(0, errors.length - skippedUnverified);
    const parts = [
      googleFailCount > 0 || skippedUnverified > 0
        ? `Created ${created.length} post(s)`
        : `Published to ${created.length} locations`,
    ];
    if (publishedCount >= 0 && googleFailCount > 0) {
      parts[0] = `Google published ${Math.max(0, created.length - googleFailCount)} · ${googleFailCount} failed (not live on GMB)`;
    }
    if (skippedUnverified > 0) parts.push(`${skippedUnverified} unverified skipped`);
    return ok(
      { created: created.length, ids: created, errors, skippedUnverified, googleFailCount },
      parts.join(" · "),
    );
  }

  return fail("Unknown action. Use: publish, schedule, archive, delete, publish-multi");
}
