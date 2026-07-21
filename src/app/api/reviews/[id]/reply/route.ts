import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail, notFound } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { replyToReview, deleteReviewReply, getValidAccessToken } from "@/lib/google-service";
import { aiReviewReply } from "@/lib/ai";
import { requireClientAuth } from "@/lib/client-auth";
import {
  substituteReviewReplyTemplate,
  inferLocationCategory,
} from "@/lib/auto-reply";

export const dynamic = "force-dynamic";

// POST /api/reviews/[id]/reply — publish manual reply
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.reply")) return forbidden();

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const replyText: string | undefined = body.replyText;
  const replySource = body.replySource === "template" ? "template" : "manual";
  if (!replyText || replyText.trim().length < 3) return fail("replyText is required");

  const review = await db.review.findUnique({
    where: { id },
    include: {
      location: {
        include: { googleProfiles: true },
      },
    },
  });
  if (!review) return notFound("Review not found");

  const finalReply = substituteReviewReplyTemplate(replyText.trim(), {
    customerName: review.authorName,
    businessName: review.location.name,
    category: inferLocationCategory(review.location.categoriesJson),
    address: review.location.address,
    area: review.location.city,
    city: review.location.city,
    phone: review.location.phone ?? undefined,
    managerName: user.name,
    rating: review.rating,
  });

  if (finalReply.length < 3) return fail("Reply text is too short after template substitution");

  // ─── End-client authorization gate (Google Third-Party Policy) ──────────
  // The location's linked client must have an active authorization that
  // includes the "review.reply" scope before we can push the reply to Google.
  const authCheck = await requireClientAuth(review.locationId, "review.reply");
  if (!authCheck.ok) return authCheck.response;

  // ─── Push reply to REAL Google Business Profile ────────────────────────
  const gbp = review.location?.googleProfiles?.[0];
  if (gbp && review.googleReviewId) {
    const accessToken = await getValidAccessToken();
    if (accessToken) {
      try {
        await replyToReview(accessToken, review.googleReviewId, finalReply);
      } catch (e: any) {
        await logAudit({
          userId: user.id, userName: user.name, action: "review.reply_google_failed",
          entity: "review", entityId: id, newValue: { error: e.message },
          ip: req.headers.get("x-forwarded-for") ?? undefined,
        });
        return fail(`Failed to publish reply to Google: ${e.message}`, 500);
      }
    }
  }

  const updated = await db.review.update({
    where: { id },
    data: {
      replyText: finalReply,
      replyStatus: "replied",
      replySource,
      replyBy: user.id,
      repliedAt: new Date(),
    },
  });

  await logAudit({
    userId: user.id, userName: user.name, action: "review.reply",
    entity: "review", entityId: id,
    newValue: { replyText: finalReply, source: replySource },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok({ id: updated.id, replyStatus: updated.replyStatus }, "Reply published to Google Business Profile");
}

// PATCH /api/reviews/[id]/reply — ignore review
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.reply")) return forbidden();

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (body.action === "ignore") {
    const updated = await db.review.update({ where: { id }, data: { replyStatus: "ignored" } });
    await logAudit({ userId: user.id, userName: user.name, action: "review.ignore", entity: "review", entityId: id, ip: req.headers.get("x-forwarded-for") ?? undefined });
    return ok({ id: updated.id, replyStatus: updated.replyStatus }, "Review marked as ignored");
  }
  return fail("Unknown action");
}

// GET /api/reviews/[id]/reply?ai=1&model=... — generate AI suggestion via OpenRouter
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.ai_reply")) return forbidden();

  const { id } = await params;
  const review = await db.review.findUnique({ where: { id }, include: { location: true } });
  if (!review) return notFound("Review not found");

  const { isValidOpenRouterModel, DEFAULT_OPENROUTER_MODEL } = await import("@/lib/openrouter-models");
  const requested = req.nextUrl.searchParams.get("model") || DEFAULT_OPENROUTER_MODEL;
  const model = isValidOpenRouterModel(requested) ? requested : DEFAULT_OPENROUTER_MODEL;

  try {
    const { reply } = await aiReviewReply({
      user,
      locationName: review.location.name,
      authorName: review.authorName,
      rating: review.rating,
      reviewText: review.text,
      model,
    });
    await logAudit({
      userId: user.id, userName: user.name, action: "ai.generate",
      entity: "review_reply", entityId: id,
      newValue: { replyPreview: reply.slice(0, 120), model },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });
    return ok({ reply, model }, "MiSA AI draft generated");
  } catch (e: any) {
    return fail(e.message || "AI generation failed", 500);
  }
}

// DELETE /api/reviews/[id]/reply — remove a previously published reply from Google + DB
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.reply")) return forbidden();

  const { id } = await params;
  const review = await db.review.findUnique({
    where: { id },
    include: { location: { include: { googleProfiles: true } } },
  });
  if (!review) return notFound("Review not found");

  // ─── Push delete to REAL Google Business Profile ───────────────────────
  const gbp = review.location?.googleProfiles?.[0];
  if (gbp && review.googleReviewId && review.replyStatus === "replied") {
    const accessToken = await getValidAccessToken();
    if (accessToken) {
      try {
        await deleteReviewReply(accessToken, review.googleReviewId);
      } catch (e: any) {
        await logAudit({
          userId: user.id, userName: user.name, action: "review.reply_delete_google_failed",
          entity: "review", entityId: id, newValue: { error: e.message },
          ip: req.headers.get("x-forwarded-for") ?? undefined,
        });
        return fail(`Failed to delete reply on Google: ${e.message}`, 500);
      }
    }
  }

  const updated = await db.review.update({
    where: { id },
    data: {
      replyText: null,
      replyStatus: "pending",
      replySource: null,
      repliedAt: null,
      replyBy: null,
    },
  });

  await logAudit({
    userId: user.id, userName: user.name, action: "review.reply_deleted",
    entity: "review", entityId: id,
    newValue: { previousStatus: "replied", newStatus: "pending" },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok({ id: updated.id, replyStatus: updated.replyStatus }, "Reply removed from Google Business Profile");
}
