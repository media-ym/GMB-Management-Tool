import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/seo/rankings?keywordId=&days=30 — rank history for a keyword (doc 10 §7, §15)
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "seo.view")) return forbidden();

  const url = new URL(req.url);
  const keywordId = url.searchParams.get("keywordId");
  const days = Math.min(parseInt(url.searchParams.get("days") || "30"), 365);

  if (!keywordId) {
    // Return all rankings summary across scoped locations
    const scoped = scopeLocationIds(user);
    const where: any = {};
    if (scoped) where.locationId = { in: scoped };
    const keywords = await db.keyword.findMany({
      where,
      include: { rankings: { orderBy: { checkedAt: "desc" }, take: 30, select: { rank: true, checkedAt: true, searchDate: true } } },
    });
    return ok(keywords.map(k => ({
      keywordId: k.id,
      keyword: k.keyword,
      history: k.rankings.map(r => ({ rank: r.rank, date: r.searchDate.toISOString(), checkedAt: r.checkedAt.toISOString() })),
    })));
  }

  const keyword = await db.keyword.findUnique({
    where: { id: keywordId },
    include: {
      rankings: {
        where: { checkedAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } },
        orderBy: { checkedAt: "asc" },
      },
      location: { select: { name: true, city: true } },
    },
  });
  if (!keyword) return ok({ keywordId, history: [] });

  return ok({
    keywordId,
    keyword: keyword.keyword,
    locationName: keyword.location?.name ?? "",
    locationCity: keyword.location?.city ?? "",
    history: keyword.rankings.map((r) => ({
      rank: r.rank,
      date: r.searchDate.toISOString(),
      checkedAt: r.checkedAt.toISOString(),
    })),
    stats: {
      current: keyword.rankings[keyword.rankings.length - 1]?.rank ?? null,
      best: keyword.rankings.length ? Math.min(...keyword.rankings.map((r) => r.rank).filter((r) => r > 0)) : null,
      worst: keyword.rankings.length ? Math.max(...keyword.rankings.map((r) => r.rank).filter((r) => r > 0)) : null,
      avg: keyword.rankings.length ? Math.round((keyword.rankings.reduce((a, r) => a + r.rank, 0) / keyword.rankings.length) * 10) / 10 : null,
    },
  });
}
