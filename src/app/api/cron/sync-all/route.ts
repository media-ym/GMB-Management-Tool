import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok } from "@/lib/api-response";
import { assertCronAuthorized } from "@/lib/cron-auth";
import {
  syncLocationFull,
  getValidAccessToken,
  googleServiceStatus,
} from "@/lib/google-service";
import {
  getSyncConfig,
  intervalToCronHint,
  parseIntervalMs,
} from "@/lib/app-settings";
import { dispatchAppNotification } from "@/lib/notify";

export const dynamic = "force-dynamic";
/** Allow longer runs when many locations are synced (Hostinger / Node). */
export const maxDuration = 300;

const JOB_NAME = "google-sync-all";
const BATCH_PAUSE_MS = 400;

/**
 * GET /api/cron/sync-all — full Google sync for every linked location.
 *
 * Interval / batch size come from Settings → Sync.
 * Host crontab should poll often (e.g. every 5m); this route skips if not due.
 * Auth: x-cron-secret must match process.env.CRON_SECRET.
 * Query: ?force=1 to run even if interval not elapsed.
 */
export async function GET(req: NextRequest) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  const syncCfg = await getSyncConfig();
  const intervalMs = Math.min(
    parseIntervalMs(syncCfg.reviewsInterval, 30 * 60 * 1000),
    parseIntervalMs(syncCfg.businessInfoInterval, 60 * 60 * 1000),
    parseIntervalMs(syncCfg.postsInterval, 30 * 60 * 1000),
  );
  const BATCH_SIZE = Math.max(1, Math.min(50, Number(syncCfg.batchSize) || 4));
  const force = new URL(req.url).searchParams.get("force") === "1";

  const existing = await db.scheduledJob.findFirst({ where: { jobName: JOB_NAME } });
  if (!force && existing?.lastRun) {
    const dueAt = existing.lastRun.getTime() + intervalMs;
    if (Date.now() < dueAt) {
      return ok(
        {
          synced: 0,
          skipped: true,
          reason: "not_due",
          nextRun: new Date(dueAt).toISOString(),
          intervalMs,
        },
        `Sync not due yet — next run ${new Date(dueAt).toISOString()}`,
      );
    }
  }

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
  const nextRun = new Date(completedAt.getTime() + intervalMs);
  const cronExpression = intervalToCronHint(intervalMs);
  if (existing) {
    await db.scheduledJob.update({
      where: { id: existing.id },
      data: {
        lastRun: completedAt,
        nextRun,
        isEnabled: true,
        cronExpression,
      },
    });
  } else {
    await db.scheduledJob.create({
      data: {
        jobName: JOB_NAME,
        cronExpression,
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

  if (failed > 0) {
    await dispatchAppNotification({
      eventId: "sync-failure",
      title: "Google sync failure",
      message: `${failed}/${locations.length} location(s) failed. ${errors[0] || ""}`.trim(),
      type: "sync",
      severity: "critical",
      link: "/settings",
      metadata: { synced, failed, total: locations.length },
    }).catch(() => null);
  }

  const nextLabel =
    intervalMs < 60 * 60 * 1000
      ? `~${Math.round(intervalMs / 60000)}m`
      : `~${Math.round(intervalMs / 3600000)}h`;

  return ok(
    {
      synced,
      failed,
      total: locations.length,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      nextRun: nextRun.toISOString(),
      intervalMs,
      batchSize: BATCH_SIZE,
      errors: errors.slice(0, 20),
      results,
    },
    `Auto-sync done: ${synced}/${locations.length} location(s) · next run ${nextLabel}`,
  );
}
