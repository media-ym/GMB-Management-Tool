import type { Page } from "puppeteer-core";
import type { GbpCatalogProduct } from "./gbp-product-utils";
import { buildGoogleSearchProductsUrl } from "./gbp-product-search-dom";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function findBusinessEditFrame(page: Page) {
  return page.frames().find((f) =>
    /local\/business\/\d+\/editprofile\/products\/[0-9a-f-]{36}\/edit/.test(f.url()),
  );
}

export interface GbpProductEditorDetails {
  name?: string;
  category?: string;
  description?: string;
  price?: number;
  landingUrl?: string;
  imageUrl?: string;
}

/** Scrape full product fields from GMB Product Editor edit form (price, description, etc.). */
export async function fetchProductDetailsFromEditor(
  page: Page,
  opts: { locationName: string; googleLocationNumericId: string; googleEditId: string },
): Promise<GbpProductEditorDetails | null> {
  const base = buildGoogleSearchProductsUrl(opts.locationName, opts.googleLocationNumericId).split("#")[0];
  const editUrl = `${base}#mpd=~${opts.googleLocationNumericId}/editprofile/products/${opts.googleEditId}/edit`;

  await page.goto(editUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(5000);

  const editFrame = findBusinessEditFrame(page);
  if (!editFrame) return null;

  return editFrame.evaluate(() => {
    const out: Record<string, string> = {};
    const inputs = document.querySelectorAll("input[type='text'], textarea");
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i] as HTMLInputElement | HTMLTextAreaElement;
      const labelRaw = input.closest("label")?.textContent?.trim() || "";
      const label = labelRaw.split("\n")[0].trim();
      if (!label) continue;
      out[label.toLowerCase()] = input.value?.trim() || "";
    }

    let imageUrl = "";
    const img = document.querySelector("img[src*='googleusercontent']") as HTMLImageElement | null;
    if (img?.src) imageUrl = img.src;
    if (!imageUrl) {
      const bgEl = document.querySelector("[style*='googleusercontent']") as HTMLElement | null;
      const bg = bgEl?.style?.backgroundImage || "";
      const m = bg.match(/url\(['"]?(https:\/\/lh\d+\.googleusercontent\.com[^'")\s]+)/);
      if (m) imageUrl = m[1];
    }

    const priceRaw = out["product price (inr)"] || out["product price"] || "";
    const priceNum = parseFloat(priceRaw.replace(/[^\d.]/g, ""));

    return {
      name: out["product name"] || undefined,
      category: out["product category"] || undefined,
      description: out["product description"]?.slice(0, 4000) || undefined,
      price: Number.isFinite(priceNum) && priceNum > 0 ? priceNum : undefined,
      landingUrl: out["product landing page url (optional)"] || out["product landing page url"] || undefined,
      imageUrl: imageUrl || undefined,
    };
  });
}

/** Enrich catalog list with price, description, category from each product's edit page. */
export async function enrichProductsWithEditorDetails(
  page: Page,
  products: GbpCatalogProduct[],
  opts: { locationName: string; googleLocationNumericId: string },
): Promise<GbpCatalogProduct[]> {
  const enriched: GbpCatalogProduct[] = [];

  for (const product of products) {
    if (!product.googleEditId) {
      enriched.push(product);
      continue;
    }

    try {
      const details = await fetchProductDetailsFromEditor(page, {
        locationName: opts.locationName,
        googleLocationNumericId: opts.googleLocationNumericId,
        googleEditId: product.googleEditId,
      });

      enriched.push({
        ...product,
        name: details?.name || product.name,
        category: details?.category || product.category,
        description: details?.description || product.description,
        price: details?.price ?? product.price,
        imageUrl: details?.imageUrl || product.imageUrl,
        landingUrl: details?.landingUrl || product.landingUrl,
      });
    } catch {
      enriched.push(product);
    }

    await sleep(400);
  }

  return enriched;
}
