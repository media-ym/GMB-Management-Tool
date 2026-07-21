import { db } from "@/lib/db";
import type { Sentiment } from "@/lib/types";
import { processAutoRepliesForReviews } from "@/lib/review-auto-reply";

export interface GoogleReviewPayload {
  name: string;
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string };
  reviewReply?: { comment?: string; updateTime?: string };
}

export function googleStarToRating(starRating?: string): number {
  if (starRating === "FIVE") return 5;
  if (starRating === "FOUR") return 4;
  if (starRating === "THREE") return 3;
  if (starRating === "TWO") return 2;
  return 1;
}

export function sentimentFromRating(rating: number): Sentiment {
  if (rating >= 4) return "positive";
  if (rating === 3) return "neutral";
  return "negative";
}

function normalizeText(text: string) {
  return text.trim();
}

async function recordReviewChange(opts: {
  reviewId: string | null;
  locationId: string;
  googleReviewId: string;
  changeType: "deleted" | "edited";
  authorName: string;
  authorPhoto?: string | null;
  previousRating?: number;
  previousText?: string;
  newRating?: number;
  newText?: string;
}) {
  await db.reviewChange.create({
    data: {
      reviewId: opts.reviewId,
      locationId: opts.locationId,
      googleReviewId: opts.googleReviewId,
      changeType: opts.changeType,
      authorName: opts.authorName,
      authorPhoto: opts.authorPhoto ?? null,
      previousRating: opts.previousRating ?? null,
      previousText: opts.previousText ?? null,
      newRating: opts.newRating ?? null,
      newText: opts.newText ?? null,
    },
  });
}

/** Upsert reviews from Google and detect deletions/edits vs last sync. */
export async function syncLocationReviewsFromGoogle(
  locationId: string,
  googleReviews: GoogleReviewPayload[],
): Promise<{ created: number; edited: number; deleted: number; autoReplied: number }> {
  const stats = { created: 0, edited: 0, deleted: 0, autoReplied: 0 };
  const seenGoogleIds = new Set<string>();
  const newReviewIds: string[] = [];

  for (const review of googleReviews) {
    const googleReviewId = review.name;
    if (!googleReviewId) continue;
    seenGoogleIds.add(googleReviewId);

    const rating = googleStarToRating(review.starRating);
    const text = review.comment || "";
    const googleHasReply = !!review.reviewReply?.comment;
    const existing = await db.review.findUnique({ where: { googleReviewId } });

    if (!existing) {
      const created = await db.review.create({
        data: {
          locationId,
          googleReviewId,
          authorName: review.reviewer?.displayName || "Anonymous",
          authorPhoto: review.reviewer?.profilePhotoUrl || null,
          rating,
          text,
          sentiment: sentimentFromRating(rating),
          replyText: review.reviewReply?.comment || null,
          replySource: review.reviewReply ? "manual" : null,
          replyStatus: review.reviewReply ? "replied" : "pending",
          repliedAt: review.reviewReply ? new Date(review.reviewReply.updateTime!) : null,
          createdAt: review.createTime ? new Date(review.createTime) : new Date(),
          syncStatus: "synced",
          deletedAt: null,
        },
      });
      stats.created++;
      if (!googleHasReply) newReviewIds.push(created.id);
      continue;
    }

    // Review reappeared on Google after being marked deleted locally
    if (existing.syncStatus === "deleted") {
      await db.review.update({
        where: { googleReviewId },
        data: {
          syncStatus: "synced",
          deletedAt: null,
          rating,
          text,
          sentiment: sentimentFromRating(rating),
          authorName: review.reviewer?.displayName || existing.authorName,
          authorPhoto: review.reviewer?.profilePhotoUrl || existing.authorPhoto,
        },
      });
    }

    const ratingChanged = existing.rating !== rating;
    const textChanged = normalizeText(existing.text) !== normalizeText(text);
    if (existing.syncStatus !== "deleted" && (ratingChanged || textChanged)) {
      await recordReviewChange({
        reviewId: existing.id,
        locationId,
        googleReviewId,
        changeType: "edited",
        authorName: existing.authorName,
        authorPhoto: existing.authorPhoto,
        previousRating: existing.rating,
        previousText: existing.text,
        newRating: rating,
        newText: text,
      });
      await db.review.update({
        where: { googleReviewId },
        data: {
          rating,
          text,
          sentiment: sentimentFromRating(rating),
        },
      });
      stats.edited++;
    }

    const localHasReply = existing.replyStatus === "replied";
    if (localHasReply && !googleHasReply) {
      await db.review.update({
        where: { googleReviewId },
        data: { replyText: null, replyStatus: "pending", replySource: null, repliedAt: null, replyBy: null },
      });
    } else if (!localHasReply && googleHasReply) {
      await db.review.update({
        where: { googleReviewId },
        data: {
          replyText: review.reviewReply!.comment,
          replyStatus: "replied",
          replySource: "manual",
          repliedAt: new Date(review.reviewReply!.updateTime!),
        },
      });
    }
  }

  const activeLocal = await db.review.findMany({
    where: { locationId, syncStatus: "synced" },
    select: { id: true, googleReviewId: true, authorName: true, authorPhoto: true, rating: true, text: true },
  });

  for (const local of activeLocal) {
    if (seenGoogleIds.has(local.googleReviewId)) continue;

    await recordReviewChange({
      reviewId: local.id,
      locationId,
      googleReviewId: local.googleReviewId,
      changeType: "deleted",
      authorName: local.authorName,
      authorPhoto: local.authorPhoto,
      previousRating: local.rating,
      previousText: local.text,
    });
    await db.review.update({
      where: { id: local.id },
      data: { syncStatus: "deleted", deletedAt: new Date() },
    });
    stats.deleted++;
  }

  const reviewAgg = await db.review.aggregate({
    where: { locationId, syncStatus: "synced" },
    _avg: { rating: true },
    _count: { id: true },
  });
  const avgRating = reviewAgg._avg.rating ?? 0;
  const reviewCount = reviewAgg._count.id ?? 0;
  await db.location.update({
    where: { id: locationId },
    data: { avgRating, reviewCount },
  });
  const gbp = await db.googleBusinessProfile.findFirst({ where: { locationId } });
  if (gbp) {
    await db.googleBusinessProfile.update({
      where: { id: gbp.id },
      data: { averageRating: avgRating, totalReviews: reviewCount },
    });
  }

  if (newReviewIds.length > 0) {
    const auto = await processAutoRepliesForReviews(newReviewIds);
    stats.autoReplied = auto.replied;
  }

  return stats;
}
