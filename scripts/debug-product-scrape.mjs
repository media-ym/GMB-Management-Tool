import puppeteer from "puppeteer-core";
import { writeFileSync } from "fs";

const numericId = "15991959190801732750";
const searchUrl =
  "https://www.google.com/search?q=My+FNG+-+Multi+Brand+Car+Garage+%26+Repairs+at+Majiwada%2C+Thane+West&hl=en";

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });

const captured = [];
page.on("response", async (res) => {
  try {
    const url = res.url();
    if (!/google\.com|googleusercontent|gstatic/.test(url)) return;
    const body = await res.text();
    if (body.length > 200) captured.push({ url, body });
  } catch {}
});

async function scrape(label, url, clickProducts = false) {
  console.log("\n===", label, "===");
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await new Promise((r) => setTimeout(r, 5000));
  console.log("final url:", page.url());

  if (clickProducts) {
    await page.evaluate(() => {
      for (const el of document.querySelectorAll("button, a, span, div")) {
        const t = el.textContent?.trim();
        if (t === "Products" && el.children.length <= 2) {
          el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          return;
        }
      }
    });
    await new Promise((r) => setTimeout(r, 4000));
  }

  const dom = await page.evaluate(() => {
    const cards = [];
    for (const img of document.querySelectorAll("img[src*='googleusercontent'], img[src*='ggpht']")) {
      const src = img.getAttribute("src") || "";
      if (!src || src.includes("s44-p-k-no") || src.includes("s32-p-k-no")) continue;
      let el = img.parentElement;
      for (let i = 0; i < 8 && el; i++) {
        const texts = [...el.querySelectorAll("span, div, p, h2, h3, h4")]
          .map((n) => n.textContent?.trim())
          .filter((t) => t && t.length > 2 && t.length < 100);
        if (texts.length) {
          cards.push({ src: src.slice(0, 80), texts: [...new Set(texts)].slice(0, 8) });
          break;
        }
        el = el.parentElement;
      }
    }
    return cards.slice(0, 30);
  });

  console.log("dom cards:", dom.length);
  for (const c of dom.slice(0, 15)) console.log("-", c.texts[0], "|", c.texts.slice(1, 3).join(" / "));

  const kws = ["Vehicle Tow", "3M Wax", "Fender", "Denting", "Nano Ceramic", "address", "Press /"];
  for (const kw of kws) {
    const hit = captured.some((c) => c.body.includes(kw));
    console.log("network", kw, hit ? "YES" : "no");
  }
}

await scrape("business products", `https://business.google.com/n/${numericId}/products`);
await scrape("google search", searchUrl, true);

writeFileSync("/tmp/gmb-captured.json", JSON.stringify(captured.slice(-40).map((c) => ({ url: c.url, len: c.body.length, sample: c.body.slice(0, 500) })), null, 2));
console.log("\nSaved", captured.length, "responses to /tmp/gmb-captured.json");

await page.close();
await browser.disconnect();
