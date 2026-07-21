import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { GOOGLE_API_CATALOG } from "@/lib/google-api-catalog";
import { googleServiceStatus, isGoogleOAuthConnected } from "@/lib/google-service";

export const dynamic = "force-dynamic";

const GOOGLE_ACTION_PREFIXES = [
  "google.",
  "sync.",
  "review.sync",
  "post.publish",
  "post.schedule",
  "location.sync",
  "media.sync",
];

function isGoogleRelatedAction(action: string): boolean {
  const lower = action.toLowerCase();
  return GOOGLE_ACTION_PREFIXES.some((p) => lower.startsWith(p) || lower.includes("google"));
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function resolveBillingPeriod(url: URL): {
  key: string;
  days: number;
  since: Date;
  until: Date | null;
} {
  const now = new Date();
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (from) {
    const since = startOfLocalDay(new Date(from));
    let until: Date | null = null;
    if (to) {
      until = startOfLocalDay(new Date(to));
      until.setDate(until.getDate() + 1); // exclusive end of selected day
    }
    const endMs = (until ?? now).getTime();
    const days = Math.max(1, Math.ceil((endMs - since.getTime()) / (24 * 60 * 60 * 1000)));
    return { key: "custom", days: Math.min(days, 365), since, until };
  }

  const raw = url.searchParams.get("days") || url.searchParams.get("period");
  const value = (raw || "30").toLowerCase();

  if (value === "today" || value === "1") {
    return { key: "today", days: 1, since: startOfLocalDay(now), until: null };
  }
  if (value === "yesterday") {
    const todayStart = startOfLocalDay(now);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    return { key: "yesterday", days: 1, since: yesterdayStart, until: todayStart };
  }

  const n = parseInt(value, 10);
  const days = Number.isFinite(n) ? Math.min(Math.max(n, 1), 180) : 30;
  return {
    key: String(days),
    days,
    since: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
    until: null,
  };
}

// GET /api/admin/google-billing — Google Cloud / API usage & billing overview
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "system.view") && !can(user.role, "settings.view")) return forbidden();

  const url = new URL(req.url);
  const period = resolveBillingPeriod(url);
  const { days, since, until } = period;

  const createdAtFilter = until
    ? { createdAt: { gte: since, lt: until } }
    : { createdAt: { gte: since } };
  const startedAtFilter = until
    ? { startedAt: { gte: since, lt: until } }
    : { startedAt: { gte: since } };
  const usageDateFilter = until
    ? { usageDate: { gte: since, lt: until } }
    : { usageDate: { gte: since } };

  const [aiUsage, auditLogs, syncLogs, errorLogs429, googleAccounts, activeProfiles] = await Promise.all([
    db.aiUsage.findMany({ where: usageDateFilter, orderBy: { usageDate: "asc" } }),
    db.auditLog.findMany({
      where: createdAtFilter,
      select: { action: true, status: true, createdAt: true },
    }),
    db.syncLog.findMany({
      where: startedAtFilter,
      select: { module: true, status: true, recordsProcessed: true, startedAt: true, errorMessage: true },
    }),
    db.errorLog.findMany({
      where: {
        ...createdAtFilter,
        OR: [
          { errorMessage: { contains: "429" } },
          { errorMessage: { contains: "rate limit" } },
          { errorCode: "API_LIMIT" },
        ],
      },
      select: { id: true, createdAt: true, errorMessage: true },
      take: 20,
      orderBy: { createdAt: "desc" },
    }),
    db.googleAccount.findMany({ where: { status: "active" }, select: { email: true, tokenExpiry: true, createdAt: true } }),
    db.googleBusinessProfile.count({ where: { profileStatus: "active" } }),
  ]);

  const totalAiRequests = aiUsage.reduce((a, u) => a + u.totalRequests, 0);
  const totalAiTokens = aiUsage.reduce((a, u) => a + u.totalTokens, 0);
  const totalAiCost = aiUsage.reduce((a, u) => a + u.estimatedCost, 0);

  const googleAuditLogs = auditLogs.filter((l) => isGoogleRelatedAction(l.action));
  const googleAuditFailed = googleAuditLogs.filter((l) => l.status === "failed").length;
  const syncSuccess = syncLogs.filter((s) => s.status === "success").length;
  const syncFailed = syncLogs.filter((s) => s.status === "failed").length;
  const recordsProcessed = syncLogs.reduce((a, s) => a + s.recordsProcessed, 0);

  // Rough estimate: each sync job ≈ 8–12 Google API calls
  const estimatedGoogleApiCalls = syncLogs.length * 10 + googleAuditLogs.length;

  const byDay = new Map<string, { date: string; syncJobs: number; syncFailed: number; aiCost: number; aiRequests: number }>();
  {
    const cursor = new Date(since);
    cursor.setHours(0, 0, 0, 0);
    const endExclusive = until
      ? new Date(until)
      : (() => {
          const e = new Date();
          e.setHours(0, 0, 0, 0);
          e.setDate(e.getDate() + 1);
          return e;
        })();
    while (cursor < endExclusive) {
      const key = cursor.toISOString().slice(0, 10);
      byDay.set(key, { date: key, syncJobs: 0, syncFailed: 0, aiCost: 0, aiRequests: 0 });
      cursor.setDate(cursor.getDate() + 1);
      if (byDay.size > 370) break;
    }
  }
  for (const s of syncLogs) {
    const key = s.startedAt.toISOString().slice(0, 10);
    const day = byDay.get(key);
    if (day) {
      day.syncJobs++;
      if (s.status === "failed") day.syncFailed++;
    }
  }
  for (const u of aiUsage) {
    const key = u.usageDate.toISOString().slice(0, 10);
    const day = byDay.get(key);
    if (day) {
      day.aiCost += u.estimatedCost;
      day.aiRequests += u.totalRequests;
    }
  }

  const syncByModule = ["reviews", "posts", "profile", "analytics", "photos"].map((mod) => ({
    module: mod,
    total: syncLogs.filter((s) => s.module === mod).length,
    failed: syncLogs.filter((s) => s.module === mod && s.status === "failed").length,
    records: syncLogs.filter((s) => s.module === mod).reduce((a, s) => a + s.recordsProcessed, 0),
  }));

  const rateLimitStatus =
    errorLogs429.length >= 5 ? "exceeded" : errorLogs429.length >= 1 ? "approaching" : "normal";

  const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GCP_PROJECT_ID || null;
  const gcpBillingAccountId = process.env.GCP_BILLING_ACCOUNT_ID || null;
  const gcpBillingConfigured = !!(gcpProjectId && gcpBillingAccountId);

  const googleConnected = await isGoogleOAuthConnected();

  const freeApiCount = GOOGLE_API_CATALOG.filter((a) => a.billing === "free").length;
  const paidApiCount = GOOGLE_API_CATALOG.filter((a) => a.billing === "paid").length;

  return ok({
    period: {
      key: period.key,
      days,
      since: since.toISOString(),
      until: until?.toISOString() ?? null,
    },
    summary: {
      googleApisUsed: GOOGLE_API_CATALOG.length,
      freeApis: freeApiCount,
      paidApis: paidApiCount,
      googleEstimatedCost: 0,
      aiCost: Math.round(totalAiCost * 100) / 100,
      totalEstimatedCost: Math.round(totalAiCost * 100) / 100,
      estimatedGoogleApiCalls,
      syncJobs: syncLogs.length,
      syncSuccess,
      syncFailed,
      recordsProcessed,
      googleAuditActions: googleAuditLogs.length,
      googleAuditFailed,
      aiRequests: totalAiRequests,
      aiTokens: totalAiTokens,
      rateLimitStatus,
      rateLimitEvents: errorLogs429.length,
    },
    oauth: {
      configured: googleServiceStatus.isConfigured,
      connected: googleConnected,
      mode: googleServiceStatus.mode,
      redirectUri: googleServiceStatus.redirectUri,
      accounts: googleAccounts.map((a) => ({
        email: a.email,
        tokenExpiry: a.tokenExpiry?.toISOString() ?? null,
        connectedAt: a.createdAt.toISOString(),
      })),
      activeProfiles,
    },
    apis: GOOGLE_API_CATALOG.map((api) => ({
      ...api,
      billingLabel: api.billing === "free" ? "Free (quota limits apply)" : api.billing === "paid" ? "Paid (per token)" : "May incur charges",
    })),
    usage: {
      daily: Array.from(byDay.values()),
      syncByModule,
      topGoogleActions: (() => {
        const counts = new Map<string, number>();
        for (const log of googleAuditLogs) {
          counts.set(log.action, (counts.get(log.action) ?? 0) + 1);
        }
        return Array.from(counts.entries())
          .map(([action, count]) => ({ action, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
      })(),
      aiDaily: aiUsage.map((u) => ({
        date: u.usageDate.toISOString().slice(0, 10),
        requests: u.totalRequests,
        tokens: u.totalTokens,
        cost: u.estimatedCost,
      })),
    },
    billing: {
      googleCloud: {
        configured: gcpBillingConfigured,
        projectId: gcpProjectId,
        billingAccountId: gcpBillingAccountId ? `****${gcpBillingAccountId.slice(-4)}` : null,
        note: gcpBillingConfigured
          ? "GCP Billing API credentials detected. Enable Cloud Billing export for live invoice data."
          : "Set GOOGLE_CLOUD_PROJECT_ID and GCP_BILLING_ACCOUNT_ID to link real GCP billing. GBP APIs are free — your GCP bill is typically ₹0 unless you use paid APIs (Maps, Places, etc.).",
        consoleUrl: gcpProjectId
          ? `https://console.cloud.google.com/billing/linkedaccount?project=${gcpProjectId}`
          : "https://console.cloud.google.com/billing",
      },
      costBreakdown: [
        { service: "Google Business Profile APIs", amount: 0, currency: "INR", note: "Free within quota" },
        { service: "Google OAuth / UserInfo", amount: 0, currency: "INR", note: "Free" },
        { service: "MiSA AI", amount: Math.round(totalAiCost * 100) / 100, currency: "INR", note: "Token-based estimate" },
      ],
      recentRateLimitEvents: errorLogs429.map((e) => ({
        id: e.id,
        at: e.createdAt.toISOString(),
        message: e.errorMessage.slice(0, 120),
      })),
    },
    quota: {
      status: rateLimitStatus,
      qpsLimit: 10,
      note: "App throttles outgoing Google calls to 10 QPS. 429 errors indicate quota pressure.",
      eventsLastPeriod: errorLogs429.length,
    },
  });
}
