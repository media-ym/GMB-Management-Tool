import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { buildLocationIdFilter, parseLocationIdsParam } from "@/lib/location-filter";

export const dynamic = "force-dynamic";

// GET /api/seo?locationId=&view=keywords|geogrid
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "seo.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || undefined;
  const locationIds = parseLocationIdsParam(url.searchParams.get("locationIds"));
  const where: Record<string, unknown> = {
    ...buildLocationIdFilter(user, { locationId, locationIds }),
  };

  const keywords = await db.keyword.findMany({
    where,
    include: {
      rankings: {
        orderBy: { checkedAt: "desc" },
        take: 25, // latest geo-grid (5x5)
      },
      location: { select: { name: true, city: true } },
    },
    orderBy: { keyword: "asc" },
  });

  const data = keywords.map((k) => {
    const ranks = k.rankings.map((r) => r.rank);
    const avgRank = ranks.length ? ranks.filter((r) => r > 0).reduce((a, b) => a + b, 0) / Math.max(1, ranks.filter((r) => r > 0).length) : 0;
    const topRank = ranks.length ? Math.min(...ranks.filter((r) => r > 0).concat([99])) : 99;
    return {
      id: k.id,
      keyword: k.keyword,
      city: k.city,
      locationId: k.locationId,
      locationName: k.location?.name ?? "",
      avgRank: Math.round(avgRank * 10) / 10,
      topRank: topRank === 99 ? null : topRank,
      grid: k.rankings.map((r) => ({ lat: r.lat, lng: r.lng, rank: r.rank })),
      gridPoints: k.rankings.length,
    };
  });

  // Overview stats
  const allRanks = data.flatMap((d) => d.grid.map((g) => g.rank).filter((r) => r > 0));
  const overallAvg = allRanks.length ? allRanks.reduce((a, b) => a + b, 0) / allRanks.length : 0;
  const top3Count = allRanks.filter((r) => r <= 3).length;
  const top10Count = allRanks.filter((r) => r <= 10).length;

  return ok({
    keywords: data,
    overview: {
      totalKeywords: data.length,
      avgRank: Math.round(overallAvg * 10) / 10,
      top3Count,
      top10Count,
      totalGridPoints: allRanks.length,
    },
  });
}
