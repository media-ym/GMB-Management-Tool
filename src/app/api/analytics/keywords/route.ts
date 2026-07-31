import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, fail, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { getSearchKeywords, getValidAccessToken } from "@/lib/google-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "analytics.view")) return forbidden();

  const url = new URL(req.url);
  const locationIdsParam = url.searchParams.get("locationIds")?.split(",").filter(Boolean) || null;
  const months = Math.min(parseInt(url.searchParams.get("months") || "6"), 12);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "100") || 100, 1), 200);

  const scoped = scopeLocationIds(user);

  let locationIds: string[];
  if (locationIdsParam) {
    locationIds = scoped ? locationIdsParam.filter((id) => scoped.includes(id)) : locationIdsParam;
  } else {
    const locs = await db.location.findMany({
      where: scoped ? { id: { in: scoped } } : {},
      select: { id: true },
    });
    locationIds = locs.map((l) => l.id);
  }

  if (locationIds.length === 0) {
    return ok({ keywords: [] });
  }

  const gbps = await db.googleBusinessProfile.findMany({
    where: { locationId: { in: locationIds } },
    select: { locationId: true, googleLocationId: true },
  });

  if (gbps.length === 0) {
    return ok({ keywords: [] });
  }

  // Prefer portal/client token when all locations share a client; else per-location
  const portalToken =
    user.role === "client_portal" && user.clientId
      ? await getValidAccessToken({ clientId: user.clientId })
      : null;

  const aggregated = new Map<string, number>();

  await Promise.allSettled(
    gbps.map(async (gbp) => {
      const accessToken =
        portalToken || (await getValidAccessToken({ locationId: gbp.locationId }));
      if (!accessToken) return;
      const keywords = await getSearchKeywords(accessToken, gbp.googleLocationId, months);
      for (const kw of keywords) {
        aggregated.set(kw.keyword, (aggregated.get(kw.keyword) ?? 0) + kw.impressions);
      }
    }),
  );

  const result = Array.from(aggregated.entries())
    .map(([keyword, impressions]) => ({ keyword, impressions }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit);

  return ok({ keywords: result });
}
