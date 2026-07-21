import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok } from "@/lib/api-response";
import { assertCronAuthorized } from "@/lib/cron-auth";
import { createGooglePost, getValidAccessToken, resolveV4LocationName } from "@/lib/google-service";
import { computeNextWeeklyOccurrence } from "@/lib/post-recurrence";

export const dynamic = "force-dynamic";

function buildGooglePostPayload(post: {
  type: string;
  title: string;
  content: string;
  ctaType: string | null;
  ctaUrl: string | null;
  imageUrl: string | null;
  startDate: Date | null;
  startTime: string | null;
  endDate: Date | null;
  endTime: string | null;
  couponCode: string | null;
  redeemUrl: string | null;
  offerTerms: string | null;
}) {
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

  function buildDateObj(d: Date | null) {
    if (!d) return undefined;
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  }
  function buildTimeObj(t: string | null) {
    if (!t) return undefined;
    const [h, m] = t.split(":").map(Number);
    return { hours: h, minutes: m, seconds: 0, nanos: 0 };
  }

  if (post.type === "offer") {
    googlePostData.offer = {};
    if (post.couponCode) (googlePostData.offer as Record<string, string>).couponCode = post.couponCode;
    if (post.redeemUrl) (googlePostData.offer as Record<string, string>).redeemOnlineUrl = post.redeemUrl;
    if (post.offerTerms) (googlePostData.offer as Record<string, string>).termsConditions = post.offerTerms;
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

  if (post.imageUrl && !post.imageUrl.includes("localhost")) {
    googlePostData.media = [{ mediaFormat: "PHOTO", sourceUrl: post.imageUrl }];
  }

  return googlePostData;
}

// GET /api/cron/publish-scheduled — publish posts whose scheduledAt has passed
export async function GET(req: NextRequest) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  const now = new Date();
  const posts = await db.post.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: now },
    },
    include: {
      location: {
        include: { googleProfiles: true },
      },
    },
  });

  if (posts.length === 0) {
    return ok({ published: 0 }, "No scheduled posts due");
  }

  let published = 0;
  const errors: string[] = [];

  for (const post of posts) {
    try {
      let googlePostId: string | null = null;
      const gbp = post.location?.googleProfiles?.[0];

      if (gbp) {
        const accessToken = await getValidAccessToken();
        if (accessToken) {
          const googlePostData = buildGooglePostPayload(post);
          const v4Name = await resolveV4LocationName(accessToken, gbp.googleLocationId);
          const gPost = await createGooglePost(accessToken, v4Name, googlePostData);
          googlePostId = gPost.name || null;
        }
      }

      const isWeekly =
        post.recurrenceType === "weekly"
        && post.recurrenceDayOfWeek != null
        && post.recurrenceTime;

      if (isWeekly) {
        const nextRun = computeNextWeeklyOccurrence(
          post.recurrenceDayOfWeek!,
          post.recurrenceTime!,
          new Date(now.getTime() + 60_000),
        );
        await db.post.update({
          where: { id: post.id },
          data: {
            status: "scheduled",
            scheduledAt: nextRun,
            publishedAt: now,
            googlePostId: null,
          },
        });
      } else {
        await db.post.update({
          where: { id: post.id },
          data: {
            status: "published",
            publishedAt: now,
            googlePostId,
          },
        });
      }
      published++;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Publish failed";
      errors.push(`${post.id}: ${message}`);
      await db.post.update({
        where: { id: post.id },
        data: { status: "failed" },
      });
    }
  }

  return ok({ published, errors }, `Published ${published} of ${posts.length} scheduled post(s)`);
}
