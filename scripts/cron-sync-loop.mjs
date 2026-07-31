/**
 * Local / VPS helper: poll Google sync-all often; sync-all itself skips if
 * Settings → Sync interval has not elapsed.
 *
 *   npm run cron:sync:loop
 *   pm2 start scripts/cron-sync-loop.mjs --name myfng-sync-cron
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Poll every 5 minutes — actual sync cadence is controlled by Settings → Sync */
const POLL_MS = 5 * 60 * 1000;
const script = path.join(__dirname, "run-sync-all.mjs");

function runOnce() {
  return new Promise((resolve) => {
    console.log(`\n[${new Date().toISOString()}] Polling Google sync…`);
    const child = spawn(process.execPath, [script], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => {
      console.log(`[${new Date().toISOString()}] Sync poll finished (exit ${code ?? 0})`);
      resolve(code ?? 0);
    });
  });
}

console.log(`MyFNG Google sync loop — poll every ${POLL_MS / 60000}m (interval from Settings)`);
console.log(`First poll now. Ctrl+C to stop.`);

await runOnce();
setInterval(() => {
  void runOnce();
}, POLL_MS);
