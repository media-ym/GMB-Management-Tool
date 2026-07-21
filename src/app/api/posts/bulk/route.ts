import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { createGooglePost, getValidAccessToken, resolveV4LocationName } from "@/lib/google-service";
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
    const result = await db.post.updateMany({
      where: { id: { in: postIds }, status: { in: ["draft", "scheduled"] } },
      data: { status: "published", publishedAt: new Date(), scheduledAt: null },
    });
    await logAudit({ userId: user.id, userName: user.name, action: "bulk.post.publish", entity: "post", newValue: { postIds, count: result.count }, ip: req.headers.get("x-forwarded-for") ?? undefined });
    return ok({ updated: result.count }, `Published ${result.count} posts`);
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
    const validLocationIds = scoped ? locationIds.filter((id: string) => scoped.includes(id)) : locationIds;
    const created: string[] = [];
    const errors: string[] = [];

    for (const locId of validLocationIds) {
      let googlePostId: string | null = null;

      if (post.status === "published") {
        try {
          const authCheck = await requireClientAuth(locId, "post.create");
          if (authCheck.ok) {
            const gbp = await db.googleBusinessProfile.findFirst({ where: { locationId: locId } });
            if (gbp) {
              const accessToken = await getValidAccessToken();
              if (accessToken) {
                const googleTopicType = post.type === "offer" ? "OFFER" : post.type === "event" ? "EVENT" : "STANDARD";

                const googlePostData: any = { languageCode: "en", summary: post.content, topicType: googleTopicType };

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
                if (post.imageUrl && !post.imageUrl.includes("localhost")) {
                  googlePostData.media = [{ mediaFormat: "PHOTO", sourceUrl: post.imageUrl }];
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
                const gPost = await createGooglePost(accessToken, v4Name, googlePostData);
                googlePostId = gPost.name || null;
              }
            }
          }
        } catch (e: any) {
          errors.push(`${locId}: ${e.message}`);
        }
      }

      const p = await db.post.create({
        data: {
          locationId: locId,
          type: post.type,
          title: post.title || "",
          content: post.content,
          ctaType: post.ctaType ?? null,
          ctaUrl: post.ctaUrl ?? null,
          imageUrl: post.imageUrl ?? null,
          status: post.status || "draft",
          source: post.source || "manual",
          authorId: user.id,
          googlePostId,
          scheduledAt: post.scheduledAt ? new Date(post.scheduledAt) : null,
          recurrenceType: post.recurrenceType ?? null,
          recurrenceDayOfWeek: post.recurrenceDayOfWeek ?? null,
          recurrenceTime: post.recurrenceTime ?? null,
          publishedAt: post.status === "published" ? new Date() : null,
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
    await logAudit({ userId: user.id, userName: user.name, action: "post.multi_publish", entity: "post", newValue: { locationIds: validLocationIds, count: created.length, errors }, ip: req.headers.get("x-forwarded-for") ?? undefined });
    const msg = errors.length > 0
      ? `Published to ${created.length} locations (${errors.length} Google errors)`
      : `Published to ${created.length} locations`;
    return ok({ created: created.length, ids: created, errors }, msg);
  }

  return fail("Unknown action. Use: publish, schedule, archive, delete, publish-multi");
}
