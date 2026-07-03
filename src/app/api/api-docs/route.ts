import { ok } from "@/lib/api-response";

export const dynamic = "force-dynamic";

// GET /api/api-docs — full API documentation (doc 13)
export async function GET() {
  return ok({
    version: "v1",
    baseUrl: "/api",
    authentication: "JWT (NextAuth Credentials)",
    responseFormat: {
      success: true,
      message: "Request completed successfully.",
      data: {},
      errors: null,
      timestamp: "ISO_DATE",
    },
    httpStatusCodes: {
      200: "OK",
      201: "Created",
      204: "No Content",
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      409: "Conflict",
      422: "Validation Error",
      429: "Too Many Requests",
      500: "Internal Server Error",
    },
    rateLimiting: {
      auth: "10 requests/minute",
      ai: "30 requests/minute",
      general: "120 requests/minute",
      fileUpload: "20 requests/minute",
    },
    pagination: { params: ["page", "limit", "sort", "order"], example: "GET /api/reviews?page=1&limit=20" },
    endpoints: [
      // Auth
      { group: "Authentication", method: "POST", path: "/api/auth/callback/credentials", desc: "Login with email + password (NextAuth)" },
      { group: "Authentication", method: "GET", path: "/api/auth/session", desc: "Get current session" },
      { group: "Authentication", method: "GET", path: "/api/session", desc: "Get current user" },
      // Dashboard
      { group: "Dashboard", method: "GET", path: "/api/dashboard", desc: "Dashboard summary KPIs" },
      { group: "Dashboard", method: "POST", path: "/api/dashboard", desc: "Trigger Google sync" },
      { group: "Dashboard", method: "GET", path: "/api/dashboard/executive", desc: "Executive dashboard with all KPIs + AI insights" },
      // Locations
      { group: "Locations", method: "GET", path: "/api/locations", desc: "List all locations" },
      { group: "Locations", method: "GET", path: "/api/locations/{id}", desc: "Location detail with business info, hours, services, timeline" },
      { group: "Locations", method: "PUT", path: "/api/locations/{id}", desc: "Update location + business info + hours" },
      { group: "Locations", method: "POST", path: "/api/locations/{id}/sync", desc: "Trigger sync for single location" },
      { group: "Locations", method: "POST", path: "/api/locations/bulk", desc: "Bulk sync/archive/activate locations" },
      // Reviews
      { group: "Reviews", method: "GET", path: "/api/reviews", desc: "List reviews with filters (location, status, sentiment, rating)" },
      { group: "Reviews", method: "GET", path: "/api/reviews/stats", desc: "Review analytics: response rate, SLA, rating distribution, trends" },
      { group: "Reviews", method: "GET", path: "/api/reviews/export", desc: "Export reviews as CSV" },
      { group: "Reviews", method: "GET", path: "/api/reviews/{id}/reply", desc: "Generate AI reply draft (MiSA AI)" },
      { group: "Reviews", method: "POST", path: "/api/reviews/{id}/reply", desc: "Publish reply to Google Business Profile" },
      { group: "Reviews", method: "PATCH", path: "/api/reviews/{id}/reply", desc: "Mark review as ignored" },
      { group: "Reviews", method: "GET", path: "/api/reviews/{id}/notes", desc: "List internal notes" },
      { group: "Reviews", method: "POST", path: "/api/reviews/{id}/notes", desc: "Add internal note" },
      { group: "Reviews", method: "GET", path: "/api/review-templates", desc: "List reply templates" },
      { group: "Reviews", method: "POST", path: "/api/review-templates", desc: "Create reply template" },
      { group: "Reviews", method: "PATCH", path: "/api/review-templates", desc: "Update reply template" },
      { group: "Reviews", method: "DELETE", path: "/api/review-templates?id=", desc: "Delete reply template" },
      // Posts
      { group: "Google Posts", method: "GET", path: "/api/posts", desc: "List posts with filters" },
      { group: "Google Posts", method: "GET", path: "/api/posts/stats", desc: "Post analytics dashboard" },
      { group: "Google Posts", method: "POST", path: "/api/posts", desc: "Create post or generate AI content" },
      { group: "Google Posts", method: "PATCH", path: "/api/posts/{id}", desc: "Update post status/content" },
      { group: "Google Posts", method: "DELETE", path: "/api/posts/{id}", desc: "Delete post" },
      { group: "Google Posts", method: "POST", path: "/api/posts/bulk", desc: "Bulk publish/schedule/archive/delete + multi-location publish" },
      // Analytics
      { group: "Analytics", method: "GET", path: "/api/analytics", desc: "Analytics series + per-location totals" },
      { group: "Analytics", method: "GET", path: "/api/analytics/ai-insights", desc: "AI-generated performance insights" },
      { group: "Analytics", method: "GET", path: "/api/analytics/location-comparison", desc: "Compare locations by analytics metrics" },
      { group: "Analytics", method: "GET", path: "/api/analytics/export", desc: "Export analytics as CSV" },
      // SEO
      { group: "Local SEO", method: "GET", path: "/api/seo", desc: "SEO overview with keywords + geo-grid" },
      { group: "Local SEO", method: "GET", path: "/api/seo/keywords", desc: "List keywords with rank stats" },
      { group: "Local SEO", method: "POST", path: "/api/seo/keywords", desc: "Add keyword" },
      { group: "Local SEO", method: "PUT", path: "/api/seo/keywords/{id}", desc: "Update keyword" },
      { group: "Local SEO", method: "DELETE", path: "/api/seo/keywords/{id}", desc: "Delete keyword" },
      { group: "Local SEO", method: "GET", path: "/api/seo/rankings", desc: "Rank history per keyword" },
      { group: "Local SEO", method: "POST", path: "/api/seo/refresh", desc: "Trigger rank refresh" },
      { group: "Local SEO", method: "GET", path: "/api/seo/geo-grid", desc: "Configurable geo-grid (3x3/5x5/7x7, 1/3/5/10km)" },
      { group: "Local SEO", method: "GET", path: "/api/seo/location-comparison", desc: "Compare locations by SEO metrics" },
      { group: "Local SEO", method: "GET", path: "/api/seo-audits", desc: "SEO audit list" },
      { group: "Local SEO", method: "GET", path: "/api/competitors", desc: "Competitor monitoring with rankings" },
      // AI
      { group: "AI (MiSA AI)", method: "POST", path: "/api/ai", desc: "Unified AI endpoint (action: chat|seo|summary)" },
      // Media
      { group: "Media", method: "GET", path: "/api/media", desc: "List media files" },
      // Reports
      { group: "Reports", method: "GET", path: "/api/reports", desc: "List reports" },
      { group: "Reports", method: "POST", path: "/api/reports", desc: "Generate report" },
      // Google Integration
      { group: "Google Integration", method: "GET", path: "/api/google-integration", desc: "OAuth status + profiles + sync health" },
      { group: "Google Integration", method: "POST", path: "/api/google-integration", desc: "Connect/disconnect/sync (action param)" },
      // Notifications
      { group: "Notifications", method: "GET", path: "/api/notifications", desc: "List notifications" },
      { group: "Notifications", method: "PATCH", path: "/api/notifications", desc: "Mark all as read" },
      { group: "Notifications", method: "PATCH", path: "/api/notifications/{id}", desc: "Mark single as read" },
      // Users
      { group: "Users", method: "GET", path: "/api/users", desc: "List users" },
      { group: "Users", method: "POST", path: "/api/users", desc: "Create/invite user" },
      { group: "Users", method: "PATCH", path: "/api/users", desc: "Update user (role, status, locations)" },
      // Settings
      { group: "Settings", method: "GET", path: "/api/settings", desc: "Get all settings" },
      { group: "Settings", method: "PATCH", path: "/api/settings", desc: "Update setting" },
      { group: "Settings", method: "POST", path: "/api/settings/test-email", desc: "Test SMTP" },
      // Admin
      { group: "Admin", method: "GET", path: "/api/admin/system-health", desc: "Detailed health checks (8 services)" },
      { group: "Admin", method: "GET", path: "/api/admin/api-usage", desc: "API usage stats (requests, AI, sync)" },
      { group: "Admin", method: "GET", path: "/api/admin/jobs", desc: "Background jobs list + stats" },
      { group: "Admin", method: "POST", path: "/api/admin/jobs/{id}/retry", desc: "Retry failed job" },
      { group: "Admin", method: "POST", path: "/api/admin/test-email", desc: "Test SMTP email" },
      { group: "Admin", method: "GET", path: "/api/admin/backup", desc: "Backup status + history" },
      { group: "Admin", method: "POST", path: "/api/admin/backup", desc: "Trigger manual backup" },
      // System
      { group: "System", method: "GET", path: "/api/system", desc: "Full system overview (schema, logs, jobs, storage, AI)" },
      { group: "System", method: "GET", path: "/api/system-info", desc: "Environment & deployment info" },
      { group: "System", method: "GET", path: "/api/health", desc: "Public health check endpoint" },
      // Audit & Activity
      { group: "Logs", method: "GET", path: "/api/audit-logs", desc: "Audit logs (immutable)" },
      { group: "Logs", method: "GET", path: "/api/activity-logs", desc: "Activity logs (user actions)" },
    ],
  });
}
