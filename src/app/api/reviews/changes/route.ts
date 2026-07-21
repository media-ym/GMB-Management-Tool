import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import {
  buildLocationIdFilter,
  parseLocationIdsParam,
  parseDateRangeFromSearchParams,
} from "@/lib/location-filter";

export const dynamic = "force-dynamic";

export interface ReviewChangeItem {
  id: string;
  reviewId: string | null;
  locationId: string;
  locationName: string;
  locationCity: string;
  googleReviewId: string;
  changeType: "deleted" | "edited";
  authorName: string;
  authorPhoto: string | null;
  previousRating: number | null;
  previousText: string | null;
  newRating: number | null;
  newText: string | null;
  detectedAt: string;
}

// GET /api/reviews/changes?type=deleted|edited&days=30&locationIds=
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || undefined;
  const locationIds = parseLocationIdsParam(url.searchParams.get("locationIds"));
  const changeType = url.searchParams.get("type") || undefined;
  const dateRange = parseDateRangeFromSearchParams(url.searchParams);

  try {
    const locFilter = buildLocationIdFilter(user, { locationId, locationIds });
    const baseWhere: Record<string, unknown> = { ...locFilter };
    if (dateRange) baseWhere.detectedAt = dateRange;

    const listWhere: Record<string, unknown> = { ...baseWhere };
    if (changeType === "deleted" || changeType === "edited") {
      listWhere.changeType = changeType;
    }

    const changes = await db.reviewChange.findMany({
      where: listWhere,
      orderBy: { detectedAt: "desc" },
      take: 500,
      include: { location: { select: { name: true, city: true } } },
    });

    const data: ReviewChangeItem[] = changes.map((c) => ({
      id: c.id,
      reviewId: c.reviewId,
      locationId: c.locationId,
      locationName: c.location.name,
      locationCity: c.location.city,
      googleReviewId: c.googleReviewId,
      changeType: c.changeType as "deleted" | "edited",
      authorName: c.authorName,
      authorPhoto: c.authorPhoto,
      previousRating: c.previousRating,
      previousText: c.previousText,
      newRating: c.newRating,
      newText: c.newText,
      detectedAt: c.detectedAt.toISOString(),
    }));

    const deletedCount = await db.reviewChange.count({
      where: { ...baseWhere, changeType: "deleted" },
    });
    const editedCount = await db.reviewChange.count({
      where: { ...baseWhere, changeType: "edited" },
    });

    return ok({ items: data, deletedCount, editedCount });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") return forbidden();
    throw e;
  }
}
