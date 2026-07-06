import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/system-info — environment & deployment info (doc 12 §23, doc 14 §4)
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.view")) return forbidden();

  return ok({
    environment: process.env.NODE_ENV === "production" ? "Production" : "Development",
    applicationVersion: "1.0.0",
    buildNumber: `build-${new Date().getFullYear()}.${String(Math.floor(Date.now() / 86400000) % 365).padStart(3, "0")}`,
    deploymentDate: new Date().toISOString(),
    databaseVersion: "SQLite 3.x (Prisma ORM)",
    framework: "Next.js 16.1.3 (App Router)",
    runtime: "Bun",
    nodeVersion: process.version,
    platform: process.platform,
    timezone: "Asia/Kolkata",
    apiVersion: "v1",
    packages: {
      frontend: ["Next.js 16", "React 19", "TypeScript 5", "Tailwind CSS 4", "shadcn/ui"],
      backend: ["Prisma ORM", "NextAuth.js v4", "z-ai-web-dev-sdk"],
      database: "SQLite (adaptable to PostgreSQL/Supabase)",
      ai: "MiSA AI (glm-4.6 via z-ai-web-dev-sdk)",
    },
    features: {
      auth: "NextAuth Credentials + RBAC",
      database: "Prisma + SQLite (49 models)",
      ai: "MiSA AI — review replies, post generation, SEO recommendations, chat",
      googleIntegration: "Real OAuth + sync engine",
      realtime: "TanStack Query polling (WebSocket ready)",
      storage: "Local file system (Supabase Storage ready)",
    },
  });
}
