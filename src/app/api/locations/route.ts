import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import type { LocationWithStats } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.view")) return forbidden();

  const scoped = scopeLocationIds(user);
  const where = scoped ? { id: { in: scoped } } : {};
  const locations = await db.location.findMany({ where, orderBy: { city: "asc" } });

  const data: LocationWithStats[] = locations.map((l) => ({
    id: l.id,
    name: l.name,
    city: l.city,
    region: l.region,
    address: l.address,
    phone: l.phone,
    website: l.website,
    status: l.status as any,
    syncStatus: l.syncStatus as any,
    lastSyncedAt: l.lastSyncedAt?.toISOString() ?? null,
    avgRating: l.avgRating,
    reviewCount: l.reviewCount,
    healthScore: l.healthScore,
    visibilityScore: l.visibilityScore,
    latitude: l.latitude,
    longitude: l.longitude,
  }));

  return ok(data);
}
