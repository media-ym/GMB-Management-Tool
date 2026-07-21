import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { assertCronAuthorized } from "@/lib/cron-auth";
import { detectLocationDrift } from "@/lib/google-service";
import { ok } from "@/lib/api-response";

export const dynamic = "force-dynamic";

// GET /api/cron/drift-detection — daily drift detection across all locations.
//
// Called by an external cron job (Hostinger cron, Vercel cron, systemd timer,
// etc.). Protect with a shared CRON_SECRET header check so random public hits
// don't burn the Google API quota.
//
// Behavior:
//   - Iterates all active locations in batches of 5 (1s pause between batches)
//     to respect Google's 10-QPS rate limit.
//   - For each location, calls detectLocationDrift() which fetches the
//     Google-updated version of the location and diffs against our DB. Drift
//     is logged to ErrorLog + AuditLog inside detectLocationDrift().
//   - Updates the ScheduledJob row named "drift-detection" with lastRun +
//     nextRun timestamps so the System view can surface "next scheduled run".
//
// Auth: requires `x-cron-secret` header matching process.env.CRON_SECRET.
// If CRON_SECRET is not set, the route always returns 401 (cron is disabled
// until the operator sets the secret).

export async function GET(req: NextRequest) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  const locations = await db.location.findMany({
    where: { status: "active" },
    select: { id: true },
  });
  let driftCount = 0;
  const checkedAt = new Date();

  // Run drift detection in batches of 5 to respect Google's ~10-QPS quota.
  // Each detectLocationDrift() call issues 1 getGoogleUpdated fetch, so a
  // batch of 5 is well under quota even before withRetry's internal rate
  // limiter kicks in.
  for (let i = 0; i < locations.length; i += 5) {
    const batch = locations.slice(i, i + 5);
    await Promise.all(
      batch.map(async (loc) => {
        const result = await detectLocationDrift(loc.id);
        if (result.drift) driftCount++;
      }),
    );
    // Small delay between batches — only when more batches remain.
    if (i + 5 < locations.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Update the ScheduledJob record. The schema's jobName column is NOT marked
  // @unique, so we use findFirst + update/create instead of upsert.
  const nextRun = new Date(checkedAt.getTime() + 24 * 60 * 60 * 1000);
  const existing = await db.scheduledJob.findFirst({ where: { jobName: "drift-detection" } });
  if (existing) {
    await db.scheduledJob.update({
      where: { id: existing.id },
      data: { lastRun: checkedAt, nextRun },
    });
  } else {
    await db.scheduledJob.create({
      data: {
        jobName: "drift-detection",
        cronExpression: "0 2 * * *", // Daily at 2 AM
        isEnabled: true,
        lastRun: checkedAt,
        nextRun,
      },
    });
  }

  return ok(
    { checked: locations.length, driftDetected: driftCount, checkedAt: checkedAt.toISOString() },
    `Drift detection complete: ${driftCount} location(s) with drift`,
  );
}
