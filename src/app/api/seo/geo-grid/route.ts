import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/seo/geo-grid?locationId=&keywordId=&size=5&radius=3 — configurable geo-grid (doc 10 §9)
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "seo.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId");
  const keywordId = url.searchParams.get("keywordId");
  const size = parseInt(url.searchParams.get("size") || "5"); // 3, 5, 7
  const radius = parseFloat(url.searchParams.get("radius") || "3"); // 1, 3, 5, 10 km

  if (!locationId) return ok({ grid: [], size, radius, avgRank: 0 });
  const scoped = scopeLocationIds(user, locationId);
  if (scoped && !scoped.includes(locationId)) return forbidden("Location out of scope");

  const location = await db.location.findUnique({ where: { id: locationId }, select: { latitude: true, longitude: true, name: true, city: true } });
  if (!location) return ok({ grid: [], size, radius, avgRank: 0 });

  const rankings = await db.keywordRanking.findMany({
    where: { locationId, keywordId: keywordId || undefined },
    orderBy: { checkedAt: "desc" },
    take: size * size,
  });

  let grid: { lat: number; lng: number; rank: number }[] = [];
  if (rankings.length >= size * size) {
    grid = rankings.slice(0, size * size).map(r => ({ lat: r.lat, lng: r.lng, rank: r.rank }));
  }

  const ranks = grid.map(g => g.rank).filter(r => r > 0);
  const avgRank = ranks.length ? Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10) / 10 : 0;
  const top3 = ranks.filter(r => r <= 3).length;
  const top10 = ranks.filter(r => r <= 10).length;

  return ok({
    location: { name: location.name, city: location.city, latitude: location.latitude, longitude: location.longitude },
    keywordId,
    size,
    radius,
    grid,
    summary: { avgRank, top3Count: top3, top10Count: top10, totalPoints: grid.length },
  });
}
