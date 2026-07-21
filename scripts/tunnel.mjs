import ngrok from "@ngrok/ngrok";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");

function loadEnvToken() {
  if (process.env.NGROK_AUTHTOKEN) return process.env.NGROK_AUTHTOKEN;
  if (!fs.existsSync(envPath)) return null;
  const line = fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .find((l) => l.startsWith("NGROK_AUTHTOKEN="));
  return line ? line.slice("NGROK_AUTHTOKEN=".length).trim() : null;
}

const token = loadEnvToken();
if (!token) {
  console.error("NGROK_AUTHTOKEN missing in .env");
  process.exit(1);
}

async function main() {
  // Prevent exit when stdin closes (detached / no TTY)
  try {
    process.stdin.unref?.();
  } catch {
    // ignore
  }

  const listener = await ngrok.forward({
    addr: 3000,
    authtoken: token,
    // keep session from idle-closing as aggressively
  });
  const url = listener.url();
  fs.writeFileSync("/tmp/ngrok-public-url.txt", url);
  fs.writeFileSync("/tmp/ngrok-myfng.pid", String(process.pid));
  console.log(`Public URL: ${url}`);
  console.log("Tunnel running — watchdog will restart if this exits.");

  // Keep event loop alive
  setInterval(() => {
    try {
      fs.writeFileSync("/tmp/ngrok-public-url.txt", listener.url() || url);
    } catch {
      // ignore
    }
  }, 60_000);

  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
