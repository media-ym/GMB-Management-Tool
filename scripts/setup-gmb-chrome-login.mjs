/**
 * One-time setup: open real Chrome (not Puppeteer) with GMB profile for Google sign-in.
 * Google blocks automated browsers with "This browser or app may not be secure".
 *
 * Run: npm run gmb:chrome-login
 */
import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import readline from "readline";

const chrome =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profileDir = process.env.GMB_CHROME_PROFILE_DIR || join(process.cwd(), ".gmb-chrome-profile");
const debugPort = process.env.GMB_CHROME_DEBUG_PORT || "9222";
const loginUrl = "https://business.google.com/";

if (!existsSync(chrome)) {
  console.error("Chrome not found at", chrome);
  process.exit(1);
}
if (!existsSync(profileDir)) mkdirSync(profileDir, { recursive: true });

function isProfileRunning() {
  try {
    const out = execSync(`pgrep -f "${profileDir}" 2>/dev/null || true`, { encoding: "utf8" });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

function openGmbChrome() {
  const args = [
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${debugPort}`,
    "--lang=en-IN",
    loginUrl,
  ];

  if (process.platform === "darwin") {
    execSync(
      `open -na "Google Chrome" --args ${args.map((a) => JSON.stringify(a)).join(" ")}`,
      { stdio: "ignore" },
    );
    return;
  }

  const child = spawn(chrome, args, { detached: true, stdio: "ignore" });
  child.unref();
}

console.log("Opening real Chrome for GMB login (not automated — Google allows this)...");
console.log("Profile:", profileDir);
console.log("Debug port:", debugPort);
console.log("");

if (isProfileRunning()) {
  console.log("GMB Chrome is already running — opening products page in a new tab via debug port...");
  try {
    const res = execSync(
      `curl -s "http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(loginUrl)}"`,
      { encoding: "utf8" },
    );
    console.log("Opened:", JSON.parse(res).url || loginUrl);
  } catch {
    console.log("Could not open new tab automatically. Use the existing GMB Chrome window.");
  }
} else {
  openGmbChrome();
}

console.log("");
console.log("1. Sign in with the Google account that manages your GMB listings");
console.log("2. Open any Business Profile → Products to confirm access");
console.log("3. You can keep this Chrome open — Import from Google will reuse this session");
console.log("4. Press Enter here when login is done (Chrome can stay open)");

await new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question("\nPress Enter after you signed in... ", () => {
    rl.close();
    resolve();
  });
});

console.log("Login saved. Use Import from Google in MyFNG (keep this Chrome open or close it first).");
