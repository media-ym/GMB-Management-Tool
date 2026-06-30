import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail, notFound } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { aiReviewReply } from "@/lib/ai";

export const dynamic = "force-dynamic";

// POST /api/reviews/[id]/reply — publish manual reply
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.reply")) return forbidden();

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const replyText: string | undefined = body.replyText;
  if (!replyText || replyText.trim().length < 3) return fail("replyText is required");

  const review = await db.review.findUnique({ where: { id }, include: { location: true } });
  if (!review) return notFound("Review not found");

  const updated = await db.review.update({
    where: { id },
    data: {
      replyText: replyText.trim(),
      replyStatus: "replied",
      replySource: "manual",
      replyBy: user.id,
      repliedAt: new Date(),
    },
  });

  await logAudit({
    userId: user.id, userName: user.name, action: "review.reply",
    entity: "review", entityId: id,
    newValue: { replyText: replyText.trim(), source: "manual" },
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

// GET /api/reviews/[id]/reply?ai=1 — generate AI suggestion
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.ai_reply")) return forbidden();

  const { id } = await params;
  const review = await db.review.findUnique({ where: { id }, include: { location: true } });
  if (!review) return notFound("Review not found");

  try {
    const { reply } = await aiReviewReply({
      user,
      locationName: review.location.name,
      authorName: review.authorName,
      rating: review.rating,
      reviewText: review.text,
    });
    await logAudit({
      userId: user.id, userName: user.name, action: "ai.generate",
      entity: "review_reply", entityId: id,
      newValue: { replyPreview: reply.slice(0, 120) },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });
    return ok({ reply }, "MiSA AI draft generated");
  } catch (e: any) {
    return fail(e.message || "AI generation failed", 500);
  }
}
