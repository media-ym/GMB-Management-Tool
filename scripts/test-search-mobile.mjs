import puppeteer from "puppeteer-core";

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--lang=en-IN"],
});
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true });
await page.setUserAgent(
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
);
await page.setCookie(
  { name: "CONSENT", value: "YES+cb", domain: ".google.com" },
  { name: "SOCS", value: "CAI", domain: ".google.com" },
);

const q = encodeURIComponent("My FNG Multi Brand Car Garage Majiwada Thane");
await page.goto(`https://www.google.com/search?q=${q}&hl=en-IN&gl=in&pws=0`, {
  waitUntil: "networkidle2",
  timeout: 90000,
});
await new Promise((r) => setTimeout(r, 6000));

const html = await page.content();
console.log("len", html.length, "AF_init", html.includes("AF_initDataCallback"));
for (const kw of ["Left Fender", "Vehicle Tow", "Denting", "Wax Polishing", "Products", "View all", "merchant"]) {
  console.log(kw, html.includes(kw));
}

const hits = [...html.matchAll(/"([^"\\]{4,80})"/g)]
  .map((m) => m[1])
  .filter((s) => /fender|tow|dent|wax|paint|product|roadside|bumper/i.test(s));
console.log("hits", [...new Set(hits)].slice(0, 25));

await browser.close();
