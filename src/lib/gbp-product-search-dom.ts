import type { GbpCatalogProduct } from "./gbp-product-utils";
import { catalogItemId, isImageUrl, isProductName } from "./gbp-product-utils";

const PRODUCT_KEYWORD =
  /paint|tow|wax|fender|bumper|door|roof|ceramic|battery|brake|coating|polish|detailing|jumpstart|towing|filter|clutch|suspension|package|replacement|charging|silencer|rust|unlock|mechanical|assistance|denting|bonnet|tyre|tire|coolant|radiator|engine|periodic|\bac\b|gas|fuel|flat|exterior|cleaning|underbody|quarter|panel|full body|performance|maintenance|booster|cylinder|jumpstart|delivery/i;

const CATEGORY_HEADERS = new Set([
  "car ac service",
  "car brake service",
  "car battery service",
  "car clutch repair & service",
  "car engine repair & service",
  "car detailing service",
  "periodic service",
  "denting & painting service",
  "roadside assitance services",
  "roadside assistance services",
]);

const DASHBOARD_JUNK =
  /^(add |get |create |turn |report |view your|share your|claim |showcase |help customers|reach more|copy link|general feedback|edit profile|read reviews|bookings|profiles|performance|photos|posts)/i;

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

function normalizeHtml(html: string): string {
  return html
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\"/g, '"');
}

function inferCategory(name: string): string | undefined {
  if (/paint|fender|bumper|door|roof|quarter|panel|full body|denting/i.test(name)) {
    return "Denting & Painting Service";
  }
  if (/wax|polish|coating|ceramic|detailing|cleaning|silencer|rust|underbody|exterior/i.test(name)) {
    return "Car Detailing Service";
  }
  if (/tow|jumpstart|battery|unlock|mechanical|assistance|flat|tyre|tire|fuel|cooling|overheating|delivery/i.test(name)) {
    return "Roadside Assitance Services";
  }
  if (/\bac\b|gas charging|ac service/i.test(name)) return "Car Ac Service";
  if (/brake|cylinder|booster/i.test(name)) return "Car Brake Service";
  if (/clutch/i.test(name)) return "Car Clutch Repair & Service";
  if (/engine/i.test(name)) return "Car Engine Repair & Service";
  if (/service package|periodic|maintenance package/i.test(name)) return "Periodic Service";
  return undefined;
}

function isLikelyCatalogProduct(name: string, category?: string): boolean {
  if (!isProductName(name)) return false;
  if (DASHBOARD_JUNK.test(name)) return false;
  if (category && CATEGORY_HEADERS.has(category.toLowerCase())) return false;
  if (category && !isProductCategoryLabel(category)) return false;
  if (category) return true;
  return PRODUCT_KEYWORD.test(name);
}

function pushProduct(
  acc: Map<string, GbpCatalogProduct>,
  p: { name: string; category?: string; imageUrl?: string; googleEditId?: string },
): void {
  const name = decodeHtml(p.name);
  let category = p.category ? decodeHtml(p.category) : undefined;
  if (category && CATEGORY_HEADERS.has(category.toLowerCase())) category = undefined;
  if (!isLikelyCatalogProduct(name, category)) return;
  if (!category) category = inferCategory(name);

  const item: GbpCatalogProduct = {
    name,
    category,
    imageUrl: p.imageUrl && isImageUrl(p.imageUrl) ? p.imageUrl : undefined,
    googleEditId: p.googleEditId,
    googleItemId: catalogItemId(name, category),
  };
  const nameKey = name.toLowerCase();
  const existing = acc.get(nameKey);
  if (!existing) {
    acc.set(nameKey, item);
    return;
  }
  const merged: GbpCatalogProduct = { ...existing };
  if (item.category && (!merged.category || merged.category === inferCategory(name))) merged.category = item.category;
  if (item.imageUrl) merged.imageUrl = item.imageUrl;
  if (item.googleEditId) merged.googleEditId = item.googleEditId;
  acc.set(nameKey, merged);
}

