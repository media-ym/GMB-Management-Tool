import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/admin/api-usage — API usage stats (doc 12 §15)
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "system.view") && !can(user.role, "settings.view")) return forbidden();

  const url = new URL(req.url);
  const days = Math.min(parseInt(url.searchParams.get("days") || "7"), 30);

  // AI usage from aiUsage table
  const aiUsage = await db.aiUsage.findMany({
    where: { usageDate: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } },
    orderBy: { usageDate: "asc" },
  });

  const totalAiRequests = aiUsage.reduce((a, u) => a + u.totalRequests, 0);
  const totalAiTokens = aiUsage.reduce((a, u) => a + u.totalTokens, 0);
  const totalAiCost = aiUsage.reduce((a, u) => a + u.estimatedCost, 0);

  // API logs (from audit logs as proxy — actions per day)
  const auditLogs = await db.auditLog.findMany({
    where: { createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } },
    select: { action: true, status: true, createdAt: true },
  });

  const totalApiRequests = auditLogs.length;
  const failedRequests = auditLogs.filter(l => l.status === "failed").length;
  const successRate = totalApiRequests > 0 ? Math.round(((totalApiRequests - failedRequests) / totalApiRequests) * 100) : 100;

  // Requests by action type
  const byAction = new Map<string, number>();
  for (const log of auditLogs) {
    byAction.set(log.action, (byAction.get(log.action) ?? 0) + 1);
  }
  const topActions = Array.from(byAction.entries()).map(([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count).slice(0, 10);

  // Daily breakdown
  const byDay = new Map<string, { date: string; requests: number; failed: number }>();
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(); date.setDate(date.getDate() - d); date.setHours(0, 0, 0, 0);
    byDay.set(date.toISOString().slice(0, 10), { date: date.toISOString().slice(0, 10), requests: 0, failed: 0 });
  }
  for (const log of auditLogs) {
    const key = log.createdAt.toISOString().slice(0, 10);
    const day = byDay.get(key);
    if (day) { day.requests++; if (log.status === "failed") day.failed++; }
  }

  // Sync stats
  const syncLogs = await db.syncLog.findMany({
    where: { startedAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } },
    select: { status: true, module: true },
  });
  const googleApiRequests = syncLogs.length;
  const googleApiFailures = syncLogs.filter(s => s.status === "failed").length;

  return ok({
    summary: {
      totalApiRequests,
      failedRequests,
      successRate,
      googleApiRequests,
      googleApiFailures,
      aiRequests: totalAiRequests,
      aiTokens: totalAiTokens,
      aiCost: Math.round(totalAiCost * 100) / 100,
      avgResponseTimeMs: 0, // tracked by middleware in production
      rateLimitStatus: "normal", // normal | approaching | exceeded
    },
    daily: Array.from(byDay.values()),
    topActions,
    aiUsageDaily: aiUsage.map(u => ({
      date: u.usageDate.toISOString().slice(0, 10),
      requests: u.totalRequests,
      tokens: u.totalTokens,
      cost: u.estimatedCost,
    })),
    syncByModule: ["reviews", "posts", "profile", "analytics", "photos"].map(mod => ({
      module: mod,
      total: syncLogs.filter(s => s.module === mod).length,
      failed: syncLogs.filter(s => s.module === mod && s.status === "failed").length,
    })),
  });
}
