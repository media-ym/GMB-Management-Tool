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

// GET /api/analytics/export?locationIds=&days=30 or ?from=&to= — CSV export of analytics data (doc 11 §18)
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

  const rows = await db.analyticDaily.findMany({
    where,
    orderBy: { date: "asc" },
    include: { location: { select: { name: true, city: true } } },
  });

  const headers = ["Date", "Location", "City", "Search Views", "Maps Views", "Website Clicks", "Phone Calls", "Direction Requests", "Bookings"];
  const csvRows = rows.map(r => [
    r.date.toISOString().slice(0, 10),
    r.location.name,
    r.location.city,
    r.searchViews,
    r.mapsViews,
    r.websiteClicks,
    r.phoneCalls,
    r.directionRequests,
    r.bookings,
  ]);

  const csv = [headers.join(","), ...csvRows.map(r => r.join(","))].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="myfng-analytics-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