/** Parse Business Profile Product Editor iframe (jsname=LIZVtc cards). */
function parseBusinessEditorProductsFromHtml(html: string): GbpCatalogProduct[] {
  const acc = new Map<string, GbpCatalogProduct>();
  const decoded = normalizeHtml(html);
  let m: RegExpExecArray | null;

  const cardRe =
    /data-product-name="accounts[^"]+\/products\/([0-9a-f-]{36})"[\s\S]{0,2500}?background-image:\s*url\(['"]?(https:\/\/lh\d+\.googleusercontent\.com[^'")\s]+)['"]?\)[\s\S]{0,1200}?jsname="LIZVtc">([^<]{3,120})<\/div>/gi;
  while ((m = cardRe.exec(decoded)) !== null) {
    pushProduct(acc, { name: m[3], imageUrl: m[2], googleEditId: m[1] });
  }

  const bgBeforeName =
    /background-image:\s*url\(['"]?(https:\/\/lh\d+\.googleusercontent\.com[^'")\s]+)['"]?\)[\s\S]{0,800}?jsname="LIZVtc">([^<]{3,120})<\/div>/gi;
  while ((m = bgBeforeName.exec(decoded)) !== null) {
    pushProduct(acc, { name: m[2], imageUrl: m[1] });
  }

  const nameWithId =
    /data-product-name="accounts[^"]+\/products\/([0-9a-f-]{36})"[\s\S]{0,2500}?jsname="LIZVtc">([^<]{3,120})<\/div>/gi;
  while ((m = nameWithId.exec(decoded)) !== null) {
    pushProduct(acc, { name: m[2], googleEditId: m[1] });
  }

  const lizOnly = /jsname="LIZVtc">([^<]{4,120})<\/div>/gi;
  while ((m = lizOnly.exec(decoded)) !== null) {
    pushProduct(acc, { name: m[1] });
  }

  return [...acc.values()];
}

