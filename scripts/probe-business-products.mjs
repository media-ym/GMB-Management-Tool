import { getValidAccessToken } from "../src/lib/google-service.ts";
import { writeFileSync } from "fs";

const token = await getValidAccessToken();
const loc = "15991959190801732750";
const url = `https://business.google.com/n/${loc}/products`;

const r = await fetch(url, {
  headers: {
    Authorization: `Bearer ${token}`,
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    Accept: "text/html,*/*",
  },
});
const html = await r.text();
writeFileSync("/tmp/business-products.html", html);
console.log("status", r.status, "len", html.length);

for (const kw of ["Left Fender", "Vehicle Tow", "Denting", "Wax Polishing", "Fender", "Tow", "AF_initDataCallback", "batchexecute"]) {
  console.log(kw, html.includes(kw));
}

const strings = [...html.matchAll(/"([^"\\]{4,100})"/g)].map((m) => m[1]);
const hits = [...new Set(strings)].filter((s) => /fender|tow|dent|wax|polish|bumper|roadside|left fender|vehicle tow/i.test(s));
console.log("productish strings", hits.slice(0, 40));

// decode unicode escapes
const decoded = html.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
for (const kw of ["Left Fender", "Vehicle Tow", "Denting", "Wax"]) {
  console.log("decoded", kw, decoded.includes(kw));
}
