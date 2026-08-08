import { db } from "@/lib/db";
import {
  MYFNG_CRON_JOBS,
  describeCronSchedule,
  type CronJobDefinition,
} from "@/lib/cron-catalog";
import { listPgCronJobs, getRecentPgNetResponses } from "@/lib/pg-cron";

const CRON_STATE_KEY = "cron_jobs_enabled";

async function loadEnabledOverrides(): Promise<Record<string, boolean>> {
  const row = await db.setting.findUnique({ where: { key: CRON_STATE_KEY } });
  if (!row?.value) return {};
  try {
    return JSON.parse(row.value) as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function cronAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    "https://gmb.myfng.in"
  );
}

export interface CronJobStatus extends CronJobDefinition {
  pgCronInstalled: boolean;
  registered: boolean;
  enabled: boolean;
  pgJobId: number | null;
  liveSchedule: string | null;
  liveScheduleLabel: string | null;
  lastRun: string | null;
  lastStatus: string | null;
}

export interface CronJobsOverview {
  jobs: CronJobStatus[];
  pgCronAvailable: boolean;
  pgCronPermissionDenied: boolean;
  cronSecretConfigured: boolean;
  appBaseUrl: string;
  recentHttp: { id: number; status_code: number | null; error_msg: string | null; created: string }[] | null;
}

export async function buildCronJobStatuses(): Promise<CronJobsOverview> {
  const pgList = await listPgCronJobs();
  const pgRows = pgList.rows;
  const pgCronAvailable = pgRows !== null;
  const pgCronPermissionDenied = pgList.permissionDenied;
  const overrides = await loadEnabledOverrides();

  const scheduledJobs = await db.scheduledJob.findMany({
    where: { jobName: { in: MYFNG_CRON_JOBS.map((j) => j.scheduledJobKey).filter(Boolean) as string[] } },
  });
  const lastByKey = new Map(scheduledJobs.map((s) => [s.jobName, s]));

  const jobs: CronJobStatus[] = MYFNG_CRON_JOBS.map((def) => {
    const pg = pgRows?.find((r) => r.jobname === def.id);
    const registered = !!pg;
    const enabled = pg ? pg.active : (overrides[def.id] ?? true);
    const sj = def.scheduledJobKey ? lastByKey.get(def.scheduledJobKey) : null;
    return {
      ...def,
      pgCronInstalled: pgCronAvailable,
      registered,
      enabled,
      pgJobId: pg?.jobid ?? null,
      liveSchedule: pg?.schedule ?? null,
      liveScheduleLabel: pg ? describeCronSchedule(pg.schedule) : null,
      lastRun: sj?.lastRun?.toISOString() ?? null,
      lastStatus: null,
    };
  });

  const recent = await getRecentPgNetResponses(8);
  const recentHttp =
    recent?.map((r) => ({
      id: r.id,
      status_code: r.status_code,
      error_msg: r.error_msg,
      created: r.created instanceof Date ? r.created.toISOString() : String(r.created),
    })) ?? null;

  return {
    jobs,
    pgCronAvailable,
    pgCronPermissionDenied,
    cronSecretConfigured: !!process.env.CRON_SECRET?.trim(),
    appBaseUrl: cronAppBaseUrl(),
    recentHttp,
  };
}

export async function saveCronEnabledOverride(jobId: string, enabled: boolean) {
  const row = await db.setting.findUnique({ where: { key: CRON_STATE_KEY } });
  let current: Record<string, boolean> = {};
  if (row?.value) {
    try {
      current = JSON.parse(row.value) as Record<string, boolean>;
    } catch {
      current = {};
    }
  }
  current[jobId] = enabled;
  await db.setting.upsert({
    where: { key: CRON_STATE_KEY },
    create: { key: CRON_STATE_KEY, value: JSON.stringify(current), description: "Cron job on/off overrides" },
    update: { value: JSON.stringify(current) },
  });
}
