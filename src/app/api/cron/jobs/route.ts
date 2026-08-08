import { NextRequest } from "next/server";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { cronJobById } from "@/lib/cron-catalog";
import { setPgCronJobActive } from "@/lib/pg-cron";
import {
  buildCronJobStatuses,
  saveCronEnabledOverride,
  cronAppBaseUrl,
  type CronJobStatus,
} from "@/lib/cron-status";

export const dynamic = "force-dynamic";

export type { CronJobStatus };

/** GET /api/cron/jobs — list MyFNG cron jobs + live pg_cron status */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "system.view")) return forbidden();

  try {
    const data = await buildCronJobStatuses();
    return ok(data);
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : "Failed to load cron jobs", 500);
  }
}

/** PATCH /api/cron/jobs — enable/disable a job { jobId, enabled } */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "system.sync") && !can(user.role, "settings.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const jobId = body.jobId as string | undefined;
  const enabled = body.enabled as boolean | undefined;
  if (!jobId || typeof enabled !== "boolean") return fail("jobId and enabled (boolean) required");

  const def = cronJobById(jobId);
  if (!def) return fail("Unknown cron job", 404);

  const pgOk = await setPgCronJobActive(jobId, enabled);
  if (!pgOk) {
    await saveCronEnabledOverride(jobId, enabled);
  }

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: enabled ? "cron.job_enabled" : "cron.job_disabled",
    entity: "cron",
    entityId: jobId,
    newValue: { enabled, pgCronUpdated: pgOk },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  const data = await buildCronJobStatuses();
  return ok(data, `${def.name} ${enabled ? "enabled" : "disabled"}`);
}

/** POST /api/cron/jobs — run now { jobId } */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "system.sync") && !can(user.role, "settings.manage")) return forbidden();

  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return fail("CRON_SECRET is not configured on the server", 503);

  const body = await req.json().catch(() => ({}));
  const jobId = body.jobId as string | undefined;
  if (!jobId) return fail("jobId required");

  const def = cronJobById(jobId);
  if (!def) return fail("Unknown cron job", 404);

  const url = `${cronAppBaseUrl()}${def.endpoint}${def.endpoint.includes("sync-all") ? "?force=1" : ""}`;

  try {
    const res = await fetch(url, {
      headers: { "x-cron-secret": secret },
      cache: "no-store",
    });
    const text = await res.text();
    let message = "Cron run triggered";
    try {
      const json = JSON.parse(text) as { message?: string };
      if (json.message) message = json.message;
    } catch {
      if (!res.ok) {
        return fail(text.slice(0, 200) || `HTTP ${res.status}`, res.status);
      }
    }

    await logAudit({
      userId: user.id,
      userName: user.name,
      action: "cron.job_run_now",
      entity: "cron",
      entityId: jobId,
      newValue: { url, status: res.status },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });

    const data = await buildCronJobStatuses();
    return ok({ ...data, runResult: { status: res.status, message } }, message);
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : "Failed to trigger cron", 500);
  }
}
