#!/usr/bin/env node
/**
 * Run SQL against self-hosted Supabase via /pg/query (service role).
 * Usage:
 *   node scripts/supabase-pg-query.mjs --file supabase/migrations/xxx.sql
 *   node scripts/supabase-pg-query.mjs --sql 'select 1'
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

function parseArgs(argv) {
  const out = { file: null, sql: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--file") out.file = argv[++i];
    else if (argv[i] === "--sql") out.sql = argv[++i];
  }
  return out;
}

/** Split SQL into statements; keep it simple for Prisma-generated DDL. */
function splitSql(sql) {
  const cleaned = sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  return cleaned
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function runQuery(query) {
  const res = await fetch(`${url}/pg/query`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok || data?.error || data?.formattedError) {
    const msg = data?.formattedError || data?.message || data?.error || text;
    throw new Error(msg);
  }
  return data;
}

const args = parseArgs(process.argv);
let sql = args.sql;
if (args.file) {
  sql = readFileSync(resolve(args.file), "utf8");
}
if (!sql) {
  console.error("Provide --file or --sql");
  process.exit(1);
}

const statements = splitSql(sql);
let ok = 0;
let skipped = 0;

for (let i = 0; i < statements.length; i++) {
  const statement = statements[i];
  process.stdout.write(`[${i + 1}/${statements.length}] `);
  try {
    await runQuery(statement);
    console.log("ok");
    ok++;
  } catch (e) {
    const msg = String(e.message || e);
    // Idempotent-ish: ignore already exists
    if (/already exists|duplicate key/i.test(msg)) {
      console.log("skip (exists)");
      skipped++;
    } else {
      console.error("FAIL\n", statement.slice(0, 200), "\n", msg);
      process.exit(1);
    }
  }
}

console.log(`\nDone. ok=${ok} skipped=${skipped}`);
