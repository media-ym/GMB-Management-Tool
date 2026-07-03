import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/system — full system overview: schema inventory, sync logs, jobs, errors, api logs, widgets, storage
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.view") && !can(user.role, "audit.view")) return forbidden();

  // Schema inventory — all tables with row counts
  const tableNames = [
    "User", "Role", "Permission", "RolePermission", "Location",
    "GoogleAccount", "GoogleBusinessProfile", "BusinessInformation",
    "BusinessCategory", "BusinessPhoto", "Product", "Service",
    "BusinessAttribute", "BusinessHour", "SpecialHour",
    "Review", "ReviewReply", "ReviewLabel", "ReviewReplyTemplate",
    "Post", "MediaLibrary", "AnalyticDaily", "AnalyticsMonthly", "DashboardCache",
    "Keyword", "KeywordRanking", "GeoGridResult", "Competitor", "CompetitorRanking", "SeoAudit",
    "AIHistory", "AiJob", "AiSuggestion", "AiUsage", "Report",
    "Notification", "ActivityLog", "AuditLog", "SyncLog", "ApiLog", "ErrorLog",
    "BackgroundJob", "ScheduledJob", "ApiToken", "StorageFile", "Webhook",
    "DashboardWidget", "UserPreference", "Setting",
  ];
  const tableCounts: { name: string; count: number; category: string }[] = [];
  const categories: Record<string, string> = {
    User: "Auth", Role: "Auth", Permission: "Auth", RolePermission: "Auth",
    Location: "Locations", GoogleAccount: "Google", GoogleBusinessProfile: "Google",
    BusinessInformation: "Google", BusinessCategory: "Google", BusinessPhoto: "Google",
    Review: "Reviews", ReviewReply: "Reviews", ReviewLabel: "Reviews", ReviewReplyTemplate: "Reviews",
    Post: "Posts", MediaLibrary: "Media",
    AnalyticDaily: "Analytics", AnalyticsMonthly: "Analytics", DashboardCache: "Analytics",
    Keyword: "SEO", KeywordRanking: "SEO", GeoGridResult: "SEO", Competitor: "SEO",
    CompetitorRanking: "SEO", SeoAudit: "SEO",
    AIHistory: "AI", AiJob: "AI", AiSuggestion: "AI", AiUsage: "AI", Report: "Reports",
    Notification: "Notifications", ActivityLog: "Logs", AuditLog: "Logs", SyncLog: "Logs",
    ApiLog: "Logs", ErrorLog: "Logs",
    BackgroundJob: "Operations", ScheduledJob: "Operations", ApiToken: "Security",
    StorageFile: "Storage", Webhook: "Integrations",
    DashboardWidget: "Config", UserPreference: "Config", Setting: "Config",
    Product: "Google", Service: "Google", BusinessAttribute: "Google",
    BusinessHour: "Google", SpecialHour: "Google",
  };
  for (const t of tableNames) {
    try {
      const count = await (db as any)[t].count();
      tableCounts.push({ name: t, count, category: categories[t] || "Other" });
    } catch {
      tableCounts.push({ name: t, count: 0, category: categories[t] || "Other" });
    }
  }

  const [syncLogs, scheduledJobs, backgroundJobs, errorLogs, apiLogs, widgets, storageFiles] = await Promise.all([
    db.syncLog.findMany({ orderBy: { startedAt: "desc" }, take: 15, include: { location: { select: { name: true, city: true } } } }),
    db.scheduledJob.findMany({ orderBy: { nextRun: "asc" } }),
    db.backgroundJob.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    db.errorLog.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { id: true, action: true, userName: true, status: true, createdAt: true } }),
    db.dashboardWidget.findMany({ orderBy: { displayOrder: "asc" } }),
    db.storageFile.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  // Storage buckets summary
  const buckets = ["business-photos", "post-images", "reports", "exports", "documents", "ai-cache", "backups"];
  const bucketStats = await Promise.all(
    buckets.map(async (b) => {
      const files = await db.storageFile.findMany({ where: { bucket: b }, select: { fileSize: true } });
      return { bucket: b, fileCount: files.length, totalSize: files.reduce((a, f) => a + f.fileSize, 0) };
    }),
  );

  // AI usage summary (last 7 days)
  const aiUsage = await db.aiUsage.findMany({ orderBy: { usageDate: "desc" }, take: 7 });
  const aiTotal = aiUsage.reduce((a, u) => ({ requests: a.requests + u.totalRequests, tokens: a.tokens + u.totalTokens, cost: a.cost + u.estimatedCost }), { requests: 0, tokens: 0, cost: 0 });

  const totalTables = tableCounts.length;
  const totalRows = tableCounts.reduce((a, t) => a + t.count, 0);

  return ok({
    schema: { totalTables, totalRows, tables: tableCounts },
    syncLogs: syncLogs.map((s) => ({
      id: s.id, module: s.module, locationName: s.location?.name ?? "—", locationCity: s.location?.city ?? "",
      status: s.status, startedAt: s.startedAt.toISOString(), completedAt: s.completedAt?.toISOString() ?? null,
      recordsProcessed: s.recordsProcessed, recordsInserted: s.recordsInserted, recordsUpdated: s.recordsUpdated,
      recordsFailed: s.recordsFailed, errorMessage: s.errorMessage,
    })),
    scheduledJobs: scheduledJobs.map((j) => ({
      id: j.id, jobName: j.jobName, cronExpression: j.cronExpression, isEnabled: j.isEnabled,
      lastRun: j.lastRun?.toISOString() ?? null, nextRun: j.nextRun?.toISOString() ?? null,
    })),
    backgroundJobs: backgroundJobs.map((j) => ({
      id: j.id, queueName: j.queueName, jobName: j.jobName, status: j.status, attempts: j.attempts,
      startedAt: j.startedAt?.toISOString() ?? null, completedAt: j.completedAt?.toISOString() ?? null,
      errorMessage: j.errorMessage, createdAt: j.createdAt.toISOString(),
    })),
    errorLogs: errorLogs.map((e) => ({
      id: e.id, module: e.module, errorCode: e.errorCode, errorMessage: e.errorMessage,
      resolved: e.resolved, createdAt: e.createdAt.toISOString(),
    })),
    apiLogs,
    dashboardWidgets: widgets,
    storageBuckets: bucketStats,
    storageFiles: storageFiles.map((f) => ({
      id: f.id, bucket: f.bucket, originalName: f.originalName, mimeType: f.mimeType, fileSize: f.fileSize,
      createdAt: f.createdAt.toISOString(),
    })),
    aiUsage: { total: aiTotal, daily: aiUsage.map((u) => ({ date: u.usageDate.toISOString(), requests: u.totalRequests, tokens: u.totalTokens, cost: u.estimatedCost })) },
  });
}
