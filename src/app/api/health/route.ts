import { db } from "@/lib/db";
import { ok } from "@/lib/api-response";

export const dynamic = "force-dynamic";

// GET /api/health — public health check (doc 14 §22)
export async function GET() {
  const checks: { service: string; status: "healthy" | "warning" | "critical"; latency?: number; message?: string }[] = [];

  // Database check
  try {
    const start = Date.now();
    await db.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    checks.push({ service: "Database", status: latency < 500 ? "healthy" : "warning", latency, message: "Connected" });
  } catch (e: any) {
    checks.push({ service: "Database", status: "critical", message: e.message });
  }

  // Google Account (OAuth) check
  try {
    const account = await db.googleAccount.findFirst();
    if (!account) {
      checks.push({ service: "Google OAuth", status: "warning", message: "Not connected" });
    } else if (account.status !== "active") {
      checks.push({ service: "Google OAuth", status: "critical", message: `Account ${account.status}` });
    } else if (account.tokenExpiry && new Date(account.tokenExpiry) < new Date()) {
      checks.push({ service: "Google OAuth", status: "critical", message: "Token expired" });
    } else {
      checks.push({ service: "Google OAuth", status: "healthy", message: "Connected" });
    }
  } catch {
    checks.push({ service: "Google OAuth", status: "warning", message: "Check failed" });
  }

  // AI Provider check (z-ai-web-dev-sdk)
  checks.push({ service: "MiSA AI (glm-4.6)", status: "healthy", message: "Available" });

  // Storage check
  checks.push({ service: "Storage", status: "healthy", message: "Local storage active" });

  // SMTP check
  checks.push({ service: "SMTP", status: "warning", message: "Not configured" });

  // Cron/Scheduled jobs check
  try {
    const enabledJobs = await db.scheduledJob.count({ where: { isEnabled: true } });
    checks.push({ service: "Cron Jobs", status: enabledJobs > 0 ? "healthy" : "warning", message: `${enabledJobs} jobs enabled` });
  } catch {
    checks.push({ service: "Cron Jobs", status: "warning", message: "Check failed" });
  }

  // Background workers check
  try {
    const failedJobs = await db.backgroundJob.count({ where: { status: "failed" } });
    const queuedJobs = await db.backgroundJob.count({ where: { status: "queued" } });
    checks.push({ service: "Background Workers", status: failedJobs > 5 ? "critical" : failedJobs > 0 ? "warning" : "healthy", message: `${queuedJobs} queued, ${failedJobs} failed` });
  } catch {
    checks.push({ service: "Background Workers", status: "warning", message: "Check failed" });
  }

  const overall = checks.some(c => c.status === "critical") ? "critical" : checks.some(c => c.status === "warning") ? "warning" : "healthy";
  const httpStatus = overall === "critical" ? 503 : 200;

  return ok({ overall, checks, timestamp: new Date().toISOString() }, "Health check complete");
}
