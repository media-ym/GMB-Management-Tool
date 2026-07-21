import { existsSync } from "fs";
import puppeteer from "puppeteer-core";

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });

const allBodies = [];
page.on("response", async (res) => {
  try {
    const t = await res.text();
    if (t.length > 500) allBodies.push({ url: res.url(), body: t });
  } catch {}
});

await page.goto("https://maps.google.com/maps?cid=5733014544512311485&hl=en", {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 6000));

// click anything with Products in text
await page.evaluate(() => {
  for (const el of document.querySelectorAll("*")) {
    const t = el.textContent?.trim();
    if (t === "Products" && el.children.length === 0) {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  }
});
await new Promise((r) => setTimeout(r, 4000));

const keywords = ["Fender", "Tow", "Denting", "Wax", "Polish", "Bumper", "Battery", "Filter", "Paint"];
for (const { url, body } of allBodies) {
  for (const kw of keywords) {
    if (body.includes(kw)) {
      const idx = body.indexOf(kw);
      console.log("\nHIT", kw, url.slice(0, 150));
      console.log(body.slice(Math.max(0, idx - 80), idx + 120).replace(/\n/g, " "));
    }
  }
}

console.log("\nTotal bodies", allBodies.length);
await browser.close();
