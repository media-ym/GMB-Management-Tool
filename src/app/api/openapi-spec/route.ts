import { ok } from "@/lib/api-response";

export const dynamic = "force-dynamic";

// GET /api/openapi-spec — complete OpenAPI 3.1 specification (doc 22, merged from 4 parts)
export async function GET() {
  return ok({
    openapi: "3.1.0",
    info: {
      title: "MyFNG Local AI Manager API",
      version: "1.0.0",
      description: "Internal API specification for MyFNG Local AI Manager. This API manages Google Business Profiles, Reviews, Google Posts, Analytics, Local SEO, AI Services, Reports and Administration.",
    },
    servers: [
      { url: "https://localai.myfng.in/api/v1", description: "Production" },
      { url: "https://staging.localai.myfng.in/api/v1", description: "Staging" },
      { url: "http://localhost:3000/api/v1", description: "Development" },
    ],
    security: [{ BearerAuth: [] }],
    tags: [
      "Authentication", "Users", "Locations", "Google Business Profile",
      "Reviews", "Google Posts", "Analytics", "SEO", "AI",
      "Reports", "Notifications", "Admin", "System",
    ],
    // ─── Schemas ──────────────────────────────────────────────────────
    schemas: [
      { name: "SuccessResponse", description: "Standard success response envelope", properties: [
        { field: "success", type: "boolean", example: "true" },
        { field: "message", type: "string" },
        { field: "data", type: "object" },
        { field: "pagination", type: "Pagination", required: false },
      ]},
      { name: "ErrorResponse", description: "Standard error response", properties: [
        { field: "success", type: "boolean", example: "false" },
        { field: "message", type: "string" },
        { field: "errors", type: "array", items: "ErrorDetail" },
      ]},
      { name: "Pagination", description: "Pagination metadata", properties: [
        { field: "page", type: "integer" },
        { field: "limit", type: "integer" },
        { field: "total", type: "integer" },
        { field: "totalPages", type: "integer" },
      ]},
      { name: "LoginRequest", description: "Login request body", properties: [
        { field: "email", type: "string (email)", required: true },
        { field: "password", type: "string (password)", required: true },
      ]},
      { name: "User", description: "User object", properties: [
        { field: "id", type: "UUID" },
        { field: "full_name", type: "string" },
        { field: "email", type: "string" },
        { field: "role", type: "string" },
        { field: "status", type: "string" },
        { field: "created_at", type: "date-time" },
      ]},
      { name: "Location", description: "Location object", properties: [
        { field: "id", type: "UUID" },
        { field: "name", type: "string" },
        { field: "city", type: "string" },
        { field: "rating", type: "number" },
        { field: "review_count", type: "integer" },
        { field: "health_score", type: "integer" },
      ]},
      { name: "Review", description: "Review object", properties: [
        { field: "id", type: "UUID" },
        { field: "reviewer_name", type: "string" },
        { field: "rating", type: "integer" },
        { field: "review_text", type: "string" },
        { field: "sentiment", type: "string" },
        { field: "ai_summary", type: "string" },
        { field: "replied", type: "boolean" },
      ]},
      { name: "GooglePost", description: "Google Post object", properties: [
        { field: "id", type: "UUID" },
        { field: "title", type: "string" },
        { field: "description", type: "string" },
        { field: "status", type: "string" },
        { field: "scheduled_at", type: "date-time" },
      ]},
      { name: "Keyword", description: "SEO keyword object", properties: [
        { field: "keyword", type: "string" },
        { field: "ranking", type: "integer" },
        { field: "previous_ranking", type: "integer" },
        { field: "visibility_score", type: "number" },
      ]},
      { name: "Notification", description: "Notification object", properties: [
        { field: "id", type: "UUID" },
        { field: "title", type: "string" },
        { field: "message", type: "string" },
        { field: "priority", type: "string" },
        { field: "is_read", type: "boolean" },
      ]},
      { name: "DashboardSummary", description: "Dashboard summary metrics", properties: [
        { field: "total_locations", type: "integer" },
        { field: "average_rating", type: "number" },
        { field: "total_reviews", type: "integer" },
        { field: "pending_replies", type: "integer" },
        { field: "seo_score", type: "number" },
        { field: "health_score", type: "number" },
      ]},
    ],
    // ─── Parameters ───────────────────────────────────────────────────
    parameters: [
      { name: "Page", location: "query", type: "integer", default: "1" },
      { name: "Limit", location: "query", type: "integer", default: "20" },
      { name: "Search", location: "query", type: "string" },
      { name: "Sort", location: "query", type: "string" },
      { name: "Order", location: "query", type: "string", enum: ["asc", "desc"] },
      { name: "LocationId", location: "path", type: "UUID", required: true },
      { name: "ReviewId", location: "path", type: "UUID", required: true },
      { name: "PostId", location: "path", type: "UUID", required: true },
      { name: "UserId", location: "path", type: "UUID", required: true },
      { name: "KeywordId", location: "path", type: "UUID", required: true },
      { name: "NotificationId", location: "path", type: "UUID", required: true },
      { name: "ReportId", location: "path", type: "UUID", required: true },
      { name: "JobId", location: "path", type: "UUID", required: true },
    ],
    // ─── HTTP Status Responses ────────────────────────────────────────
    responses: [
      { code: "200", description: "Success" },
      { code: "201", description: "Created" },
      { code: "204", description: "No Content" },
      { code: "400", description: "Bad Request" },
      { code: "401", description: "Unauthorized — Authentication Required" },
      { code: "403", description: "Forbidden — Permission Denied" },
      { code: "404", description: "Not Found" },
      { code: "422", description: "Validation Failed" },
      { code: "429", description: "Too Many Requests" },
      { code: "500", description: "Internal Server Error" },
    ],
    // ─── Security ─────────────────────────────────────────────────────
    securitySchemes: [{
      name: "BearerAuth",
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description: "JWT Bearer token authentication via Supabase Auth / NextAuth",
    }],
    // ─── Endpoints (all from doc 22, 4 parts) ────────────────────────
    endpoints: [
      // Authentication
      { tag: "Authentication", method: "POST", path: "/auth/login", summary: "Login", requestBody: "LoginRequest", responses: ["200", "401"] },
      { tag: "Authentication", method: "POST", path: "/auth/logout", summary: "Logout", responses: ["200"] },
      { tag: "Authentication", method: "GET", path: "/auth/me", summary: "Current User", responses: ["200"] },
      // Users
      { tag: "Users", method: "GET", path: "/users", summary: "List Users", parameters: ["page", "limit", "search"], responses: ["200"] },
      { tag: "Users", method: "POST", path: "/users", summary: "Create User", responses: ["201"] },
      { tag: "Users", method: "GET", path: "/users/{id}", summary: "User Details", parameters: ["UserId"], responses: ["200"] },
      { tag: "Users", method: "PUT", path: "/users/{id}", summary: "Update User", parameters: ["UserId"], responses: ["200"] },
      { tag: "Users", method: "PATCH", path: "/users/{id}/disable", summary: "Disable User", parameters: ["UserId"], responses: ["200"] },
      // Locations
      { tag: "Locations", method: "GET", path: "/locations", summary: "List Locations", parameters: ["page", "limit", "city", "status"], responses: ["200"] },
      { tag: "Locations", method: "POST", path: "/locations", summary: "Create Location", responses: ["201"] },
      { tag: "Locations", method: "GET", path: "/locations/{id}", summary: "Location Details", parameters: ["LocationId"], responses: ["200"] },
      { tag: "Locations", method: "PUT", path: "/locations/{id}", summary: "Update Location", parameters: ["LocationId"], responses: ["200"] },
      { tag: "Locations", method: "POST", path: "/locations/{id}/sync", summary: "Sync Google Profile", parameters: ["LocationId"], responses: ["200"] },
      // Google Business Profile
      { tag: "Google Business Profile", method: "POST", path: "/google/connect", summary: "Connect Google Account (OAuth)", responses: ["200", "401"] },
      { tag: "Google Business Profile", method: "GET", path: "/google/callback", summary: "Google OAuth Callback", responses: ["200"] },
      { tag: "Google Business Profile", method: "GET", path: "/google/accounts", summary: "List Connected Accounts", responses: ["200"] },
      { tag: "Google Business Profile", method: "GET", path: "/google/profiles", summary: "Get Business Profiles", responses: ["200"] },
      { tag: "Google Business Profile", method: "POST", path: "/google/profiles/sync", summary: "Sync Business Profiles", responses: ["200"] },
      // Reviews
      { tag: "Reviews", method: "GET", path: "/reviews", summary: "List Reviews", parameters: ["page", "limit", "rating", "location_id", "sentiment", "status"], responses: ["200"] },
      { tag: "Reviews", method: "GET", path: "/reviews/{reviewId}", summary: "Review Details", parameters: ["ReviewId"], responses: ["200"] },
      { tag: "Reviews", method: "POST", path: "/reviews/{reviewId}/reply", summary: "Publish Review Reply", parameters: ["ReviewId"], requestBody: "ReplyRequest", responses: ["200", "400"] },
      { tag: "Reviews", method: "GET", path: "/reviews/export", summary: "Export Reviews (CSV)", responses: ["200"] },
      // Google Posts
      { tag: "Google Posts", method: "GET", path: "/posts", summary: "List Google Posts", responses: ["200"] },
      { tag: "Google Posts", method: "POST", path: "/posts", summary: "Create Google Post", requestBody: "PostRequest", responses: ["201"] },
      { tag: "Google Posts", method: "GET", path: "/posts/{postId}", summary: "Get Google Post", parameters: ["PostId"], responses: ["200"] },
      { tag: "Google Posts", method: "PUT", path: "/posts/{postId}", summary: "Update Google Post", parameters: ["PostId"], responses: ["200"] },
      { tag: "Google Posts", method: "DELETE", path: "/posts/{postId}", summary: "Delete Draft", parameters: ["PostId"], responses: ["204"] },
      { tag: "Google Posts", method: "POST", path: "/posts/{postId}/publish", summary: "Publish Google Post", parameters: ["PostId"], responses: ["200"] },
      { tag: "Google Posts", method: "POST", path: "/posts/{postId}/schedule", summary: "Schedule Google Post", parameters: ["PostId"], responses: ["200"] },
      // Analytics
      { tag: "Analytics", method: "GET", path: "/analytics", summary: "Analytics Overview", parameters: ["location_id", "from", "to"], responses: ["200"] },
      { tag: "Analytics", method: "GET", path: "/analytics/dashboard", summary: "Executive Dashboard", responses: ["200"] },
      { tag: "Analytics", method: "GET", path: "/analytics/location/{locationId}", summary: "Location Analytics", parameters: ["LocationId"], responses: ["200"] },
      { tag: "Analytics", method: "GET", path: "/analytics/reviews", summary: "Review Analytics", responses: ["200"] },
      { tag: "Analytics", method: "GET", path: "/analytics/export", summary: "Export Analytics (CSV)", responses: ["200"] },
      // SEO
      { tag: "SEO", method: "GET", path: "/seo/overview", summary: "SEO Dashboard Overview", responses: ["200"] },
      { tag: "SEO", method: "GET", path: "/seo/keywords", summary: "List Keywords", parameters: ["location_id", "page"], responses: ["200"] },
      { tag: "SEO", method: "POST", path: "/seo/keywords", summary: "Add Keyword", requestBody: "KeywordRequest", responses: ["201"] },
      { tag: "SEO", method: "PUT", path: "/seo/keywords/{keywordId}", summary: "Update Keyword", parameters: ["KeywordId"], responses: ["200"] },
      { tag: "SEO", method: "DELETE", path: "/seo/keywords/{keywordId}", summary: "Delete Keyword", parameters: ["KeywordId"], responses: ["204"] },
      { tag: "SEO", method: "GET", path: "/seo/rankings", summary: "Keyword Rankings", responses: ["200"] },
      { tag: "SEO", method: "GET", path: "/seo/geo-grid", summary: "Geo Grid Ranking", responses: ["200"] },
      { tag: "SEO", method: "GET", path: "/seo/competitors", summary: "Competitor Analysis", responses: ["200"] },
      { tag: "SEO", method: "GET", path: "/seo/audit", summary: "Profile SEO Audit", responses: ["200"] },
      // AI
      { tag: "AI", method: "POST", path: "/ai/review", summary: "Generate AI Review Reply", responses: ["200"] },
      { tag: "AI", method: "POST", path: "/ai/post", summary: "Generate AI Google Post", responses: ["200"] },
      { tag: "AI", method: "POST", path: "/ai/business-description", summary: "Generate Business Description", responses: ["200"] },
      { tag: "AI", method: "POST", path: "/ai/seo", summary: "Generate SEO Recommendations", responses: ["200"] },
      { tag: "AI", method: "POST", path: "/ai/reports", summary: "Generate Monthly AI Report", responses: ["200"] },
      { tag: "AI", method: "GET", path: "/ai/history", summary: "AI Generation History", responses: ["200"] },
      // Reports
      { tag: "Reports", method: "GET", path: "/reports", summary: "List Reports", responses: ["200"] },
      { tag: "Reports", method: "POST", path: "/reports", summary: "Generate Report", requestBody: "ReportRequest", responses: ["201"] },
      { tag: "Reports", method: "GET", path: "/reports/{reportId}", summary: "Report Details", parameters: ["ReportId"], responses: ["200"] },
      { tag: "Reports", method: "GET", path: "/reports/{reportId}/download", summary: "Download Report", parameters: ["ReportId"], responses: ["200"] },
      // Notifications
      { tag: "Notifications", method: "GET", path: "/notifications", summary: "Notification List", responses: ["200"] },
      { tag: "Notifications", method: "PATCH", path: "/notifications/{notificationId}/read", summary: "Mark Notification Read", parameters: ["NotificationId"], responses: ["200"] },
      { tag: "Notifications", method: "PATCH", path: "/notifications/read-all", summary: "Mark All Notifications Read", responses: ["200"] },
      // Admin
      { tag: "Admin", method: "GET", path: "/admin/users", summary: "List Users (Admin)", responses: ["200"] },
      { tag: "Admin", method: "GET", path: "/admin/settings", summary: "System Settings", responses: ["200"] },
      { tag: "Admin", method: "PUT", path: "/admin/settings", summary: "Update Settings", responses: ["200"] },
      { tag: "Admin", method: "GET", path: "/admin/audit-logs", summary: "Audit Logs", responses: ["200"] },
      { tag: "Admin", method: "GET", path: "/admin/activity-logs", summary: "Activity Logs", responses: ["200"] },
      { tag: "Admin", method: "GET", path: "/admin/jobs", summary: "Background Jobs", responses: ["200"] },
      { tag: "Admin", method: "POST", path: "/admin/jobs/{jobId}/retry", summary: "Retry Failed Job", parameters: ["JobId"], responses: ["200"] },
      // System
      { tag: "System", method: "GET", path: "/system/health", summary: "System Health", responses: ["200"] },
      { tag: "System", method: "GET", path: "/system/status", summary: "Application Status", responses: ["200"] },
      { tag: "System", method: "GET", path: "/system/version", summary: "Application Version", responses: ["200"] },
    ],
    // ─── Project metadata ─────────────────────────────────────────────
    project: {
      project: "MyFNG Local AI Manager",
      organization: "MyFNG",
      backend: "Next.js 16 (adapted from spec's Next.js 15)",
      database: "Prisma + SQLite (adapted from Supabase PostgreSQL)",
      authentication: "NextAuth Credentials + JWT (adapted from Supabase Auth)",
      storage: "Local file system (adapted from Supabase Storage)",
      queue: "In-memory (adapted from Upstash Redis)",
      ai: ["MiSA AI (glm-4.6 via z-ai-web-dev-sdk)"],
      integrations: [
        "Google Business Profile API",
        "Google Business Information API",
        "Google Performance API",
      ],
      version: "1.0.0",
      externalDocs: "https://localai.myfng.in/docs",
    },
  });
}
