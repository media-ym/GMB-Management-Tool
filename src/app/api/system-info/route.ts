import { getSessionUser } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { getBrandConfig } from "@/lib/app-settings";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.view")) return forbidden();

  const brand = await getBrandConfig();
  const [users, locations, settingsCount] = await Promise.all([
    db.user.count(),
    db.location.count(),
    db.setting.count(),
  ]);

  const dbUrl = process.env.DATABASE_URL || "";
  const databaseVersion = dbUrl.includes("postgres") || dbUrl.includes("supabase")
    ? "PostgreSQL (Prisma ORM)"
    : dbUrl.includes("file:") || dbUrl.includes("sqlite")
      ? "SQLite (Prisma ORM)"
      : "Prisma ORM";

  return ok({
    environment: process.env.NODE_ENV === "production" ? "Production" : "Development",
    applicationVersion: process.env.npm_package_version || "1.0.0",
    buildNumber: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7)
      || process.env.GIT_COMMIT?.slice(0, 7)
      || `local-${process.env.NODE_ENV || "dev"}`,
    deploymentDate: process.env.BUILD_TIME || null,
    databaseVersion,
    framework: "Next.js (App Router)",
    runtime: typeof (globalThis as any).Bun !== "undefined" ? "Bun" : "Node.js",
    nodeVersion: process.version,
    platform: process.platform,
    timezone: brand.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    apiVersion: "v1",
    brandName: brand.name || "MyFNG",
    packages: {
      frontend: ["Next.js", "React 19", "TypeScript", "Tailwind CSS", "shadcn/ui"],
      backend: ["Prisma ORM", "Supabase Auth", "OpenRouter (MiSA AI)"],
      database: databaseVersion,
      ai: "MiSA AI via OpenRouter",
    },
    features: {
      auth: "Supabase Auth + RBAC",
      database: `Prisma · ${users} users · ${locations} locations · ${settingsCount} settings`,
      ai: "MiSA AI — reviews, posts, SEO, chat",
      googleIntegration: "OAuth + sync engine",
      realtime: "TanStack Query polling",
      storage: process.env.NEXT_PUBLIC_SUPABASE_URL ? "Supabase Storage" : "Local filesystem",
    },
  });
}
