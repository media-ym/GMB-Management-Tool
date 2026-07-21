import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { parseDateRangeFromSearchParams } from "@/lib/location-filter";

export const dynamic = "force-dynamic";

function buildAnalyticsDateWhere(searchParams: URLSearchParams) {
  const parsed = parseDateRangeFromSearchParams(searchParams);
  if (parsed) return parsed;
  const days = Math.min(parseInt(searchParams.get("days") || "30", 10), 90);
  return { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
}

// GET /api/analytics/location-comparison?days=30&locationIds= — compare multiple locations (doc 11 §10)
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "analytics.view")) return forbidden();

  const url = new URL(req.url);
  const filterLocationIds = url.searchParams.get("locationIds")?.split(",").filter(Boolean) || null;
  const scoped = scopeLocationIds(user);
  const dateWhere = buildAnalyticsDateWhere(url.searchParams);

  let effectiveIds: string[] | null = scoped ?? null;
  if (filterLocationIds?.length) {
    effectiveIds = scoped ? filterLocationIds.filter((id) => scoped.includes(id)) : filterLocationIds;
  }

  const where: Record<string, unknown> = {};
  if (effectiveIds?.length) where.id = { in: effectiveIds };

  const locations = await db.location.findMany({
    where,
    select: {
      id: true, name: true, city: true, avgRating: true, reviewCount: true,
      healthScore: true, visibilityScore: true,
    },
    orderBy: { city: "asc" },
  });

  const comparison = await Promise.all(
    locations.map(async (loc) => {
      const agg = await db.analyticDaily.aggregate({
        where: { locationId: loc.id, date: dateWhere },
        _sum: { searchViews: true, mapsViews: true, websiteClicks: true, phoneCalls: true, directionRequests: true },
      });
      const postsCount = await db.post.count({
        where: {
          locationId: loc.id,
          status: "published",
          publishedAt: dateWhere,
        },
      });
      const repliedReviews = await db.review.count({
        where: { locationId: loc.id, replyStatus: "replied" },
      });
      const responseRate = loc.reviewCount > 0
        ? Math.round((repliedReviews / loc.reviewCount) * 100)
        : 0;

      return {
        id: loc.id,
        name: loc.name,
        city: loc.city,
        avgRating: loc.avgRating,
        reviewCount: loc.reviewCount,
        responseRate,
        searchViews: agg._sum.searchViews ?? 0,
        mapsViews: agg._sum.mapsViews ?? 0,
        websiteClicks: agg._sum.websiteClicks ?? 0,
        phoneCalls: agg._sum.phoneCalls ?? 0,
        directionRequests: agg._sum.directionRequests ?? 0,
        postsPublished: postsCount,
        seoScore: loc.healthScore,
        visibilityScore: loc.visibilityScore,
      };
    }),
  );

  return ok(comparison);
}
