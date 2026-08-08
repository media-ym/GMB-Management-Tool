import { db } from "@/lib/db";

export interface PgCronJobRow {
  jobid: number;
  jobname: string;
  schedule: string;
  command: string;
  active: boolean;
}

function asNumber(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  return Number(v);
}

function normalizePgCronRow(row: PgCronJobRow & { jobid: unknown }): PgCronJobRow {
  return { ...row, jobid: asNumber(row.jobid) };
}

export interface PgCronListResult {
  rows: PgCronJobRow[] | null;
  /** pg_cron installed but app DB user cannot read cron.job */
  permissionDenied: boolean;
}

export async function listPgCronJobs(): Promise<PgCronListResult> {
  try {
    const rows = await db.$queryRawUnsafe<(PgCronJobRow & { jobid: unknown })[]>(
      `SELECT jobid, jobname, schedule, command, COALESCE(active, true) AS active
       FROM cron.job
       WHERE jobname LIKE 'myfng-%'
       ORDER BY jobname`,
    );
    return { rows: rows.map(normalizePgCronRow), permissionDenied: false };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const permissionDenied =
      msg.includes("42501") || msg.toLowerCase().includes("permission denied");
    return { rows: null, permissionDenied };
  }
}

export async function setPgCronJobActive(jobname: string, active: boolean): Promise<boolean> {
  try {
    const rows = await db.$queryRawUnsafe<{ jobid: unknown }[]>(
      `SELECT jobid FROM cron.job WHERE jobname = $1 LIMIT 1`,
      jobname,
    );
    const jobid = rows[0]?.jobid;
    if (jobid == null) return false;
    await db.$executeRawUnsafe(
      `SELECT cron.alter_job($1::bigint, active := $2::boolean)`,
      asNumber(jobid),
      active,
    );
    return true;
  } catch {
    return false;
  }
}

export async function triggerPgCronHttpGet(url: string, cronSecret: string): Promise<boolean> {
  try {
    await db.$executeRawUnsafe(
      `SELECT net.http_get(url := $1, headers := jsonb_build_object('x-cron-secret', $2))`,
      url,
      cronSecret,
    );
    return true;
  } catch {
    return false;
  }
}

export async function getRecentPgNetResponses(limit = 10): Promise<
  { id: number; status_code: number | null; error_msg: string | null; created: Date }[] | null
> {
  try {
    const rows = await db.$queryRawUnsafe<
      { id: unknown; status_code: number | null; error_msg: string | null; created: Date }[]
    >(
      `SELECT id, status_code, error_msg, created
       FROM net._http_response
       ORDER BY created DESC
       LIMIT $1`,
      limit,
    );
    return rows.map((r) => ({
      id: asNumber(r.id),
      status_code: r.status_code,
      error_msg: r.error_msg,
      created: r.created,
    }));
  } catch {
    return null;
  }
}
