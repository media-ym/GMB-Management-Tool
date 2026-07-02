import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// POST /api/seo/refresh — trigger rank refresh (doc 10 §8)
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "seo.manage") && !can(user.role, "system.sync")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const locationId = body.locationId;
  const scoped = scopeLocationIds(user, locationId);
  const where: any = {};
  if (scoped) where.locationId = { in: scoped };
  if (locationId && (!scoped || scoped.includes(locationId))) where.locationId = locationId;

  // Get all keywords in scope
  const keywords = await db.keyword.findMany({ where, select: { id: true, keyword: true, locationId: true, location: { select: { latitude: true, longitude: true } } } });
  const now = new Date();
  let refreshed = 0;

  for (const k of keywords) {
    // Generate fresh rankings (mock — in production this calls Google's rank API)
    const lat = k.location?.latitude ?? 19.0;
    const lng = k.location?.longitude ?? 73.0;
    // 5x5 grid refresh
    for (let gx = -2; gx <= 2; gx++) {
      for (let gy = -2; gy <= 2; gy++) {
        const gridLat = lat + gy * 0.012;
        const gridLng = lng + gx * 0.012;
        const rankBucket = Math.abs(gx) + Math.abs(gy);
        const rank = rankBucket === 0 ? 1 + Math.floor(Math.random() * 2) : rankBucket === 1 ? 1 + Math.floor(Math.random() * 5) : rankBucket === 2 ? 3 + Math.floor(Math.random() * 8) : rankBucket === 3 ? 8 + Math.floor(Math.random() * 12) : 15 + Math.floor(Math.random() * 20);
        await db.keywordRanking.create({
          data: { keywordId: k.id, locationId: k.locationId!, lat: gridLat, lng: gridLng, rank, searchDate: now, checkedAt: now },
        });
      }
    }
    refreshed++;
  }

  await logAudit({ userId: user.id, userName: user.name, action: "seo.refresh", entity: "keyword", newValue: { refreshed, locationId: locationId ?? "all" }, ip: req.headers.get("x-forwarded-for") ?? undefined });
  return ok({ refreshed, timestamp: now.toISOString() }, `Refreshed rankings for ${refreshed} keywords`);
}
