/**
 * Keeps ngrok tunnel alive — restarts if the process exits.
 * Log: /tmp/ngrok-myfng.log
 * URL: /tmp/ngrok-public-url.txt
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const worker = path.join(__dirname, "tunnel.mjs");
const log = "/tmp/ngrok-myfng.log";
const pidFile = "/tmp/ngrok-myfng-watch.pid";
const urlFile = "/tmp/ngrok-public-url.txt";

fs.writeFileSync(pidFile, String(process.pid));

function appendLog(line) {
  fs.appendFileSync(log, `[watch ${new Date().toISOString()}] ${line}\n`);
}

function startOnce() {
  return new Promise((resolve) => {
    const out = fs.openSync(log, "a");
    const child = spawn(process.execPath, [worker], {
      stdio: ["ignore", out, out],
      cwd: path.join(__dirname, ".."),
      env: process.env,
    });
    appendLog(`started tunnel worker pid=${child.pid}`);
    child.on("exit", (code, signal) => {
      appendLog(`tunnel exited code=${code} signal=${signal}`);
      resolve({ code, signal });
    });
  });
}

async function loop() {
  appendLog("watchdog started");
  while (true) {
    await startOnce();
    // brief pause before restart (ngrok free tier rate limits)
    await new Promise((r) => setTimeout(r, 2000));
    appendLog("restarting tunnel…");
  }
}

loop().catch((err) => {
  appendLog(`watchdog fatal: ${err?.message || err}`);
  process.exit(1);
});
