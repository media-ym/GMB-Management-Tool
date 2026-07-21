/**
 * Probe Google APIs for GBP product catalog with stored OAuth token.
 * Run: npx tsx scripts/probe-gbp-products.mjs
 */
import { db } from "../src/lib/db.ts";
import { getValidAccessToken, resolveV4LocationName, listGooglePosts } from "../src/lib/google-service.ts";

const GBP_V4 = "https://mybusiness.googleapis.com/v4";
const GBP_V1 = "https://mybusinessbusinessinformation.googleapis.com/v1";

async function probe(name, url, token, method = "GET", body) {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const short = text.slice(0, 500).replace(/\s+/g, " ");
    const hasProduct = /product|fender|tow|dent|catalog|merchant|Left Fender/i.test(text);
    console.log(`\n[${res.status}] ${name}`);
    console.log(short);
    if (hasProduct) console.log("  ^ contains product keywords");
    return { status: res.status, text };
  } catch (e) {
    console.log(`\n[ERR] ${name}:`, e.message);
    return null;
  }
}

const locationId = process.argv[2] || "cmrdhaph400a0ehqqn1ad4psl";
const gbp = await db.googleBusinessProfile.findFirst({ where: { locationId } });
if (!gbp) throw new Error("no gbp");

const token = await getValidAccessToken();
if (!token) throw new Error("no token");

const v1 = gbp.googleLocationId.startsWith("locations/")
  ? gbp.googleLocationId
  : `locations/${gbp.googleLocationId}`;
const v4 = await resolveV4LocationName(token, v1);
console.log("v4", v4, "v1", v1);

const endpoints = [
  ["v4 serviceList", `${GBP_V4}/${v4}/serviceList`],
  ["v4 localPosts", `${GBP_V4}/${v4}/localPosts?pageSize=100`],
  ["v4 products", `${GBP_V4}/${v4}/products`],
  ["v4 productList", `${GBP_V4}/${v4}/productList`],
  ["v4 merchantProducts", `${GBP_V4}/${v4}/merchantProducts`],
  ["v4 foodMenus", `${GBP_V4}/${v4}/foodMenus`],
  ["v1 serviceItems", `${GBP_V1}/${v1}?readMask=serviceItems,metadata,profile`],
  ["v1 attributes", `${GBP_V1}/${v1}/attributes`],
  ["v1 getGoogleUpdated", `${GBP_V1}/${v1}:getGoogleUpdated?readMask=serviceItems,profile`],
];

for (const [name, url] of endpoints) {
  await probe(name, url, token);
}

const posts = await listGooglePosts(token, v4);
console.log("\nlocalPosts count", posts.length, "PRODUCT", posts.filter((p) => p.topicType === "PRODUCT").length);

await db.$disconnect();
