import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { googleServiceStatus, syncLocationPhotosFromGoogle, syncLocationProfileExtrasFromGoogle } from "@/lib/google-service";

export const dynamic = "force-dynamic";

/** POST /api/content-updates/sync — refresh logo/cover/photos from Google for content dashboard */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.view")) return forbidden();

  if (!googleServiceStatus.isConfigured) {
    return fail("Google OAuth is not configured. Connect Google first.", 400);
  }

  const body = await req.json().catch(() => ({}));
  const requestedIds = (body.locationIds as string[] | undefined)?.filter(Boolean);

  const scoped = scopeLocationIds(user, undefined);
  const where: { status: string; id?: { in: string[] } } = { status: "active" };
  if (scoped) where.id = { in: scoped };
  if (requestedIds?.length) {
    where.id = scoped
      ? { in: scoped.filter((id) => requestedIds.includes(id)) }
      : { in: requestedIds };
  }

  const locations = await db.location.findMany({
    where,
    select: { id: true, name: true },
  });

  if (locations.length === 0) {
    return ok({ locations: 0, photosCreated: 0, photosUpdated: 0, errors: [] }, "No locations to sync");
  }

  let photosCreated = 0;
  let photosUpdated = 0;
  let profilesUpdated = 0;
  const errors: string[] = [];

  // Remove legacy rows where services were incorrectly stored as products
  await db.product.deleteMany({
    where: {
      source: "google",
      googleItemId: null,
    },
  });

  for (const loc of locations) {
    const photoResult = await syncLocationPhotosFromGoogle(loc.id);
    photosCreated += photoResult.created;
    photosUpdated += photoResult.updated;
    for (const err of photoResult.errors) {
      errors.push(`${loc.name}: ${err}`);
    }

    const profileResult = await syncLocationProfileExtrasFromGoogle(loc.id);
    if (profileResult.updated) profilesUpdated++;
    for (const err of profileResult.errors) {
      errors.push(`${loc.name}: ${err}`);
    }

    if (photoResult.created > 0 || photoResult.updated > 0 || profileResult.updated) {
      await db.location.update({
        where: { id: loc.id },
        data: { lastSyncedAt: new Date(), syncStatus: "synced" },
      });
    }
  }

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "content.sync_photos",
    entity: "content_update",
    newValue: {
      locationIds: locations.map((l) => l.id),
      photosCreated,
      photosUpdated,
      profilesUpdated,
      errors: errors.length,
    },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  const message =
    photosCreated + photosUpdated > 0
      ? `Synced ${photosCreated + photosUpdated} photo(s) from Google across ${locations.length} listing(s)`
      : errors.length > 0
        ? "Photo sync finished with errors"
        : "Photos are already up to date";

  return ok({ locations: locations.length, photosCreated, photosUpdated, profilesUpdated, errors }, message);
}
