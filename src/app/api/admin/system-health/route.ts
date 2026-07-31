import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { getSmtpConfig, getAiConfig } from "@/lib/app-settings";
import { isSmtpConfigured, verifySmtp } from "@/lib/mail";
import { getValidAccessToken } from "@/lib/google-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/system-health — live health checks
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "system.view") && !can(user.role, "settings.view")) return forbidden();

  const checks: {
    service: string;
    status: "healthy" | "warning" | "critical";
    latency?: number;
    message: string;
    details?: unknown;
  }[] = [];

  // Database
  try {
    const start = Date.now();
    await db.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    const userCount = await db.user.count();
    const locCount = await db.location.count();
    checks.push({
      service: "Database",
      status: latency < 500 ? "healthy" : "warning",
      latency,
      message: "Connected",
      details: { users: userCount, locations: locCount },
    });
  } catch (e: any) {
    checks.push({ service: "Database", status: "critical", message: e.message });
  }

  // Google OAuth
  try {
    const account = await db.googleAccount.findFirst();
    const profiles = await db.googleBusinessProfile.count();
    if (!account) {
      checks.push({ service: "Google OAuth", status: "warning", message: "Not connected", details: { profiles } });
    } else if (account.status !== "active") {
      checks.push({
        service: "Google OAuth",
        status: "critical",
        message: `Account ${account.status}`,
        details: { email: account.email },
      });
    } else if (account.tokenExpiry && new Date(account.tokenExpiry) < new Date()) {
      checks.push({
        service: "Google OAuth",
        status: "critical",
        message: "Token expired",
        details: { email: account.email, expiry: account.tokenExpiry },
      });
    } else {
      const token = await getValidAccessToken();
      checks.push({
        service: "Google OAuth",
        status: token ? "healthy" : "warning",
        message: token ? "Connected" : "Token refresh needed",
        details: { email: account.email, profiles, tokenExpiry: account.tokenExpiry },
      });
    }
  } catch {
    checks.push({ service: "Google OAuth", status: "warning", message: "Check failed" });
  }

  // AI Provider (OpenRouter)
  try {
    const ai = await getAiConfig();
    const hasKey = !!process.env.OPENROUTER_API_KEY;
    checks.push({
      service: "MiSA AI (OpenRouter)",
      status: hasKey ? "healthy" : "warning",
      message: hasKey
        ? `Configured · model ${ai.defaultModel || "auto"}`
        : "OPENROUTER_API_KEY missing",
      details: { defaultModel: ai.defaultModel || "auto", assistantName: ai.assistantName || "MiSA AI" },
    });
  } catch {
    checks.push({ service: "MiSA AI (OpenRouter)", status: "warning", message: "Check failed" });
  }

  // Storage
  try {
    const files = await db.storageFile.count();
    const media = await db.mediaLibrary.count();
    const totalSize = await db.mediaLibrary.aggregate({ _sum: { fileSize: true } });
    const mb = Math.round((totalSize._sum.fileSize ?? 0) / 1024 / 1024);
    checks.push({
      service: "Storage",
      status: "healthy",
      message: `${media} media · ${files} storage files · ${mb} MB`,
    });
  } catch {
    checks.push({ service: "Storage", status: "warning", message: "Check failed" });
  }

  // SMTP — real verify when configured
  try {
    const smtp = await getSmtpConfig();
    if (!isSmtpConfigured(smtp)) {
      checks.push({ service: "SMTP", status: "warning", message: "Not configured" });
    } else {
      const start = Date.now();
      const v = await verifySmtp();
      checks.push({
        service: "SMTP",
        status: v.ok ? "healthy" : "critical",
        latency: Date.now() - start,
        message: v.message,
        details: { host: smtp.host, port: smtp.port },
      });
    }
  } catch (e: any) {
    checks.push({ service: "SMTP", status: "critical", message: e?.message || "SMTP check failed" });
  }

  // Cron Jobs
  try {
    const enabledJobs = await db.scheduledJob.count({ where: { isEnabled: true } });
    const totalJobs = await db.scheduledJob.count();
    checks.push({
      service: "Cron Jobs",
      status: enabledJobs > 0 ? "healthy" : "warning",
      message: `${enabledJobs}/${totalJobs} jobs enabled`,
    });
  } catch {
    checks.push({ service: "Cron Jobs", status: "warning", message: "Check failed" });
  }

  // Background Workers
  try {
    const failed = await db.backgroundJob.count({ where: { status: "failed" } });
    const queued = await db.backgroundJob.count({ where: { status: "queued" } });
    const processing = await db.backgroundJob.count({ where: { status: "processing" } });
    checks.push({
      service: "Background Workers",
      status: failed > 5 ? "critical" : failed > 0 ? "warning" : "healthy",
      message: `${queued} queued, ${processing} processing, ${failed} failed`,
    });
  } catch {
    checks.push({ service: "Background Workers", status: "warning", message: "Check failed" });
  }

  // Error logs
  try {
    const unresolved = await db.errorLog.count({ where: { resolved: false } });
    checks.push({
      service: "Error Monitor",
      status: unresolved > 10 ? "critical" : unresolved > 0 ? "warning" : "healthy",
      message: `${unresolved} unresolved errors`,
    });
  } catch {
    checks.push({ service: "Error Monitor", status: "warning", message: "Check failed" });
  }

  // Google accounts count (for Overview)
  const googleAccounts = await db.googleAccount.count().catch(() => 0);

  const overall = checks.some((c) => c.status === "critical")
    ? "critical"
    : checks.some((c) => c.status === "warning")
      ? "warning"
      : "healthy";
  const healthy = checks.filter((c) => c.status === "healthy").length;
  const warnings = checks.filter((c) => c.status === "warning").length;
  const critical = checks.filter((c) => c.status === "critical").length;

  return ok({
    overall,
    summary: { total: checks.length, healthy, warnings, critical, googleAccounts },
    checks,
  });
}
