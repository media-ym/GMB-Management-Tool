import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watchdog = path.join(__dirname, "tunnel-watch.mjs");
const log = "/tmp/ngrok-myfng.log";
const watchPidFile = "/tmp/ngrok-myfng-watch.pid";
const workerPidFile = "/tmp/ngrok-myfng.pid";

// Kill previous watchdog + workers
for (const f of [watchPidFile, workerPidFile]) {
  try {
    if (fs.existsSync(f)) {
      const pid = parseInt(fs.readFileSync(f, "utf8").trim(), 10);
      if (Number.isFinite(pid)) process.kill(pid, "SIGTERM");
    }
  } catch {
    // already dead
  }
}

const out = fs.openSync(log, "a");
const child = spawn(process.execPath, [watchdog], {
  detached: true,
  stdio: ["ignore", out, out],
  cwd: path.join(__dirname, ".."),
  env: process.env,
});

child.unref();
fs.writeFileSync(watchPidFile, String(child.pid));
console.log(`Tunnel watchdog started (pid ${child.pid}).`);
console.log(`Log: ${log}`);
console.log(`URL file: /tmp/ngrok-public-url.txt`);
