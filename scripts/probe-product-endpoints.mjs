import { getValidAccessToken } from "../src/lib/google-service.ts";

const token = await getValidAccessToken();
const locId = "15991959190801732750";
const accountId = "105179261907134183051";

const urls = [
  `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locId}/serviceList`,
  `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${locId}/products`,
  `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${locId}/productCatalog`,
  `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${locId}/merchantProducts`,
  `https://businessprofileperformance.googleapis.com/v1/locations/${locId}:fetchMultiDailyMetricsTimeSeries`,
  `https://merchantapi.googleapis.com/products/v1/accounts/${accountId}/products?pageSize=10`,
  `https://content.googleapis.com/content/v2.1/105179261907134183051/products`,
];

for (const url of urls) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const t = await r.text();
  console.log("\n", r.status, url.split(".com")[1]?.slice(0, 80));
  console.log(t.slice(0, 300).replace(/\s+/g, " "));
}
