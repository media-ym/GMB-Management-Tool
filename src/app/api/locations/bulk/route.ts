import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { syncLocationFull, googleServiceStatus } from "@/lib/google-service";

export const dynamic = "force-dynamic";

// POST /api/locations/bulk — bulk operations (doc 07 §15)
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "system.sync") && !can(user.role, "posts.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { action, locationIds } = body;
  if (!action || !Array.isArray(locationIds) || locationIds.length === 0) return fail("action and locationIds[] required");

  if (action === "sync") {
    if (!can(user.role, "system.sync")) return forbidden();

    // Block the action entirely if Google OAuth isn't configured — otherwise
    // every syncLocationFull call would fail at the auth step and burn the
    // user's time + the audit log with identical errors.
    if (!googleServiceStatus.isConfigured) {
      return fail("Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.", 400);
    }

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const id of locationIds) {
      const syncStart = new Date();
      try {
        const result = await syncLocationFull(id);

        // Aggregate record counts across all sync sub-modules so the SyncLog
        // reflects actual work done (not fake placeholder numbers).
        const totalRecords =
          result.synced.reviews +
          result.synced.photos +
          result.synced.hours +
          result.synced.services +
          result.synced.categories +
          result.synced.posts +
          (result.synced.analytics ?? 0);
        const recordsInserted =
          result.synced.reviews + result.synced.photos + (result.synced.analytics ?? 0);
        const recordsUpdated = result.synced.hours + result.synced.services + result.synced.categories;

        await db.syncLog.create({
          data: {
            module: "full",
            locationId: id,
            startedAt: syncStart,
            completedAt: new Date(),
            status: result.success ? "success" : "partial",
            recordsProcessed: totalRecords,
            recordsInserted,
            recordsUpdated,
            recordsFailed: result.errors.length,
            errorMessage: result.errors.length > 0 ? result.errors.join("; ").slice(0, 2000) : null,
          },
        });

        if (result.success) {
          successCount++;
        } else {
          failCount++;
          errors.push(`${id}: ${result.errors.join("; ")}`);
        }
      } catch (e: any) {
        // Unexpected error outside syncLocationFull's internal try/catch —
        // log a failed SyncLog so the System view surfaces it.
        failCount++;
        errors.push(`${id}: ${e.message}`);
        await db.syncLog.create({
          data: {
            module: "full",
            locationId: id,
            startedAt: syncStart,
            completedAt: new Date(),
            status: "failed",
            recordsProcessed: 0,
            recordsInserted: 0,
            recordsUpdated: 0,
            recordsFailed: 1,
            errorMessage: (e?.message ?? String(e)).slice(0, 2000),
          },
        });
      }
    }

    await logAudit({
      userId: user.id,
      userName: user.name,
      action: "bulk.sync",
      entity: "location",
      newValue: { locationIds, successCount, failCount, errors: errors.slice(0, 5) },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });

    const message = failCount === 0
      ? `Synced ${successCount} location(s) from Google`
      : `Synced ${successCount}, ${failCount} failed. Errors: ${errors.slice(0, 3).join("; ")}`;
    return ok({ synced: successCount, failed: failCount, errors: errors.slice(0, 10) }, message);
  }

  if (action === "archive") {
    if (!can(user.role, "locations.manage")) return forbidden();
    await db.location.updateMany({ where: { id: { in: locationIds } }, data: { status: "inactive" } });
    await logAudit({ userId: user.id, userName: user.name, action: "bulk.archive", entity: "location", newValue: { locationIds }, ip: req.headers.get("x-forwarded-for") ?? undefined });
    return ok({ archived: locationIds.length }, `Archived ${locationIds.length} locations`);
  }

  if (action === "activate") {
    if (!can(user.role, "locations.manage")) return forbidden();
    await db.location.updateMany({ where: { id: { in: locationIds } }, data: { status: "active" } });
    await logAudit({ userId: user.id, userName: user.name, action: "bulk.activate", entity: "location", newValue: { locationIds }, ip: req.headers.get("x-forwarded-for") ?? undefined });
    return ok({ activated: locationIds.length }, `Activated ${locationIds.length} locations`);
  }

  return fail("Unknown action. Use: sync, archive, activate");
}
