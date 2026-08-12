import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { buildLocationIdFilter, parseLocationIdsParam } from "@/lib/location-filter";
import { getPlacesApiKey } from "@/lib/places-api-key";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "seo.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || undefined;
  const locationIds = parseLocationIdsParam(url.searchParams.get("locationIds"));
  const scopedFilter = buildLocationIdFilter(user, { locationId, locationIds });
  const keywordWhere = { ...scopedFilter, status: "active" as const };

  const rankingWhere =
    "locationId" in scopedFilter && scopedFilter.locationId
      ? { locationId: scopedFilter.locationId }
      : {};

  const [keywordCount, rankingCount, rankedKeywords, lastRanking] = await Promise.all([
    db.keyword.count({ where: keywordWhere }),
    db.keywordRanking.count({ where: rankingWhere }),
    db.keyword.count({
      where: {
        ...keywordWhere,
        rankings: { some: { rank: { gt: 0 } } },
      },
    }),
    db.keywordRanking.findFirst({
      where: rankingWhere,
      orderBy: { checkedAt: "desc" },
      select: { checkedAt: true },
    }),
  ]);

  return ok({
    keywordCount,
    rankingCount,
    rankedKeywords,
    lastCheckedAt: lastRanking?.checkedAt?.toISOString() ?? null,
    hasPlacesKey: Boolean(getPlacesApiKey()),
    usingDedicatedKey: Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim()),
    needsRankCheck: keywordCount > 0 && rankedKeywords === 0,
  });
}
