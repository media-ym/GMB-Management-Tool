import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { buildLocationIdFilter, parseLocationIdsParam } from "@/lib/location-filter";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "seo.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || undefined;
  const locationIds = parseLocationIdsParam(url.searchParams.get("locationIds"));
  const where: Record<string, unknown> = {
    ...buildLocationIdFilter(user, { locationId, locationIds }),
  };

  const audits = await db.seoAudit.findMany({
    where,
    orderBy: { auditedAt: "desc" },
    take: 50,
    include: { location: { select: { name: true, city: true } } },
  });

  return ok(audits.map((a) => ({
    id: a.id,
    locationId: a.locationId,
    locationName: a.location?.name ?? "",
    locationCity: a.location?.city ?? "",
    auditScore: a.auditScore,
    profileStrength: a.profileStrength,
    missingCategories: a.missingCategoriesJson ? JSON.parse(a.missingCategoriesJson) : [],
    missingPhotos: a.missingPhotos,
    missingServices: a.missingServices,
    recommendations: a.recommendationsJson ? JSON.parse(a.recommendationsJson) : [],
    auditedAt: a.auditedAt.toISOString(),
  })));
}
