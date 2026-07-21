import { existsSync } from "fs";
import type { GbpCatalogProduct } from "./gbp-product-utils";
import {
  extractGoogleSearchProductsFromPage,
  isQualityProductImport,
  parseGoogleSearchProductsFromHtml,
} from "./gbp-product-search-dom";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean) as string[];

function resolveChromeExecutable(): string | null {
  for (const p of CHROME_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** Render Google Search in Chrome and extract product cards from knowledge panel. */
export async function importProductsViaBrowser(
  fetchUrl: string,
  locationName: string,
): Promise<{ products: GbpCatalogProduct[]; errors: string[] }> {
  const errors: string[] = [];
  const chromePath = resolveChromeExecutable();
  if (!chromePath) {
    errors.push("Chrome not found for product import (set CHROME_PATH in .env)");
    return { products: [], errors };
  }

  let puppeteer: typeof import("puppeteer-core");
  try {
    puppeteer = await import("puppeteer-core");
  } catch {
    errors.push("puppeteer-core not installed");
    return { products: [], errors };
  }

  const captured: string[] = [];
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--lang=en-IN"],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    await page.setViewport({ width: 1400, height: 900 });

    page.on("response", async (response) => {
      try {
        const url = response.url();
        if (!/google\.(com|apis)|googleusercontent|gstatic/.test(url)) return;
        const ct = response.headers()["content-type"] || "";
        if (!/json|javascript|text|html/i.test(ct)) return;
        const body = await response.text();
        if (body.includes("Gik6Zd")) captured.push(body);
      } catch {
        // ignore aborted responses
      }
    });

    let products = await extractGoogleSearchProductsFromPage(page, { locationName });

    if (!isQualityProductImport(products) && fetchUrl) {
      await page.goto(fetchUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await new Promise((r) => setTimeout(r, 4000));
      products = await extractGoogleSearchProductsFromPage(page, { locationName });
    }

    const seen = new Set(products.map((p) => p.googleItemId));
    for (const chunk of captured) {
      for (const p of parseGoogleSearchProductsFromHtml(chunk)) {
        if (!seen.has(p.googleItemId)) {
          seen.add(p.googleItemId);
          products.push(p);
        }
      }
    }

    products = products.sort((a, b) => a.name.localeCompare(b.name));
    if (!isQualityProductImport(products)) products = [];

    return { products, errors };
  } catch (e: unknown) {
    errors.push(e instanceof Error ? e.message : String(e));
    return { products: [], errors };
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}
