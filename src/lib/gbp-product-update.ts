import {
  closeGmbBrowser,
  GMB_SESSION_HINT,
  openGmbBrowser,
  resolveChromeExecutable,
  type GbpBrowserSession,
} from "./gbp-chrome-session";
import { buildGoogleSearchProductsUrl } from "./gbp-product-search-dom";
import { extractGoogleLocationNumericId } from "./gbp-product-business-import";

export interface GbpProductUpdateInput {
  googleLocationId: string;
  locationName: string;
  originalName: string;
  googleEditId?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  price?: number | null;
  imageUrl?: string | null;
  landingUrl?: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type FrameLike = {
  url: () => string;
  evaluate: <T>(fn: (...args: any[]) => T | Promise<T>, ...args: any[]) => Promise<T>;
};

function findBusinessEditorFrame(
  page: { frames: () => FrameLike[] },
  mode: "list" | "edit",
): FrameLike | undefined {
  const frames = page.frames();
  if (mode === "edit") {
    return frames.find((f) => /local\/business\/\d+\/editprofile\/products\/[0-9a-f-]{36}\/edit/.test(f.url()));
  }
  return frames.find((f) => /local\/business\/\d+\/editprofile\/products(?:\?|$)/.test(f.url()));
}

/** RightChoice-style: push product edits to GMB Product Editor via logged-in Chrome. */
export async function pushProductUpdateToGoogle(
  input: GbpProductUpdateInput,
): Promise<{ ok: boolean; googleEditId?: string; error?: string }> {
  if (!resolveChromeExecutable()) {
    return { ok: false, error: "Chrome not found (set CHROME_PATH in .env)" };
  }

  const numericId = extractGoogleLocationNumericId(input.googleLocationId);
  if (!numericId) return { ok: false, error: "Invalid Google location id" };

  let puppeteer: typeof import("puppeteer-core");
  try {
    puppeteer = await import("puppeteer-core");
  } catch {
    return { ok: false, error: "puppeteer-core not installed" };
  }

  let session: GbpBrowserSession | null = null;
  let page: Awaited<ReturnType<GbpBrowserSession["browser"]["newPage"]>> | null = null;

  try {
    session = await openGmbBrowser(puppeteer, { preferHeadless: true });
    page = await session.browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    const productsUrl = buildGoogleSearchProductsUrl(input.locationName, numericId);

    if (input.googleEditId) {
      const editUrl = `${productsUrl.split("#")[0]}#mpd=~${numericId}/editprofile/products/${input.googleEditId}/edit`;
      await page.goto(editUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
      await sleep(8000);
    } else {
      await page.goto(productsUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
      await sleep(8000);

      const bizFrame = findBusinessEditorFrame(page, "list");
      if (!bizFrame) {
        return { ok: false, error: `GMB Product Editor not loaded. ${GMB_SESSION_HINT}` };
      }

      for (let i = 0; i < 25; i++) {
        await bizFrame.evaluate(() => window.scrollBy(0, 500));
        await sleep(350);
      }
      const clicked = await bizFrame.evaluate((productName: string) => {
        for (const el of document.querySelectorAll('[jsname="LIZVtc"]')) {
          if (el.textContent?.trim() !== productName) continue;
          const target = el.closest("[tabindex]") || el.closest("[data-product-name]") || el;
          target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          return true;
        }
        return false;
      }, input.originalName);
      if (!clicked) {
        return { ok: false, error: `Product "${input.originalName}" not found in GMB editor` };
      }
      await sleep(7000);
    }

    const editFrame = findBusinessEditorFrame(page, "edit");
    if (!editFrame) {
      return { ok: false, error: "GMB product edit form not loaded" };
    }
    const googleEditId =
      editFrame.url().match(/editprofile\/products\/([0-9a-f-]{36})/)?.[1] ||
      input.googleEditId ||
      undefined;

    const filled = await editFrame.evaluate((data) => {
      const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        "input[type='text'], textarea",
      );
      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        const label = input.closest("label")?.textContent?.trim() || "";
        if (label.toLowerCase().startsWith("product name")) {
          input.focus();
          input.value = data.name;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (data.description && label.toLowerCase().startsWith("product description")) {
          input.focus();
          input.value = data.description;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (data.category && label.toLowerCase().startsWith("product category")) {
          input.focus();
          input.value = data.category;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (data.price != null && label.toLowerCase().startsWith("product price")) {
          input.focus();
          input.value = String(data.price);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (data.landingUrl && label.toLowerCase().startsWith("product landing page")) {
          input.focus();
          input.value = data.landingUrl;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }

      const buttons = document.querySelectorAll("button");
      for (let i = 0; i < buttons.length; i++) {
        const text = buttons[i].textContent?.trim() || "";
        if (/^publish$/i.test(text)) {
          buttons[i].click();
          return { ok: true };
        }
      }
      return { ok: false, reason: "Publish button not found" };
    }, {
      name: input.name,
      description: input.description,
      category: input.category,
      price: input.price,
      landingUrl: input.landingUrl,
    });

    if (!filled.ok) {
      return { ok: false, error: filled.reason || "Could not publish product to Google" };
    }

    await sleep(5000);
    return { ok: true, googleEditId };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    if (page) await page.close().catch(() => undefined);
    if (session) await closeGmbBrowser(session);
  }
}
