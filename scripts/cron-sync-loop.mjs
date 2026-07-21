/**
 * Local / VPS helper: run Google sync-all every 6 hours.
 * Keep this process running alongside `npm run dev` or PM2.
 *
 *   npm run cron:sync:loop
 *   pm2 start scripts/cron-sync-loop.mjs --name myfng-sync-cron
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INTERVAL_MS = 6 * 60 * 60 * 1000;
const script = path.join(__dirname, "run-sync-all.mjs");

function runOnce() {
  return new Promise((resolve) => {
    console.log(`\n[${new Date().toISOString()}] Starting scheduled Google sync…`);
    const child = spawn(process.execPath, [script], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => {
      console.log(`[${new Date().toISOString()}] Sync finished (exit ${code ?? 0})`);
      resolve(code ?? 0);
    });
  });
}

console.log(`MyFNG Google sync loop — every 6 hours`);
console.log(`First run now, then every ${INTERVAL_MS / 3600000}h. Ctrl+C to stop.`);

await runOnce();
setInterval(() => {
  void runOnce();
}, INTERVAL_MS);
