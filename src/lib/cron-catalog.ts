/** Canonical MyFNG cron jobs (Supabase pg_cron jobname = id). */
export interface CronJobDefinition {
  id: string;
  name: string;
  description: string;
  /** Standard cron expression (UTC on Postgres host). */
  schedule: string;
  scheduleLabel: string;
  endpoint: string;
  /** Maps to ScheduledJob.jobName for last-run display */
  scheduledJobKey?: string;
  category: "sync" | "content" | "reviews" | "maintenance";
}

export const MYFNG_CRON_JOBS: CronJobDefinition[] = [
  {
    id: "myfng-sync-all",
    name: "Full Google Sync",
    description:
      "Pulls latest reviews, posts, photos, analytics and business profile data from Google for every linked verified location.",
    schedule: "0 */2 * * *",
    scheduleLabel: "Every 2 hours (UTC)",
    endpoint: "/api/cron/sync-all",
    scheduledJobKey: "google-sync-all",
    category: "sync",
  },
  {
    id: "myfng-publish-scheduled",
    name: "Publish Scheduled Posts",
    description:
      "Publishes Google Business Profile posts whose scheduled time has passed (queue from Content → Posts).",
    schedule: "*/15 * * * *",
    scheduleLabel: "Every 15 minutes (UTC)",
    endpoint: "/api/cron/publish-scheduled",
    category: "content",
  },
  {
    id: "myfng-auto-reply-reviews",
    name: "Auto-Reply Reviews",
    description:
      "Sends template-based replies to pending reviews that match your Auto Replies rules (star rating, text/no-text).",
    schedule: "*/30 * * * *",
    scheduleLabel: "Every 30 minutes (UTC)",
    endpoint: "/api/cron/auto-reply-reviews",
    category: "reviews",
  },
  {
    id: "myfng-auto-post-daily",
    name: "Daily MiSA Auto-Posts",
    description:
      "Creates and publishes one SEO-focused AI post per verified location (runs at the IST hour set in Content → Auto Posts).",
    schedule: "0 * * * *",
    scheduleLabel: "Every hour — app picks your IST run time",
    endpoint: "/api/cron/auto-post-daily",
    scheduledJobKey: "auto-post-daily",
    category: "content",
  },
  {
    id: "myfng-drift-detection",
    name: "Profile Drift Detection",
    description:
      "Compares cached GBP data with live Google to flag listing changes (hours, phone, categories, etc.).",
    schedule: "0 2 * * *",
    scheduleLabel: "Daily at 2:00 AM UTC (7:30 AM IST)",
    endpoint: "/api/cron/drift-detection",
    scheduledJobKey: "drift-detection",
    category: "maintenance",
  },
];

export function cronJobById(id: string): CronJobDefinition | undefined {
  return MYFNG_CRON_JOBS.find((j) => j.id === id);
}

/** Next run hint from cron expression (simplified; Postgres uses UTC). */
export function describeCronSchedule(cron: string): string {
  const c = cron.trim();
  if (c === "0 */2 * * *") return "Every 2 hours at minute 0 (UTC)";
  if (c === "*/15 * * * *") return "Every 15 minutes (UTC)";
  if (c === "*/30 * * * *") return "Every 30 minutes (UTC)";
  if (c === "0 * * * *") return "Every hour at minute 0 (UTC)";
  if (c === "0 2 * * *") return "Daily at 02:00 UTC";
  return c;
}
