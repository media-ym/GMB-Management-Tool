import { existsSync, writeFileSync } from "fs";
import puppeteer from "puppeteer-core";

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();

page.on("response", async (res) => {
  const u = res.url();
  if (/batchexecute|preview\/lp|preview\/place/i.test(u)) {
    try {
      const t = await res.text();
      const name = u.includes("batchexecute")
        ? u.match(/rpcids=([^&]+)/)?.[1] || "batch"
        : u.includes("/lp")
          ? "lp"
          : "place";
      writeFileSync(`/tmp/gbp-${name}.txt`, t);
      console.log("saved", name, t.length, "Fender", t.includes("Fender"), "Tow", t.includes("Tow"));
    } catch {}
  }
});

await page.goto("https://maps.google.com/maps?cid=5733014544512311485&hl=en", {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 10000));
await browser.close();
