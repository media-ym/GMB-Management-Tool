/**
 * Import GMB Product Editor catalog from the public Google Maps / Search profile.
 * Google does not expose this via the official Business Profile API — same approach
 * used by GMB management platforms: fetch public profile HTML and parse embedded data.
 */

import { db } from "./db";
import {
  type GbpCatalogProduct,
  catalogItemId,
  isBusinessCatalogProduct,
  isCategoryLabel,
  isImageUrl,
  isProductName,
  isValidCatalogProduct,
} from "./gbp-product-utils";
import { isQualityProductImport, parseGoogleSearchProductsFromHtml } from "./gbp-product-search-dom";

export type { GbpCatalogProduct } from "./gbp-product-utils";
export { isProductName } from "./gbp-product-utils";

/** Build a fetch URL from stored map link, place id, or business name. */
export function resolvePublicProfileFetchUrl(opts: {
  mapUrl?: string | null;
  locationName: string;
  placeId?: string | null;
}): string {
  const mapUrl = opts.mapUrl?.trim();
  if (mapUrl) {
    if (mapUrl.includes("cid=")) return mapUrl.includes("http") ? mapUrl : `https://maps.google.com/maps?${mapUrl.split("?")[1] || mapUrl}`;
    if (mapUrl.includes("place_id:")) return mapUrl;
    if (mapUrl.startsWith("http")) return mapUrl;
  }
  const placeId = opts.placeId?.trim();
  if (placeId) {
    return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}&hl=en`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(opts.locationName)}&hl=en`;
}

function extractBalancedJsonArray(html: string, startIdx: number): string | null {
  if (html[startIdx] !== "[") return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startIdx; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return html.slice(startIdx, i + 1);
    }
  }
  return null;
}

function tryParseAppInitState(html: string): unknown | null {
  const marker = "APP_INITIALIZATION_STATE=";
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const start = idx + marker.length;
  const jsonStr = extractBalancedJsonArray(html, start);
  if (!jsonStr) return null;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function collectStrings(node: unknown, out: string[], depth = 0): void {
  if (depth > 40) return;
  if (typeof node === "string") {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectStrings(item, out, depth + 1);
    return;
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) {
      collectStrings(v, out, depth + 1);
    }
  }
}

function walkForProductTuples(
  node: unknown,
  acc: GbpCatalogProduct[],
  seen: Set<string>,
  depth = 0,
): void {
  if (depth > 45) return;

  if (Array.isArray(node)) {
    const strings = node.flatMap((item) => flattenStrings(item));
    const images = strings.filter(isImageUrl);
    const names = strings.filter(isProductName);
    const categories = strings.filter(isCategoryLabel);

    if (names.length > 0 && images.length > 0) {
      const name = names[0];
      const category = categories.find((c) => c !== name);
      const imageUrl = images[0];
      const candidate = { name, category, imageUrl, googleItemId: catalogItemId(name, category) };
      if (isValidCatalogProduct(candidate) && !seen.has(candidate.googleItemId)) {
        seen.add(candidate.googleItemId);
        acc.push(candidate);
      }
    }

    for (const child of node) walkForProductTuples(child, acc, seen, depth + 1);
    return;
  }

  if (node && typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) {
      walkForProductTuples(v, acc, seen, depth + 1);
    }
  }
}

function flattenStrings(node: unknown, depth = 0): string[] {
  if (depth > 8) return [];
  if (typeof node === "string") return [node];
  if (!Array.isArray(node)) return [];
  const out: string[] = [];
  for (const item of node) {
    if (typeof item === "string") out.push(item);
    else if (Array.isArray(item)) out.push(...flattenStrings(item, depth + 1));
  }
  return out;
}

/** Regex fallback — product titles near Google CDN image URLs in raw HTML. */
function parseProductsRegexFallback(html: string): GbpCatalogProduct[] {
  const acc: GbpCatalogProduct[] = [];
  const seen = new Set<string>();

  const blockRe =
    /\[\[\["([^"]{3,80})"(?:,\s*"([^"]{0,80})")?(?:,\s*"([^"]{0,80})")?[^\]]{0,400}?(https:\/\/lh\d\.googleusercontent\.com[^"\\]+)/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null) {
    const name = m[1]?.trim();
    if (!name || !isProductName(name)) continue;
    const maybeCat = [m[2], m[3]].find((s) => s && isCategoryLabel(s));
    const imageUrl = m[4]?.replace(/\\u003d/g, "=").replace(/\\/g, "");
    const id = catalogItemId(name, maybeCat);
    if (seen.has(id)) continue;
    seen.add(id);
    acc.push({ name, category: maybeCat, imageUrl, googleItemId: id });
  }

  return acc.filter(isValidCatalogProduct);
}

