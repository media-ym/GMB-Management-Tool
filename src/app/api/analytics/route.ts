import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { isGoogleOAuthConnected } from "@/lib/google-service";
import { parseDateRangeFromSearchParams } from "@/lib/location-filter";
import type { AnalyticsPoint } from "@/lib/types";

export const dynamic = "force-dynamic";

function buildAnalyticsDateWhere(searchParams: URLSearchParams) {
  const parsed = parseDateRangeFromSearchParams(searchParams);
  if (parsed) return parsed;
  const days = Math.min(parseInt(searchParams.get("days") || "30", 10), 365);
  return { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
}

// GET /api/analytics?locationIds=&days=30 or ?from=&to=
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "analytics.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || undefined;
  const locationIdsParam = url.searchParams.get("locationIds")?.split(",").filter(Boolean) || null;

  const scoped = scopeLocationIds(user, locationId);
  const where: Record<string, unknown> = { date: buildAnalyticsDateWhere(url.searchParams) };
  if (locationIdsParam?.length) {
    const filtered = scoped ? locationIdsParam.filter((id) => scoped.includes(id)) : locationIdsParam;
    where.locationId = { in: filtered.length > 0 ? filtered : ["__none__"] };
  } else if (scoped) {
    where.locationId = { in: scoped };
  }
  if (locationId && (!scoped || scoped.includes(locationId))) where.locationId = locationId;

  const googleConnected = await isGoogleOAuthConnected(
    user.role === "client_portal" ? user.clientId : undefined,
  );
  if (!googleConnected) {
    return ok({
      googleConnected: false,
      series: [] as AnalyticsPoint[],
      perLocation: [],
      totals: { searchViews: 0, mapsViews: 0, websiteClicks: 0, phoneCalls: 0, directionRequests: 0 },
    });
  }

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
    googleConnected: true,
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
