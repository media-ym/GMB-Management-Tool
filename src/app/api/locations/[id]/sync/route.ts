import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, notFound, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { syncLocationFull, syncGoogleReviews, syncLocationAnalytics, googleServiceStatus } from "@/lib/google-service";

export const dynamic = "force-dynamic";

// POST /api/locations/[id]/sync — fetch REAL data from Google Business Profile
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "system.sync")) return forbidden();

  const { id } = await params;
  const scoped = scopeLocationIds(user, id);
  if (scoped && !scoped.includes(id)) return forbidden("Location out of scope");

  const location = await db.location.findUnique({ where: { id }, include: { googleProfiles: true } });
  if (!location) return notFound("Location not found");

  const body = await req.json().catch(() => ({}));
  const syncModule = body.module || "full";
  const now = new Date();

  // Check if Google OAuth is configured
  if (!googleServiceStatus.isConfigured) {
    return fail("Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file to sync real GMB data.", 400);
  }

  const gbp = location.googleProfiles[0];
  if (!gbp) {
    return fail("No Google Business Profile linked to this location. Import this location from Google first.", 400);
  }

  // ─── Full sync: fetch ALL real data from Google ────────────────────────
  if (syncModule === "full" || syncModule === "profile") {
    const result = await syncLocationFull(id);
    const totalSynced = result.synced.reviews + result.synced.photos + result.synced.hours + result.synced.services + result.synced.categories;

    // Create sync log with REAL counts
    await db.syncLog.create({
      data: {
        module: syncModule,
        locationId: id,
        startedAt: now,
        completedAt: new Date(),
        status: result.success ? "success" : "partial",
        recordsProcessed: totalSynced,
        recordsInserted: result.synced.reviews + result.synced.photos,
        recordsUpdated: result.synced.hours + result.synced.services + result.synced.categories,
        recordsFailed: result.errors.length,
        errorMessage: result.errors.length > 0 ? result.errors.join("; ") : null,
      },
    });

    await logAudit({
      userId: user.id, userName: user.name, action: "sync.run", entity: "location", entityId: id,
      newValue: { module: syncModule, synced: result.synced, errors: result.errors },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });

    if (result.success) {
      return ok({
        id,
        module: syncModule,
        synced: result.synced,
        totalRecords: totalSynced,
      }, `Synced "${location.name}" from Google: ${result.synced.reviews} reviews, ${result.synced.photos} photos, ${result.synced.hours} hours, ${result.synced.services} services, ${result.synced.categories} categories`);
    } else {
      return ok({
        id,
        module: syncModule,
        synced: result.synced,
        totalRecords: totalSynced,
        errors: result.errors,
      }, `Partial sync completed for "${location.name}" with ${result.errors.length} error(s)`);
    }
  }

  // ─── Reviews-only sync ─────────────────────────────────────────────────
  if (syncModule === "reviews") {
    const result = await syncGoogleReviews(id, gbp.googleLocationId);

    await db.syncLog.create({
      data: {
        module: "reviews",
        locationId: id,
        startedAt: now,
        completedAt: new Date(),
        status: result.synced > 0 ? "success" : "partial",
        recordsProcessed: result.synced,
        recordsInserted: result.synced,
        recordsUpdated: 0,
        recordsFailed: result.errors.length,
        errorMessage: result.errors.length > 0 ? result.errors.join("; ") : null,
      },
    });

    await logAudit({
      userId: user.id, userName: user.name, action: "sync.run", entity: "location", entityId: id,
      newValue: { module: "reviews", synced: result.synced },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return ok({ id, module: "reviews", synced: result.synced }, `Synced ${result.synced} review(s) from Google for "${location.name}"`);
  }

  // ─── Analytics-only sync — fetch real Google Business Performance API ───
  if (syncModule === "analytics") {
    const result = await syncLocationAnalytics(id, 30);

    await db.syncLog.create({
      data: {
        module: "analytics",
        locationId: id,
        startedAt: now,
        completedAt: new Date(),
        status: result.synced > 0 ? "success" : "partial",
        recordsProcessed: result.synced,
        recordsInserted: result.synced,
        recordsUpdated: 0,
        recordsFailed: result.errors.length,
        errorMessage: result.errors.length > 0 ? result.errors.join("; ") : null,
      },
    });

    await logAudit({
      userId: user.id, userName: user.name, action: "sync.run", entity: "location", entityId: id,
      newValue: { module: "analytics", days: 30, synced: result.synced },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return ok({ id, module: "analytics", synced: result.synced }, `Synced ${result.synced} days of real analytics from Google for "${location.name}"`);
  }

  // ─── Full sync (profile + hours + categories + services + reviews + photos + analytics) ──
  const result = await syncLocationFull(id);
  await db.syncLog.create({
    data: {
      module: syncModule,
      locationId: id,
      startedAt: now,
      completedAt: new Date(),
      status: result.success ? "success" : "partial",
      recordsProcessed: result.synced.reviews + result.synced.photos,
      recordsInserted: result.synced.reviews,
      recordsUpdated: result.synced.hours + result.synced.services,
      recordsFailed: result.errors.length,
      errorMessage: result.errors.length > 0 ? result.errors.join("; ") : null,
    },
  });

  await logAudit({
    userId: user.id, userName: user.name, action: "sync.run", entity: "location", entityId: id,
    newValue: { module: syncModule },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok({ id, module: syncModule, synced: result.synced }, `Synced "${location.name}" from Google`);
}
