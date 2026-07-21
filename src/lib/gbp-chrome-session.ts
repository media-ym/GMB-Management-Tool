import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync, statSync } from "fs";
import { join } from "path";

export const GMB_CHROME_DEBUG_PORT = process.env.GMB_CHROME_DEBUG_PORT || "9222";

export const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean) as string[];

export function resolveChromeExecutable(): string | null {
  for (const p of CHROME_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function gmbProfileDir(): string {
  const dir = process.env.GMB_CHROME_PROFILE_DIR || join(process.cwd(), ".gmb-chrome-profile");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function isGmbProfileRunning(): boolean {
  const profileDir = gmbProfileDir();
  try {
    const out = execSync(`pgrep -f "${profileDir.replace(/"/g, '\\"')}" 2>/dev/null || true`, {
      encoding: "utf8",
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

export function hasGmbProfileData(): boolean {
  const cookiesPath = join(gmbProfileDir(), "Default", "Cookies");
  try {
    return existsSync(cookiesPath) && statSync(cookiesPath).size > 1024;
  } catch {
    return false;
  }
}

export function gmbChromeLaunchArgs(profileDir = gmbProfileDir()): string[] {
  return [
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${GMB_CHROME_DEBUG_PORT}`,
    "--lang=en-IN",
  ];
}

export type GbpBrowserSession = {
  browser: Awaited<ReturnType<typeof import("puppeteer-core").launch>>;
  mode: "headless" | "connected";
};

export const GMB_SESSION_HINT =
  "Go to More → Google → Connect. If Chrome opens, sign in with your GMB account, close Chrome, then retry.";

/** After OAuth connect — silently open Chrome once if no saved GMB browser session. */
export function bootstrapGmbSessionAfterOAuth(): { launched: boolean; alreadyReady: boolean } {
  if (hasGmbProfileData()) {
    return { launched: false, alreadyReady: true };
  }
  const result = launchGmbLoginBrowser();
  return { launched: result.ok, alreadyReady: false };
}

/** Ensure a GMB browser session exists; auto-open Chrome for sign-in when missing. */
export function ensureGmbBrowserSession(opts?: { autoLaunch?: boolean }): {
  ready: boolean;
  launchedLogin: boolean;
  error?: string;
} {
  if (hasGmbProfileData()) {
    return { ready: true, launchedLogin: false };
  }
  if (opts?.autoLaunch === false) {
    return { ready: false, launchedLogin: false, error: GMB_SESSION_HINT };
  }
  const result = launchGmbLoginBrowser();
  if (!result.ok) {
    return { ready: false, launchedLogin: false, error: result.error || GMB_SESSION_HINT };
  }
  return {
    ready: false,
    launchedLogin: true,
    error: "Chrome opened — sign in with your GMB Google account, close Chrome completely, then retry.",
  };
}

/** Open real Chrome for one-time GMB Product Editor login (hidden from Products UI). */
export function launchGmbLoginBrowser(): { ok: boolean; error?: string } {
  const chromePath = resolveChromeExecutable();
  if (!chromePath) return { ok: false, error: "Chrome not found (set CHROME_PATH in .env)" };

  const profileDir = gmbProfileDir();
  const loginUrl = "https://business.google.com/";
  const args = [...gmbChromeLaunchArgs(profileDir), loginUrl];

  try {
    if (process.platform === "darwin") {
      execSync(
        `open -na "Google Chrome" --args ${args.map((a) => JSON.stringify(a)).join(" ")}`,
        { stdio: "ignore" },
      );
    } else {
      const child = spawn(chromePath, args, { detached: true, stdio: "ignore" });
      child.unref();
    }
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Open browser for GMB Product Editor import.
 * Sync/import always uses headless — never attaches to a visible Chrome window.
 */
export async function openGmbBrowser(
  puppeteer: typeof import("puppeteer-core"),
  opts?: { preferHeadless?: boolean },
): Promise<GbpBrowserSession> {
  const chromePath = resolveChromeExecutable();
  if (!chromePath) {
    throw new Error("Chrome not found (set CHROME_PATH in .env)");
  }

  const headlessOnly = opts?.preferHeadless !== false;

  if (!headlessOnly && isGmbProfileRunning()) {
    try {
      const browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${GMB_CHROME_DEBUG_PORT}`,
        defaultViewport: null,
      });
      return { browser, mode: "connected" };
    } catch {
      throw new Error(
        "GMB Chrome is open but not reachable. Close all Chrome windows, then go to More → Google → Connect again.",
      );
    }
  }

  const profileDir = gmbProfileDir();
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    userDataDir: profileDir,
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      ...gmbChromeLaunchArgs(profileDir),
      "--headless=new",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1400,900",
    ],
  });

  return { browser, mode: "headless" };
}

export async function closeGmbBrowser(session: GbpBrowserSession): Promise<void> {
  if (session.mode === "connected") {
    await session.browser.disconnect().catch(() => undefined);
    return;
  }
  await session.browser.close().catch(() => undefined);
}
