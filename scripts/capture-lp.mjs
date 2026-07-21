import puppeteer from "puppeteer-core";

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();

let lpBody = "";
page.on("response", async (res) => {
  if (res.url().includes("/maps/preview/lp")) {
    try {
      lpBody = await res.text();
    } catch {}
  }
});

await page.goto("https://maps.google.com/maps?cid=5733014544512311485&hl=en", {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 8000));

console.log("lp len", lpBody.length);
for (const kw of ["Left Fender", "Vehicle Tow", "Denting", "Wax", "Product", "merchant", "60107"]) {
  console.log(kw, lpBody.includes(kw));
}
if (lpBody.length > 100) {
  const strings = [...lpBody.matchAll(/"([^"\\]{4,80})"/g)].map((m) => m[1]);
  const hits = [...new Set(strings)].filter((s) => /fender|tow|dent|wax|paint|product|roadside|bumper/i.test(s));
  console.log("hits", hits.slice(0, 30));
}

await browser.close();
