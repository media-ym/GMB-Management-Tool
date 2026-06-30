import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import type { AnalyticsPoint } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/analytics?locationId=&days=30
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "analytics.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || undefined;
  const days = Math.min(parseInt(url.searchParams.get("days") || "30"), 90);

  const scoped = scopeLocationIds(user, locationId);
  const where: any = { date: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } };
  if (scoped) where.locationId = { in: scoped };
  if (locationId && (!scoped || scoped.includes(locationId))) where.locationId = locationId;

  const rows = await db.analyticDaily.findMany({
    where,
    orderBy: { date: "asc" },
  });

  // Aggregate per date across all scoped locations
  const byDate = new Map<string, AnalyticsPoint>();
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 10);
    const existing = byDate.get(key) ?? { date: key, searchViews: 0, mapsViews: 0, websiteClicks: 0, phoneCalls: 0, directionRequests: 0 };
    existing.searchViews += r.searchViews;
    existing.mapsViews += r.mapsViews;
    existing.websiteClicks += r.websiteClicks;
    existing.phoneCalls += r.phoneCalls;
    existing.directionRequests += r.directionRequests;
    byDate.set(key, existing);
  }

  // Per-location totals (for comparison)
  const perLocation = await db.analyticDaily.groupBy({
    by: ["locationId"],
    where,
    _sum: { searchViews: true, mapsViews: true, websiteClicks: true, phoneCalls: true, directionRequests: true },
  });
  const locationIds = [...new Set(perLocation.map((p) => p.locationId))];
  const locations = await db.location.findMany({ where: { id: { in: locationIds } }, select: { id: true, name: true, city: true } });
  const perLocationNamed = perLocation.map((p) => {
    const loc = locations.find((l) => l.id === p.locationId);
    return { locationId: p.locationId, name: loc?.name ?? "", city: loc?.city ?? "", totals: p._sum };
  }).sort((a, b) => (b.totals.searchViews ?? 0) - (a.totals.searchViews ?? 0));

  return ok({
    series: Array.from(byDate.values()),
    perLocation: perLocationNamed,
    totals: perLocation.reduce(
      (acc, p) => ({
        searchViews: acc.searchViews + (p._sum.searchViews ?? 0),
        mapsViews: acc.mapsViews + (p._sum.mapsViews ?? 0),
        websiteClicks: acc.websiteClicks + (p._sum.websiteClicks ?? 0),
        phoneCalls: acc.phoneCalls + (p._sum.phoneCalls ?? 0),
        directionRequests: acc.directionRequests + (p._sum.directionRequests ?? 0),
      }),
      { searchViews: 0, mapsViews: 0, websiteClicks: 0, phoneCalls: 0, directionRequests: 0 },
    ),
  });
}
