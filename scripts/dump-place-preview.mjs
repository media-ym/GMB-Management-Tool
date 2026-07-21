import { writeFileSync } from "fs";
import puppeteer from "puppeteer-core";

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();

let placeBody = "";
page.on("response", async (res) => {
  if (res.url().includes("/maps/preview/place")) {
    try {
      placeBody = await res.text();
    } catch {}
  }
});

await page.goto("https://maps.google.com/maps?cid=5733014544512311485&hl=en", {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 5000));

writeFileSync("/tmp/gbp-place.txt", placeBody);
console.log("place body len", placeBody.length);

// extract quoted strings
const strings = [...placeBody.matchAll(/"([^"\\]{3,100})"/g)].map((m) => m[1]);
const uniq = [...new Set(strings)];
const productish = uniq.filter((s) =>
  /fender|tow|dent|wax|polish|bumper|battery|filter|paint|service|repair|detailing|roadside|garage|brake|clutch|ac |oil/i.test(s),
);
console.log("productish strings", productish.slice(0, 40));

// try clicking Products tab via aria
const tabs = await page.$$eval("[role='tab'], button, a", (els) =>
  els.map((e) => ({ text: e.textContent?.trim(), aria: e.getAttribute("aria-label") })).filter((x) => x.text || x.aria),
);
console.log("tabs with product", tabs.filter((t) => /product/i.test(t.text || "") || /product/i.test(t.aria || "")));

await browser.close();
