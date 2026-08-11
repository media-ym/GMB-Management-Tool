#!/usr/bin/env node
/**
 * One-shot setup for self-hosted Supabase (89.116.21.158 or any Kong host).
 *
 * Prerequisites:
 *   .env with NEXT_PUBLIC_SUPABASE_URL, keys, DATABASE_URL
 *
 * Usage:
 *   node scripts/self-hosted-supabase-setup.mjs
 *   node scripts/self-hosted-supabase-setup.mjs --skip-seed
 *   node scripts/self-hosted-supabase-setup.mjs --with-cron
 */
import { spawnSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function env(name, fallback) {
  return (process.env[name] || fallback || "").trim();
}

const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY");
const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
const databaseUrl = env("DATABASE_URL");

const args = new Set(process.argv.slice(2));
const skipSeed = args.has("--skip-seed");
const withCron = args.has("--with-cron");

function run(cmd, cmdArgs, label) {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    console.error(`\n✗ Failed: ${label}`);
    process.exit(r.status ?? 1);
  }
}

function checkEnv() {
  console.log("=== MyFNG → Self-hosted Supabase setup ===\n");
  const missing = [];
  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY");
  if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY");
  if (!databaseUrl) missing.push("DATABASE_URL");
  if (missing.length) {
    console.error("Missing env vars:\n  " + missing.join("\n  "));
    console.error("\nCopy .env.example → .env and fill self-hosted Supabase values.");
    process.exit(1);
  }
  console.log(`Supabase API: ${supabaseUrl}`);
  console.log(`Database:     ${databaseUrl.replace(/:[^:@/]+@/, ":****@")}`);
}

async function healthCheck() {
  console.log("\n▶ Health check (Auth API)");
  try {
    const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/health`, {
      headers: { apikey: anonKey },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json().catch(() => ({}));
    console.log(`  ✓ GoTrue ${json.version || "ok"}`);
  } catch (e) {
    console.error(`  ✗ Cannot reach Supabase at ${supabaseUrl}`);
    console.error(`    ${e.message || e}`);
    console.error("    Check: Kong on port 8000, firewall, NEXT_PUBLIC_SUPABASE_URL");
    process.exit(1);
  }
}

async function runSqlFile(relPath) {
  const file = resolve(root, relPath);
  if (!existsSync(file)) {
    console.log(`  skip (missing ${relPath})`);
    return;
  }
  console.log(`  → ${relPath}`);
  run("node", ["scripts/supabase-pg-query.mjs", "--file", relPath], `SQL: ${relPath}`);
}

async function main() {
  checkEnv();
  await healthCheck();

  // Ensure Prisma uses PostgreSQL schema
  const schemaPg = resolve(root, "prisma/schema.postgresql.prisma");
  const schemaActive = resolve(root, "prisma/schema.prisma");
  if (databaseUrl.startsWith("postgres") && existsSync(schemaPg)) {
    const src = readFileSync(schemaPg, "utf8");
    const dst = readFileSync(schemaActive, "utf8");
    if (!dst.includes('provider = "postgresql"')) {
      run("cp", [schemaPg, schemaActive], "Switch Prisma schema to PostgreSQL");
    }
  }

  run("npx", ["prisma", "generate"], "Prisma generate");
  run("npx", ["prisma", "db", "push"], "Prisma db push (all app tables)");

  console.log("\n▶ Supabase SQL migrations");
  const migrations = [
    "supabase/migrations/20260728120000_storage_buckets_and_rls.sql",
    "supabase/migrations/20260728120100_app_rls_helpers.sql",
    "supabase/migrations/20260729143000_sync_schema_drift_fix.sql",
    "supabase/migrations/20260729173000_competitor_metrics_columns.sql",
  ];
  for (const m of migrations) {
    await runSqlFile(m);
  }

  if (withCron) {
    await runSqlFile("supabase/cron-jobs.sql");
  } else {
    console.log("\n  (skip cron-jobs.sql — run with --with-cron after CRON_SECRET is set)");
  }

  if (!skipSeed) {
    run("npx", ["tsx", "prisma/seed.ts"], "Seed users & sample data");
    run("node", ["scripts/supabase-bootstrap-users.mjs"], "Link Prisma users → Supabase Auth");
  }

  console.log("\n=== Setup complete ===");
  console.log("\nNext:");
  console.log("  1. npm run dev          (local)");
  console.log("  2. npm run build && npm run start   (production)");
  console.log("  3. Login: admin@myfng.in / SEED_PASSWORD from .env");
  console.log("  4. Studio: http://89.116.21.158:8001 (user: supabase)");
  if (!withCron) {
    console.log("  5. Cron jobs: paste supabase/cron-jobs.sql in Studio SQL Editor");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
