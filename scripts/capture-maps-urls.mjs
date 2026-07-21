import { existsSync } from "fs";
import puppeteer from "puppeteer-core";

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.setExtraHTTPHeaders({ "Accept-Language": "en-IN,en;q=0.9" });

const urls = [];
page.on("response", (res) => {
  const u = res.url();
  if (u.includes("google.com") && !u.includes(".js") && !u.includes(".css") && !u.includes(".png")) {
    urls.push({ u: u.slice(0, 200), s: res.status() });
  }
});

await page.goto("https://maps.google.com/maps?cid=5733014544512311485&hl=en", {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 8000));

console.log("unique urls", urls.length);
for (const { u, s } of urls.filter((x) => /preview|rpc|async|product|merchant|place|search/i.test(x.u))) {
  console.log(s, u);
}

await browser.close();
