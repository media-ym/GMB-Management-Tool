import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { createGooglePost, getValidAccessToken } from "@/lib/google-service";
import { aiGeneratePost } from "@/lib/ai";
import { requireClientAuth } from "@/lib/client-auth";
import type { PostWithLocation } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/posts — list
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  const scoped = scopeLocationIds(user, locationId);
  const where: any = {};
  if (scoped) where.locationId = { in: scoped };
  if (locationId && (!scoped || scoped.includes(locationId))) where.locationId = locationId;
  if (status) where.status = status;

  const posts = await db.post.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { location: { select: { name: true, city: true } } },
  });

  const data: PostWithLocation[] = posts.map((p) => ({
    id: p.id, locationId: p.locationId, locationName: p.location.name, type: p.type as any,
    title: p.title, content: p.content, ctaType: p.ctaType, ctaUrl: p.ctaUrl,
    status: p.status as any, source: p.source as any,
    scheduledAt: p.scheduledAt?.toISOString() ?? null, publishedAt: p.publishedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  }));

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
  const { locationId, type, title, content, ctaType, ctaUrl, status = "draft", scheduledAt } = body;
  if (!locationId || !type || !title || !content) return fail("locationId, type, title, content required");
  if (!can(user.role, "posts.view")) return forbidden();
  const scoped = scopeLocationIds(user, locationId);
  if (scoped && !scoped.includes(locationId)) return forbidden("Location out of scope");

  // ─── If publishing: push to REAL Google Business Profile ───────────────
  let googlePostId: string | null = null;
  if (status === "published") {
    // End-client authorization gate (Google Third-Party Policy). The
    // location's linked client must have an active authorization with the
    // "post.create" scope before we push the new post to Google.
    const authCheck = await requireClientAuth(locationId, "post.create");
    if (!authCheck.ok) return authCheck.response;

    const gbp = await db.googleBusinessProfile.findFirst({ where: { locationId } });
    if (gbp) {
      const accessToken = await getValidAccessToken();
      if (accessToken) {
        try {
          // Map our post types to Google's LocalPost topicType
          // whats_new → STANDARD, offer → OFFER, event → EVENT, update → STANDARD
          const googleTopicType = type === "offer" ? "OFFER" : type === "event" ? "EVENT" : "STANDARD";

          const googlePostData: any = {
            languageCode: "en",
            summary: content,
            topicType: googleTopicType,
            callToAction: ctaType ? { actionType: ctaType.toUpperCase(), url: ctaUrl || undefined } : undefined,
          };

          // Add title for all types
          if (title) googlePostData.title = title;

          // Offer-specific fields
          if (type === "offer") {
            googlePostData.offer = {
              couponCode: body.couponCode || undefined,
              redeemUrl: ctaUrl || undefined,
              termsAndConditions: body.offerTerms || undefined,
            };
          }

          // Event-specific fields
          if (type === "event") {
            googlePostData.event = {
              title: title,
              schedule: {
                startDate: body.startDate ? { year: new Date(body.startDate).getFullYear(), month: new Date(body.startDate).getMonth() + 1, day: new Date(body.startDate).getDate() } : undefined,
                endDate: body.endDate ? { year: new Date(body.endDate).getFullYear(), month: new Date(body.endDate).getMonth() + 1, day: new Date(body.endDate).getDate() } : undefined,
              },
            };
          }

          const gPost = await createGooglePost(accessToken, gbp.googleLocationId, googlePostData);
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
      locationId, type, title, content, ctaType, ctaUrl,
      status,
      source: body.source === "ai" ? "ai" : "manual",
      authorId: user.id,
      googlePostId,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : (status === "scheduled" ? new Date(Date.now() + 86400000) : null),
      publishedAt: status === "published" ? new Date() : null,
    },
  });

  await logAudit({ userId: user.id, userName: user.name, action: "post.create", entity: "post", entityId: post.id, newValue: { locationId, type, title, status, googlePostId }, ip: req.headers.get("x-forwarded-for") ?? undefined });
  return ok({ id: post.id, status: post.status, googlePostId }, status === "published" ? "Post published to Google Business Profile" : "Post saved");
}
