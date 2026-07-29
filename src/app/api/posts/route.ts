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
import { aiGeneratePost } from "@/lib/ai";
import { requireClientAuth } from "@/lib/client-auth";
import type { PostWithLocation } from "@/lib/types";
import { buildLocationIdFilter, parseLocationIdsParam } from "@/lib/location-filter";
import { computeNextWeeklyOccurrence } from "@/lib/post-recurrence";

export const dynamic = "force-dynamic";

function mapPostRow(p: {
  id: string;
  locationId: string;
  location: { name: string; city: string };
  type: string;
  title: string;
  content: string;
  ctaType: string | null;
  ctaUrl: string | null;
  imageUrl: string | null;
  status: string;
  source: string;
  scheduledAt: Date | null;
  recurrenceType: string | null;
  recurrenceDayOfWeek: number | null;
  recurrenceTime: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}): PostWithLocation {
  return {
    id: p.id,
    locationId: p.locationId,
    locationName: p.location.name,
    type: p.type as PostWithLocation["type"],
    title: p.title,
    content: p.content,
    ctaType: p.ctaType,
    ctaUrl: p.ctaUrl,
    imageUrl: p.imageUrl ?? null,
    status: p.status as PostWithLocation["status"],
    source: p.source as PostWithLocation["source"],
    scheduledAt: p.scheduledAt?.toISOString() ?? null,
    recurrenceType: p.recurrenceType === "weekly" ? "weekly" : null,
    recurrenceDayOfWeek: p.recurrenceDayOfWeek ?? null,
    recurrenceTime: p.recurrenceTime ?? null,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

function resolveScheduleFields(body: {
  status?: string;
  scheduledAt?: string;
  recurrenceType?: string | null;
  recurrenceDayOfWeek?: number | null;
  recurrenceTime?: string | null;
}) {
  if (body.status !== "scheduled") {
    return {
      scheduledAt: null as Date | null,
      recurrenceType: null as string | null,
      recurrenceDayOfWeek: null as number | null,
      recurrenceTime: null as string | null,
    };
  }

  if (body.recurrenceType === "weekly") {
    if (body.recurrenceDayOfWeek == null || !body.recurrenceTime) {
      throw new Error("Weekly schedule requires a day and time");
    }
    return {
      scheduledAt: computeNextWeeklyOccurrence(body.recurrenceDayOfWeek, body.recurrenceTime),
      recurrenceType: "weekly",
      recurrenceDayOfWeek: body.recurrenceDayOfWeek,
      recurrenceTime: body.recurrenceTime,
    };
  }

  return {
    scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : new Date(Date.now() + 86400000),
    recurrenceType: null,
    recurrenceDayOfWeek: null,
    recurrenceTime: null,
  };
}

// GET /api/posts — list
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || undefined;
  const locationIds = parseLocationIdsParam(url.searchParams.get("locationIds"));
  const status = url.searchParams.get("status") || undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  const where: Record<string, unknown> = {
    ...buildLocationIdFilter(user, { locationId, locationIds }),
  };
  if (status) where.status = status;

  const posts = await db.post.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { location: { select: { name: true, city: true } } },
  });

  const data: PostWithLocation[] = posts.map((p) => mapPostRow(p));

  return ok(data);
}

