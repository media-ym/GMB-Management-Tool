import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import type { ReviewWithLocation } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || undefined;
  const status = url.searchParams.get("status") || undefined; // pending | replied | ignored
  const sentiment = url.searchParams.get("sentiment") || undefined;
  const minRating = url.searchParams.get("minRating");
  const maxRating = url.searchParams.get("maxRating");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  const scoped = scopeLocationIds(user, locationId);
  const where: any = {};
  if (scoped) where.locationId = { in: scoped };
  if (locationId && (!scoped || scoped.includes(locationId))) where.locationId = locationId;
  if (status) where.replyStatus = status;
  if (sentiment) where.sentiment = sentiment;
  if (minRating || maxRating) {
    where.rating = {};
    if (minRating) where.rating.gte = parseInt(minRating);
    if (maxRating) where.rating.lte = parseInt(maxRating);
  }

  const reviews = await db.review.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { location: { select: { name: true, city: true } } },
  });

  const data: ReviewWithLocation[] = reviews.map((r) => ({
    id: r.id,
    locationId: r.locationId,
    locationName: r.location.name,
    locationCity: r.location.city,
    googleReviewId: r.googleReviewId,
    authorName: r.authorName,
    authorPhoto: r.authorPhoto,
    rating: r.rating,
    text: r.text,
    sentiment: r.sentiment as any,
    replyText: r.replyText,
    replySource: r.replySource as any,
    replyStatus: r.replyStatus as any,
    repliedAt: r.repliedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  return ok(data);
}
