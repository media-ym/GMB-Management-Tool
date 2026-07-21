import { existsSync } from "fs";
import puppeteer from "puppeteer-core";

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: false,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1400,900"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });

const captured = [];
page.on("response", async (res) => {
  const u = res.url();
  if (/preview|rpc|batchexecute|product|merchant/i.test(u)) {
    try {
      const t = await res.text();
      if (t.length > 300) captured.push({ url: u, body: t });
    } catch {}
  }
});

// Google Search knowledge panel often shows Products carousel
await page.goto(
  "https://www.google.com/search?q=My+FNG+Multi+Brand+Car+Garage+Majiwada+Thane&hl=en&gl=in",
  { waitUntil: "networkidle2", timeout: 60000 },
);
await page.evaluate(() => window.scrollBy(0, 400));
await new Promise((r) => setTimeout(r, 5000));

const html = await page.content();
console.log("search html len", html.length);
for (const kw of ["Left Fender", "Vehicle Tow", "Denting", "Wax Polishing", "Products", "View all"]) {
  console.log(kw, html.includes(kw));
}

// click View all / Products in knowledge panel
const clickResult = await page.evaluate(() => {
  const candidates = [...document.querySelectorAll("a, button, span, div")];
  for (const el of candidates) {
    const t = el.textContent?.trim();
    if (t === "View all" || t === "Products" || t === "See all") {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return t;
    }
  }
  return null;
});
console.log("clicked", clickResult);
await new Promise((r) => setTimeout(r, 5000));

const html2 = await page.content();
for (const kw of ["Left Fender", "Vehicle Tow", "Denting", "Wax Polishing"]) {
  console.log("after", kw, html2.includes(kw));
}

for (const { url, body } of captured) {
  if (/Fender|Tow|Denting|Wax|Polish|Left Fender/i.test(body)) {
    console.log("\nRPC", url.slice(0, 150));
    const idx = body.search(/Fender|Tow|Denting|Wax/i);
    console.log(body.slice(Math.max(0, idx - 60), idx + 150));
  }
}

await browser.close();