/** Parse Google Search / Maps / Business Editor product cards from HTML. */
export function parseGoogleSearchProductsFromHtml(html: string): GbpCatalogProduct[] {
  const acc = new Map<string, GbpCatalogProduct>();
  const decoded = normalizeHtml(html);

  mergeProducts(acc, parseBusinessEditorProductsFromHtml(html));

  let m: RegExpExecArray | null;

  const pairRes = [
    /Gik6Zd">([^<]{3,120})<\/div>\s*<div class="uTQZDe">([^<]{0,120})<\/div>/gi,
    />([^<]{4,120})<\/div>\s*<div class="uTQZDe">([^<]{0,120})<\/div>/gi,
  ];
  for (const re of pairRes) {
    while ((m = re.exec(decoded)) !== null) {
      pushProduct(acc, { name: m[1], category: m[2] || undefined });
    }
  }

  const imgBeforeName = /src="(https:\/\/lh\d+\.googleusercontent\.com[^"]+)"[\s\S]{0,2500}?Gik6Zd">([^<]{3,120})<\/div>(?:\s*<div class="uTQZDe">([^<]{0,120})<\/div>)?/gi;
  while ((m = imgBeforeName.exec(decoded)) !== null) {
    pushProduct(acc, { name: m[2], category: m[3] || undefined, imageUrl: m[1] });
  }

  const imgAfterName = /Gik6Zd">([^<]{3,120})<\/div>(?:\s*<div class="uTQZDe">([^<]{0,120})<\/div>)?[\s\S]{0,2500}?src="(https:\/\/lh\d+\.googleusercontent\.com[^"]+)"/gi;
  while ((m = imgAfterName.exec(decoded)) !== null) {
    pushProduct(acc, { name: m[1], category: m[2] || undefined, imageUrl: m[3] });
  }

  const editIdRe = /editprofile\/products\/([0-9a-f-]{36})/gi;
  const editIds = [...decoded.matchAll(editIdRe)].map((x) => x[1]);
  if (editIds.length === 1) {
    for (const p of acc.values()) p.googleEditId = editIds[0];
  }

  const nameOnlyRes = [
    /Gik6Zd">([^<]{4,120})<\/div><\/div><\/div>/gi,
    />([^<]{4,120})<\/div><\/div><\/div><div class=/g,
  ];
  for (const re of nameOnlyRes) {
    while ((m = re.exec(decoded)) !== null) {
      pushProduct(acc, { name: m[1] });
    }
  }

  return [...acc.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function isProductCategoryLabel(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 100) return false;
  const lower = t.toLowerCase();
  if (lower === "category" || lower === "address" || lower === "products") return false;
  if (/^press \//i.test(t)) return false;
  if (CATEGORY_HEADERS.has(lower)) return false;
  return /[a-zA-Z]/.test(t);
}

async function readBusinessEditorProductsFromFrame(frame: {
  evaluate: (fn: () => unknown) => Promise<unknown>;
}): Promise<GbpCatalogProduct[]> {
  const raw = (await frame.evaluate(() => {
    const out: { name: string; imageUrl?: string; googleEditId?: string }[] = [];
    const seen = new Set<string>();
    for (const card of document.querySelectorAll("[data-product-name]")) {
      const name = card.querySelector('[jsname="LIZVtc"]')?.textContent?.trim() || "";
      if (!name || name.length < 3) continue;
      const bg = card.querySelector<HTMLElement>(".NdJE1")?.style.backgroundImage || "";
      const imageUrl = bg.match(/url\(['"]?(https:\/\/lh\d+\.googleusercontent\.com[^'")\s]+)/)?.[1];
      const googleEditId =
        card.getAttribute("data-product-name")?.match(/products\/([0-9a-f-]{36})/)?.[1] || undefined;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, imageUrl, googleEditId });
    }
    return out;
  })) as { name: string; imageUrl?: string; googleEditId?: string }[];

  const acc = new Map<string, GbpCatalogProduct>();
  for (const p of raw) pushProduct(acc, p);
  return [...acc.values()];
}

async function readProductsFromDom(page: {
  evaluate: (fn: () => unknown) => Promise<unknown>;
}): Promise<GbpCatalogProduct[]> {
  const raw = (await page.evaluate(() => {
    const out: { name: string; category?: string; imageUrl?: string }[] = [];
    const seen = new Set<string>();

    for (const card of document.querySelectorAll(".ApHyTb, .Cekgzc, [role='listitem']")) {
      const name = card.querySelector(".Gik6Zd")?.textContent?.trim() || "";
      const category = card.querySelector(".uTQZDe")?.textContent?.trim() || undefined;
      const imageUrl =
        card.querySelector("img[src*='googleusercontent'], img[src*='ggpht']")?.getAttribute("src") ||
        undefined;
      if (!name || name.length < 3) continue;
      const key = `${name}|${category || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, category, imageUrl });
    }
    return out;
  })) as { name: string; category?: string; imageUrl?: string }[];

  const acc = new Map<string, GbpCatalogProduct>();
  for (const p of raw) pushProduct(acc, p);
  return [...acc.values()];
}

function mergeProducts(into: Map<string, GbpCatalogProduct>, items: GbpCatalogProduct[]): void {
  for (const p of items) pushProduct(into, p);
}

function mergeFromHtml(into: Map<string, GbpCatalogProduct>, html: string): void {
  mergeProducts(into, parseGoogleSearchProductsFromHtml(html));
}

function isGoogleBlockedPage(url: string): boolean {
  return /google\.com\/sorry|recaptcha|unusual traffic/i.test(url);
}

function isGoogleLoginPage(url: string): boolean {
  return /accounts\.google\.com|ServiceLogin|signin/i.test(url);
}

export { isGoogleBlockedPage, isGoogleLoginPage };

type PageWithFrames = {
  evaluate: (fn: () => unknown) => Promise<unknown>;
  goto: (url: string, opts?: object) => Promise<unknown>;
  content?: () => Promise<string>;
  url: () => string;
  frames?: () => {
    url: () => string;
    content: () => Promise<string>;
    evaluate: (fn: () => unknown) => Promise<unknown>;
  }[];
};

async function extractFromBusinessEditorFrame(
  page: PageWithFrames,
  all: Map<string, GbpCatalogProduct>,
): Promise<void> {
  if (!page.frames) return;

  const frames = page.frames();
  let bizFrame = frames.find((f) =>
    /local\/business\/\d+\/editprofile\/products(?:\?|$)/.test(f.url()),
  );

  // Direct navigation — editor may be the main frame
  if (!bizFrame && /local\/business\/\d+\/editprofile\/products/.test(page.url())) {
    bizFrame = frames[0];
  }

  if (!bizFrame) return;

  try {
    let prevSize = all.size;
    let stale = 0;
    for (let i = 0; i < 16; i++) {
      await bizFrame.evaluate(() => window.scrollBy(0, 600));
      await sleep(350);
      mergeProducts(all, await readBusinessEditorProductsFromFrame(bizFrame));
      mergeFromHtml(all, await bizFrame.content());
      if (all.size === prevSize) stale++;
      else stale = 0;
      prevSize = all.size;
      if (all.size >= 25 && stale >= 2) break;
      if (stale >= 4) break;
    }
  } catch {
    // ignore
  }
}

/** Extract all catalog products by scrolling editor + parsing network HTML. */
export async function extractGoogleSearchProductsFromPage(
  page: PageWithFrames,
  opts: { locationName: string; googleLocationNumericId?: string | null },
): Promise<GbpCatalogProduct[]> {
  const all = new Map<string, GbpCatalogProduct>();

  // Prefer direct Product Editor URL (avoids Google Search CAPTCHA)
  if (opts.googleLocationNumericId) {
    const directUrl = buildDirectBusinessProductsUrl(opts.googleLocationNumericId);
    await page.goto(directUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(3500);

    const directUrlStr = page.url();
    if (isGoogleLoginPage(directUrlStr) || isGoogleBlockedPage(directUrlStr)) {
      return [];
    }
    await extractFromBusinessEditorFrame(page, all);
    if (all.size >= 2) {
      return [...all.values()].sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  const searchUrl = buildGoogleSearchProductsUrl(opts.locationName, opts.googleLocationNumericId);
  const htmlChunks: string[] = [];

  const onResponse = async (response: { url: () => string; text: () => Promise<string> }) => {
    try {
      const url = response.url();
      if (!/google\.com|googleusercontent|gstatic/.test(url)) return;
      const body = await response.text();
      if (body.length > 400) htmlChunks.push(body);
    } catch {
      // ignore
    }
  };

  if ("on" in page && typeof (page as { on?: unknown }).on === "function") {
    (page as { on: (event: string, handler: typeof onResponse) => void }).on("response", onResponse);
  }

  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(3000);

  await page.evaluate(() => {
    for (const el of document.querySelectorAll("button, a, span, div")) {
      const t = el.textContent?.trim();
      if (t === "Products" && el.children.length <= 2) {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return;
      }
    }
  });
  await sleep(4000);

  mergeProducts(all, await readProductsFromDom(page));
  if (page.content) mergeFromHtml(all, await page.content());

  // Scroll to load full Product Editor catalog — stop early once stable
  let staleRounds = 0;
  for (let i = 0; i < 18; i++) {
    const before = all.size;
    await page.evaluate(() => {
      window.scrollBy(0, 800);
      const dlg = document.querySelector('[role="dialog"], .m6QErb, .XRVJtc');
      if (dlg) dlg.scrollTop += 800;
      for (const row of document.querySelectorAll(".RWPxGd, .GqCBgb, [role='tablist']")) {
        if (row.scrollWidth > row.clientWidth + 20) row.scrollLeft += 350;
      }
    });
    await sleep(500);
    mergeProducts(all, await readProductsFromDom(page));
    if (page.content) mergeFromHtml(all, await page.content());
    staleRounds = all.size === before ? staleRounds + 1 : 0;
    if (all.size >= 30 && staleRounds >= 2) break;
    if (staleRounds >= 4) break;
  }

  for (const chunk of htmlChunks) mergeFromHtml(all, chunk);

  await extractFromBusinessEditorFrame(page, all);

  return [...all.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function buildDirectBusinessProductsUrl(googleLocationNumericId: string): string {
  return `https://www.google.com/local/business/${googleLocationNumericId}/editprofile/products?hl=en&authuser=0`;
}

export function buildGoogleSearchProductsUrl(
  locationName: string,
  googleLocationNumericId?: string | null,
): string {
  const q = encodeURIComponent(locationName);
  const base = `https://www.google.com/search?q=${q}&hl=en&authuser=0`;
  if (googleLocationNumericId) {
    return `${base}#mpd=~${googleLocationNumericId}/editprofile/products`;
  }
  return base;
}

export function isQualityProductImport(products: GbpCatalogProduct[]): boolean {
  if (products.length < 2) return false;
  const withImage = products.filter((p) => p.imageUrl && isImageUrl(p.imageUrl));
  return withImage.length >= 2 || products.length >= 5;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
