import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { buildLocationIdFilter, parseLocationIdsParam } from "@/lib/location-filter";
import { ensureDefaultLocationKeywords } from "@/lib/default-location-keywords";

export const dynamic = "force-dynamic";

// GET /api/seo/keywords — list all keywords with rank stats (doc 10 §6, §7)
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "seo.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || undefined;
  const locationIds = parseLocationIdsParam(url.searchParams.get("locationIds"));
  const scopedFilter = buildLocationIdFilter(user, { locationId, locationIds });

  const scoped = scopeLocationIds(user);
  const bootstrapIds = scoped?.filter((id) => id !== "__none__");
  await ensureDefaultLocationKeywords(
    bootstrapIds?.length ? { locationIds: bootstrapIds } : undefined,
  );

  const where: Record<string, unknown> = { ...scopedFilter };

  const keywords = await db.keyword.findMany({
    where,
    include: {
      rankings: { orderBy: { checkedAt: "desc" }, take: 50, select: { rank: true, checkedAt: true, searchDate: true } },
      location: { select: { name: true, city: true } },
    },
    orderBy: { keyword: "asc" },
  });

  const data = keywords.map((k) => {
    const ranks = k.rankings.map((r) => r.rank).filter((r) => r > 0);
    const currentRank = ranks[0] ?? null;
    const previousRank = ranks[1] ?? null;
    const bestRank = ranks.length ? Math.min(...ranks) : null;
    const worstRank = ranks.length ? Math.max(...ranks) : null;
    const rankChange = currentRank && previousRank ? previousRank - currentRank : 0; // positive = improvement
    return {
      id: k.id,
      keyword: k.keyword,
      city: k.city,
      state: k.state,
      status: k.status,
      locationId: k.locationId,
      locationName: k.location?.name ?? "",
      locationCity: k.location?.city ?? "",
      currentRank,
      previousRank,
      bestRank,
      worstRank,
      rankChange,
      rankHistory: k.rankings.slice(0, 30).map((r) => ({ rank: r.rank, date: r.searchDate.toISOString() })),
      trackingCount: k.rankings.length,
    };
  });

  return ok(data);
}

// POST /api/seo/keywords — add keyword (doc 10 §6)
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "seo.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { keyword, locationId, city, state } = body;
  if (!keyword) return fail("keyword required");

  // Check duplicate (doc 10 §22)
  const existing = await db.keyword.findFirst({ where: { keyword, locationId: locationId ?? null } });
  if (existing) return fail("Duplicate keyword for this location");

  const created = await db.keyword.create({
    data: { keyword, locationId: locationId || null, city: city || null, state: state || "Maharashtra", status: "active" },
  });
  await logAudit({ userId: user.id, userName: user.name, action: "keyword.create", entity: "keyword", entityId: created.id, newValue: { keyword, locationId }, ip: req.headers.get("x-forwarded-for") ?? undefined });
  return ok({ id: created.id }, "Keyword added");
}