export function parseProductsFromPublicProfileHtml(html: string): GbpCatalogProduct[] {
  const seen = new Set<string>();
  const acc: GbpCatalogProduct[] = [];

  const add = (p: GbpCatalogProduct) => {
    if (!isValidCatalogProduct(p)) return;
    if (!seen.has(p.googleItemId)) {
      seen.add(p.googleItemId);
      acc.push(p);
    }
  };

  const appState = tryParseAppInitState(html);
  if (appState) walkForProductTuples(appState, acc, seen);

  for (const p of parseProductsRegexFallback(html)) add(p);
  for (const p of parseGoogleSearchProductsFromHtml(html)) add(p);

  return acc.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchPublicProfileHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Public profile fetch failed (${res.status})`);
  return res.text();
}

/** Import product catalog for one location into MyFNG DB (RightChoice-style). */
export async function importGbpProductCatalogForLocation(locationId: string): Promise<{
  imported: number;
  products: GbpCatalogProduct[];
  errors: string[];
}> {
  const errors: string[] = [];

  const location = await db.location.findUnique({
    where: { id: locationId },
    select: {
      id: true,
      name: true,
      googleProfiles: { select: { mapUrl: true, googleLocationId: true } },
    },
  });

  if (!location) return { imported: 0, products: [], errors: ["Location not found"] };

  const gbp = location.googleProfiles[0];
  if (!gbp) return { imported: 0, products: [], errors: ["No Google profile linked"] };

  const fetchUrl = resolvePublicProfileFetchUrl({
    mapUrl: gbp.mapUrl,
    locationName: location.name,
  });

  let parsed: GbpCatalogProduct[] = [];
  const useBrowser = process.env.GMB_USE_BROWSER_IMPORT === "true";

  // 1. Public Maps/Search scrape — no Chrome login required
  try {
    const html = await fetchPublicProfileHtml(fetchUrl);
    parsed = parseProductsFromPublicProfileHtml(html);
  } catch (e: unknown) {
    errors.push(`Public profile: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (parsed.length < 2 && !fetchUrl.includes("google.com/search")) {
    try {
      const searchUrl = resolvePublicProfileFetchUrl({ locationName: location.name });
      const searchHtml = await fetchPublicProfileHtml(searchUrl);
      const fromSearch = parseProductsFromPublicProfileHtml(searchHtml);
      const seen = new Set(parsed.map((p) => p.googleItemId));
      for (const p of fromSearch) {
        if (!seen.has(p.googleItemId)) {
          seen.add(p.googleItemId);
          parsed.push(p);
        }
      }
    } catch (e: unknown) {
      errors.push(`Search fallback: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 2. Optional Chrome import (off by default — set GMB_USE_BROWSER_IMPORT=true to enable)
  if (!isQualityProductImport(parsed) && useBrowser && gbp.googleLocationId) {
    try {
      const { importProductsViaBusinessProfile } = await import("./gbp-product-business-import");
      const businessResult = await importProductsViaBusinessProfile(gbp.googleLocationId, location.name);
      if (isQualityProductImport(businessResult.products)) {
        parsed = businessResult.products;
      }
      errors.push(...businessResult.errors.filter((e) => !/sign-in|login required/i.test(e)));
    } catch (e: unknown) {
      errors.push(`Business import: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!isQualityProductImport(parsed) && useBrowser) {
    try {
      const { importProductsViaBrowser } = await import("./gbp-product-browser-import");
      const browserResult = await importProductsViaBrowser(fetchUrl, location.name);
      if (isQualityProductImport(browserResult.products)) {
        parsed = browserResult.products;
      }
      errors.push(...browserResult.errors.filter((e) => !e.includes("Chrome not found")));
    } catch (e: unknown) {
      errors.push(`Browser import: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  parsed = parsed.filter((p) => isValidCatalogProduct(p) || isBusinessCatalogProduct(p));

  if (!isQualityProductImport(parsed)) {
    if (parsed.length === 0) {
      errors.push(
        "Could not fetch products from public Google profile. Use Import CSV, or products already in MyFNG will stay as-is.",
      );
    } else {
      errors.push(
        `Only ${parsed.length} product(s) found on public Google profile. Use Import CSV for a full catalog.`,
      );
    }
    return { imported: 0, products: [], errors: [...new Set(errors)] };
  }

  let imported = 0;
  for (const p of parsed) {
    const existing = await db.product.findFirst({
      where: { locationId, googleItemId: p.googleItemId, source: "gmb_catalog" },
    });

    if (existing) {
      await db.product.update({
        where: { id: existing.id },
        data: {
          name: p.name,
          category: p.category || existing.category,
          description: p.description || existing.description,
          price: p.price ?? existing.price,
          imageUrl: p.imageUrl || existing.imageUrl,
          landingUrl: p.landingUrl || existing.landingUrl,
          googleEditId: p.googleEditId || existing.googleEditId,
        },
      });
    } else {
      await db.product.create({
        data: {
          locationId,
          name: p.name,
          description: p.description || null,
          category: p.category || null,
          price: p.price ?? null,
          imageUrl: p.imageUrl || null,
          landingUrl: p.landingUrl || null,
          googleItemId: p.googleItemId,
          googleEditId: p.googleEditId || null,
          source: "gmb_catalog",
        },
      });
    }
    imported++;
  }

  // Remove stale gmb_catalog rows not in latest import
  const keepIds = new Set(parsed.map((p) => p.googleItemId));
  await db.product.deleteMany({
    where: {
      locationId,
      source: "gmb_catalog",
      googleItemId: { notIn: [...keepIds] },
    },
  });

  return { imported, products: parsed, errors };
}
