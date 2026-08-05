import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** Cap Prisma pool so we stay under Supavisor session pool_size (often 20). */
function datasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", process.env.PRISMA_CONNECTION_LIMIT || "3");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "20");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function createPrismaClient() {
  return new PrismaClient({
    datasources: { db: { url: datasourceUrl() } },
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

// Always reuse across hot-reload / multiple route modules (dev + prod)
globalForPrisma.prisma = db;
