import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok } from "@/lib/api-response";
import { assertCronAuthorized } from "@/lib/cron-auth";
import {
  syncLocationFull,
  getValidAccessToken,
  googleServiceStatus,
} from "@/lib/google-service";

export const dynamic = "force-dynamic";
/** Allow longer runs when many locations are synced (Hostinger / Node). */
export const maxDuration = 300;

const JOB_NAME = "google-sync-all";
const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const BATCH_SIZE = 2;
const BATCH_PAUSE_MS = 1500;

/**
 * GET /api/cron/sync-all — full Google sync for every linked location.
 *
 * Schedule via host crontab every 6 hours (see DEPLOYMENT.md).
 * Auth: x-cron-secret must match process.env.CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  if (!googleServiceStatus.isConfigured) {
    return ok(
      { synced: 0, skipped: true, reason: "oauth_not_configured" },
      "Google OAuth is not configured — sync skipped.",
    );
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return ok(
      { synced: 0, skipped: true, reason: "not_connected" },
      "Google account not connected — sync skipped.",
    );
  }

  const locations = await db.location.findMany({
    where: {
      status: "active",
      googleProfiles: { some: {} },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const startedAt = new Date();
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];
  const results: { id: string; name: string; ok: boolean; analytics?: number; reviews?: number }[] = [];

  for (let i = 0; i < locations.length; i += BATCH_SIZE) {
    const batch = locations.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (loc) => {
        try {
          const result = await syncLocationFull(loc.id);
          const okish =
            result.success || Object.values(result.synced).some((n) => (n ?? 0) > 0);
          if (okish) synced++;
          else failed++;
          for (const err of result.errors) errors.push(`${loc.name}: ${err}`);
          results.push({
            id: loc.id,
            name: loc.name,
            ok: okish,
            analytics: result.synced.analytics,
            reviews: result.synced.reviews,
          });
        } catch (e: unknown) {
          failed++;
          const msg = e instanceof Error ? e.message : "Sync failed";
          errors.push(`${loc.name}: ${msg}`);
          results.push({ id: loc.id, name: loc.name, ok: false });
        }
      }),
    );
    if (i + BATCH_SIZE < locations.length) {
      await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
    }
  }

  const completedAt = new Date();
  const nextRun = new Date(completedAt.getTime() + INTERVAL_MS);
  const existing = await db.scheduledJob.findFirst({ where: { jobName: JOB_NAME } });
  if (existing) {
    await db.scheduledJob.update({
      where: { id: existing.id },
      data: {
        lastRun: completedAt,
        nextRun,
        isEnabled: true,
        cronExpression: "0 */6 * * *",
      },
    });
  } else {
    await db.scheduledJob.create({
      data: {
        jobName: JOB_NAME,
        cronExpression: "0 */6 * * *",
        isEnabled: true,
        lastRun: completedAt,
        nextRun,
      },
    });
  }

  await db.syncLog.create({
    data: {
      module: "cron-sync-all",
      locationId: null,
      startedAt,
      completedAt,
      status: failed === 0 ? "success" : synced > 0 ? "partial" : "failed",
      recordsProcessed: locations.length,
      recordsInserted: synced,
      recordsUpdated: 0,
      recordsFailed: failed,
      errorMessage: errors.length ? errors.slice(0, 8).join("; ") : null,
    },
  }).catch(() => null);

  return ok(
    {
      synced,
      failed,
      total: locations.length,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      nextRun: nextRun.toISOString(),
      errors: errors.slice(0, 20),
      results,
    },
    `Auto-sync done: ${synced}/${locations.length} location(s) · next run ~6h`,
  );
}
