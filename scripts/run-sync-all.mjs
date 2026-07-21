/**
 * One-shot: trigger Google full sync for all linked locations.
 * Usage: npm run cron:sync
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");

function loadEnv() {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnv();

const base = process.env.CRON_BASE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("CRON_SECRET is missing. Add it to .env then retry.");
  process.exit(1);
}

const url = `${base.replace(/\/$/, "")}/api/cron/sync-all`;
console.log(`[cron:sync] GET → ${url}`);

const res = await fetch(url, {
  headers: { "x-cron-secret": secret },
});
const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = { raw: text };
}

if (!res.ok) {
  console.error("[cron:sync] FAILED", res.status, json);
  process.exit(1);
}

console.log("[cron:sync] OK", json.message || json);
if (json.data) {
  console.log(
    `  synced=${json.data.synced}/${json.data.total} failed=${json.data.failed} next=${json.data.nextRun}`,
  );
}
