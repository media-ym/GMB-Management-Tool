import puppeteer from "puppeteer-core";

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.goto("https://maps.google.com/maps?cid=5733014544512311485&hl=en", {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 5000));

const hits = await page.evaluate(() => {
  const html = document.documentElement.innerHTML;
  const re = /Merchant[A-Za-z]*Service\.[A-Za-z]+/g;
  return [...new Set(html.match(re) || [])].slice(0, 50);
});
console.log("merchant services in page", hits);

const scripts = await page.$$eval("script[src]", (els) =>
  els.map((e) => e.getAttribute("src")).filter((s) => s?.includes("maps")),
);
console.log("script count", scripts.length);

await browser.close();
