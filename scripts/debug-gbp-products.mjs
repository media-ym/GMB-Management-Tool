const cid = "5733014544512311485";
const q = encodeURIComponent("My FNG Multi Brand Car Garage Majiwada Thane West");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const COOKIE = "CONSENT=YES+cb; SOCS=CAI";

const urls = [
  `https://www.google.com/search?q=${q}&hl=en&gl=in&pws=0`,
  `https://www.google.com/search?q=${q}&hl=en&gbv=1`,
  `https://www.google.com/search?q=${q}&hl=en&uule=w+CAIQICIITGhhbmUsTWFoYXJhc2htraXL`,
];

for (const url of urls) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: COOKIE,
      Accept: "text/html",
    },
    redirect: "follow",
  });
  const t = await r.text();
  console.log("\n===", url.includes("gbv") ? "gbv=1" : url.slice(-20), "===");
  console.log("len", t.length, "AF_init", t.includes("AF_initDataCallback"), "Fender", t.includes("Fender"));
  if (t.includes("AF_initDataCallback")) {
    const hits = [...t.matchAll(/"([^"]{4,70})"/g)].map((m) => m[1]).filter((s) => /fender|tow|wax|dent|vehicle|bumper/i.test(s));
    console.log("hits", [...new Set(hits)].slice(0, 15));
  }
}
