import { existsSync } from "fs";
import {
  closeGmbBrowser,
  gmbProfileDir,
  GMB_SESSION_HINT,
  openGmbBrowser,
  resolveChromeExecutable,
  type GbpBrowserSession,
} from "./gbp-chrome-session";
import {
  extractGoogleSearchProductsFromPage,
  isQualityProductImport,
  isGoogleBlockedPage,
  isGoogleLoginPage,
} from "./gbp-product-search-dom";
import { enrichProductsWithEditorDetails } from "./gbp-product-detail-fetch";
import type { GbpCatalogProduct } from "./gbp-product-utils";

export function extractGoogleLocationNumericId(googleLocationId: string): string | null {
  const m = googleLocationId.match(/locations\/(\d+)/);
  return m?.[1] ?? null;
}

/**
 * Import GMB products via logged-in Chrome on Google Search knowledge panel.
 * business.google.com redirects here — product cards use .Gik6Zd / .uTQZDe.
 */
export async function importProductsViaBusinessProfile(
  googleLocationId: string,
  locationName: string,
): Promise<{ products: GbpCatalogProduct[]; errors: string[]; needsLogin?: boolean }> {
  const errors: string[] = [];
  const numericId = extractGoogleLocationNumericId(googleLocationId);
  if (!numericId) {
    errors.push("Invalid Google location id");
    return { products: [], errors };
  }

  if (!resolveChromeExecutable()) {
    errors.push("Chrome not found (set CHROME_PATH in .env)");
    return { products: [], errors };
  }

  let puppeteer: typeof import("puppeteer-core");
  try {
    puppeteer = await import("puppeteer-core");
  } catch {
    errors.push("puppeteer-core not installed");
    return { products: [], errors };
  }

  let session: GbpBrowserSession | null = null;
  let page: Awaited<ReturnType<GbpBrowserSession["browser"]["newPage"]>> | null = null;

  try {
    session = await openGmbBrowser(puppeteer, { preferHeadless: true });
    page = await session.browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    let products = await extractGoogleSearchProductsFromPage(page, {
      locationName,
      googleLocationNumericId: numericId,
    });

    // List page already has name, image, googleEditId — skip slow per-product edit pages.
    const enrichDetails = process.env.GMB_PRODUCT_ENRICH_DETAILS === "true";
    if (enrichDetails && products.length > 0) {
      products = await enrichProductsWithEditorDetails(page, products, {
        locationName,
        googleLocationNumericId: numericId,
      });
    }

    const finalUrl = page.url();
    if (isGoogleLoginPage(finalUrl)) {
      errors.push(`GMB sign-in required. ${GMB_SESSION_HINT}`);
      return { products: [], errors, needsLogin: true };
    }
    if (isGoogleBlockedPage(finalUrl)) {
      errors.push(`Google blocked product sync (CAPTCHA). ${GMB_SESSION_HINT}`);
      return { products: [], errors, needsLogin: true };
    }

    if (!isQualityProductImport(products)) {
      if (products.length === 0) {
        errors.push(
          "No products found in GMB Product Editor for this listing. Add products on Google Business Profile first, or use Import CSV.",
        );
      } else {
        errors.push(
          `Incomplete product catalog (${products.length} found). ${GMB_SESSION_HINT}`,
        );
      }
      return { products: [], errors };
    }

    return { products, errors };
  } catch (e: unknown) {
    errors.push(e instanceof Error ? e.message : String(e));
    return { products: [], errors };
  } finally {
    if (page) await page.close().catch(() => undefined);
    if (session) await closeGmbBrowser(session);
  }
}

export function isBusinessImportConfigured(): boolean {
  return existsSync(gmbProfileDir());
}

