import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "seo.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || undefined;
  const scoped = scopeLocationIds(user, locationId);
  const where: any = {};
  if (scoped) where.locationId = { in: scoped };
  if (locationId && (!scoped || scoped.includes(locationId))) where.locationId = locationId;

  const competitors = await db.competitor.findMany({
    where,
    include: {
      rankings: { include: { keyword: { select: { keyword: true } } }, orderBy: { checkedAt: "desc" }, take: 5 },
      location: { select: { name: true, city: true } },
    },
    orderBy: { businessName: "asc" },
  });

  return ok(competitors.map((c) => ({
    id: c.id,
    businessName: c.businessName,
    category: c.category,
    address: c.address,
    locationName: c.location?.name ?? "",
    locationCity: c.location?.city ?? "",
    isActive: c.isActive,
    rankings: c.rankings.map((r) => ({ keyword: r.keyword.keyword, ranking: r.ranking, checkedAt: r.checkedAt.toISOString() })),
    avgRank: c.rankings.length ? Math.round(c.rankings.reduce((a, r) => a + r.ranking, 0) / c.rankings.length * 10) / 10 : null,
  })));
}
