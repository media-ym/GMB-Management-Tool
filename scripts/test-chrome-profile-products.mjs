import puppeteer from "puppeteer-core";
import { existsSync } from "fs";

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const userDataDir =
  process.env.CHROME_USER_DATA_DIR ||
  `${process.env.HOME}/Library/Application Support/Google/Chrome`;

if (!existsSync(chrome)) throw new Error("Chrome missing");
console.log("profile", userDataDir);

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: false,
  userDataDir,
  args: ["--no-sandbox", "--profile-directory=Default"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });

page.on("response", async (res) => {
  const u = res.url();
  if (/batchexecute|product|merchant/i.test(u)) {
    try {
      const t = await res.text();
      if (/Fender|Tow|Denting|Wax/i.test(t)) {
        console.log("RPC HIT", u.slice(0, 100));
        const idx = t.search(/Fender|Tow|Denting|Wax/i);
        console.log(t.slice(Math.max(0, idx - 60), idx + 200));
      }
    } catch {}
  }
});

await page.goto("https://business.google.com/n/15991959190801732750/products", {
  waitUntil: "networkidle2",
  timeout: 120000,
});
await new Promise((r) => setTimeout(r, 10000));

const html = await page.content();
console.log("url", page.url(), "len", html.length);
for (const kw of ["Left Fender", "Vehicle Tow", "Denting", "Wax", "Sign in", "Edit products"]) {
  console.log(kw, html.includes(kw));
}

const cards = await page.$$eval("*", (els) =>
  els
    .map((e) => e.textContent?.trim())
    .filter((t) => t && t.length > 5 && t.length < 80)
    .filter((t) => /fender|tow|dent|wax|paint|product/i.test(t)),
);
console.log("card texts", [...new Set(cards)].slice(0, 20));

await browser.close();