// POST /api/posts — create (manual or AI-generated)
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));

  // AI generation mode
  if (body.action === "ai_generate") {
    const { locationId, type, topic } = body;
    if (!locationId || !type || !topic) return fail("locationId, type, topic required for ai_generate");
    const loc = await db.location.findUnique({ where: { id: locationId } });
    if (!loc) return fail("Location not found", 404);
    try {
      const gen = await aiGeneratePost({ user, locationName: loc.name, type, topic });
      await logAudit({ userId: user.id, userName: user.name, action: "ai.generate", entity: "post", newValue: { locationId, type, topic, ...gen }, ip: req.headers.get("x-forwarded-for") ?? undefined });
      return ok(gen, "MiSA AI generated a post draft");
    } catch (e: any) {
      return fail(e.message || "AI generation failed", 500);
    }
  }

  // Create post
  const { locationId, type, title, content, ctaType, ctaUrl, imageUrl, status = "draft", scheduledAt } = body;
  if (!locationId || !type || !content) return fail("locationId, type, content required");
  if ((type === "offer" || type === "event") && !title) return fail("Title is required for Offer/Event posts");
  if (!can(user.role, "posts.view")) return forbidden();
  const scoped = scopeLocationIds(user, locationId);
  if (scoped && !scoped.includes(locationId)) return forbidden("Location out of scope");

  let scheduleFields;
  try {
    scheduleFields = resolveScheduleFields({
      status,
      scheduledAt,
      recurrenceType: body.recurrenceType,
      recurrenceDayOfWeek: body.recurrenceDayOfWeek,
      recurrenceTime: body.recurrenceTime,
    });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : "Invalid schedule", 400);
  }

  // ─── If publishing: push to REAL Google Business Profile ───────────────
  let googlePostId: string | null = null;
  if (status === "published") {
    // End-client authorization gate (Google Third-Party Policy). The
    // location's linked client must have an active authorization with the
    // "post.create" scope before we push the new post to Google.
    const authCheck = await requireClientAuth(locationId, "post.create");
    if (!authCheck.ok) return authCheck.response;

    const gbp = await db.googleBusinessProfile.findFirst({ where: { locationId } });
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
          // Map our post types to Google's LocalPost topicType
          // whats_new → STANDARD, offer → OFFER, event → EVENT, update → STANDARD
          const googleTopicType = type === "offer" ? "OFFER" : type === "event" ? "EVENT" : "STANDARD";

          const googlePostData: any = {
            languageCode: "en",
            summary: content,
            topicType: googleTopicType,
          };

          // CTA is only supported for STANDARD and EVENT, NOT for OFFER
          if (googleTopicType !== "OFFER") {
            const actionType = ctaType?.toUpperCase();
            const ctaPayload = (actionType && actionType !== "NONE")
              ? actionType === "CALL"
                ? { actionType: "CALL" }
                : ctaUrl ? { actionType, url: ctaUrl } : undefined
              : undefined;
            if (ctaPayload) googlePostData.callToAction = ctaPayload;
          }

          // Build date/time helpers
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

          // Offer-specific fields
          if (type === "offer") {
            googlePostData.offer = {};
            if (body.couponCode) googlePostData.offer.couponCode = body.couponCode;
            if (body.redeemUrl) googlePostData.offer.redeemOnlineUrl = body.redeemUrl;
            if (body.offerTerms) googlePostData.offer.termsConditions = body.offerTerms;
          }

          // Event-specific fields
          if (type === "event") {
            googlePostData.event = {
              title: title,
              schedule: {
                startDate: buildDateObj(body.startDate),
                startTime: buildTimeObj(body.startTime),
                endDate: buildDateObj(body.endDate),
                endTime: buildTimeObj(body.endTime),
              },
            };
          }

          // Offer also uses event.schedule for start/end dates
          if (type === "offer" && body.startDate) {
            googlePostData.event = {
              title: title,
              schedule: {
                startDate: buildDateObj(body.startDate),
                startTime: buildTimeObj(body.startTime),
                endDate: buildDateObj(body.endDate),
                endTime: buildTimeObj(body.endTime),
              },
            };
          }

          const v4Name = await resolveV4LocationName(accessToken, gbp.googleLocationId);
          await attachLocalPostMedia(accessToken, v4Name, googlePostData, imageUrl);
          const gPost = await createGooglePost(accessToken, v4Name, googlePostData);
          googlePostId = gPost.name || null;
        } catch (e: any) {
          await logAudit({ userId: user.id, userName: user.name, action: "post.google_failed", entity: "post", newValue: { locationId, error: e.message }, ip: req.headers.get("x-forwarded-for") ?? undefined });
          return fail(`Failed to publish to Google: ${e.message}`, 500);
        }
      }
    }
  }

  const post = await db.post.create({
    data: {
      locationId, type, title: title || "", content, ctaType, ctaUrl, imageUrl,
      status,
      source: body.source === "ai" ? "ai" : "manual",
      authorId: user.id,
      googlePostId,
      ...scheduleFields,
      publishedAt: status === "published" ? new Date() : null,
      startDate: body.startDate ? new Date(body.startDate) : null,
      startTime: body.startTime || null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      endTime: body.endTime || null,
      couponCode: body.couponCode || null,
      redeemUrl: body.redeemUrl || null,
      offerTerms: body.offerTerms || null,
    },
  });

  await logAudit({ userId: user.id, userName: user.name, action: "post.create", entity: "post", entityId: post.id, newValue: { locationId, type, title, status, googlePostId }, ip: req.headers.get("x-forwarded-for") ?? undefined });
  return ok({ id: post.id, status: post.status, googlePostId }, status === "published" ? "Post published to Google Business Profile" : "Post saved");
}
