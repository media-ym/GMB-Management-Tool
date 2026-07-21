import puppeteer from "puppeteer-core";
import { getValidAccessToken } from "../src/lib/google-service.ts";

const token = await getValidAccessToken();
const loc = "15991959190801732750";
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.setExtraHTTPHeaders({ Authorization: `Bearer ${token}` });

const bodies = [];
page.on("response", async (res) => {
  const u = res.url();
  if (/batchexecute|rpc|product|merchant|data/i.test(u)) {
    try {
      const t = await res.text();
      if (t.length > 200) bodies.push({ u: u.slice(0, 120), t });
    } catch {}
  }
});

await page.goto(`https://business.google.com/n/${loc}/products`, {
  waitUntil: "networkidle2",
  timeout: 90000,
});
await new Promise((r) => setTimeout(r, 8000));

const html = await page.content();
console.log("html len", html.length);
for (const kw of ["Left Fender", "Vehicle Tow", "Denting", "Wax Polishing", "Edit products", "No products"]) {
  console.log(kw, html.includes(kw));
}

for (const { u, t } of bodies) {
  if (/Fender|Tow|Denting|Wax|Left Fender|Vehicle Tow/i.test(t)) {
    console.log("HIT", u);
    const idx = t.search(/Fender|Tow|Denting|Wax/i);
    console.log(t.slice(Math.max(0, idx - 80), idx + 200));
  }
}

await browser.close();
