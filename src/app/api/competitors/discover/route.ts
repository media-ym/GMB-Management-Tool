import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, fail, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { discoverCompetitorsForLocation } from "@/lib/places-competitors";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "seo.manage")) return forbidden();

  try {
    const body = await req.json().catch(() => ({}));
    const locationId = body.locationId as string | undefined;
    if (!locationId) return fail("locationId is required");

    const scoped = scopeLocationIds(user);
    if (scoped && !scoped.includes(locationId)) return forbidden();

    const location = await db.location.findUnique({ where: { id: locationId }, select: { id: true } });
    if (!location) return fail("Location not found", 404);

    const result = await discoverCompetitorsForLocation(locationId, {
      radiusMeters: body.radiusMeters ? Number(body.radiusMeters) : 5000,
      maxResults: body.maxResults ? Number(body.maxResults) : 12,
      allowBootstrap: body.allowBootstrap !== false,
    });

    await logAudit({
      userId: user.id,
      userName: user.name,
      action: "competitors.discover",
      entity: "Location",
      entityId: locationId,
      newValue: result,
    });

    return ok(result, result.warning || `Discovered competitors (${result.source})`);
  } catch (e: any) {
    return fail(e.message || "Failed to discover competitors");
  }
}
