import { getValidAccessToken } from "../src/lib/google-service.ts";
import { writeFileSync } from "fs";

const token = await getValidAccessToken();
const v1url = "https://mybusinessbusinessinformation.googleapis.com/v1/locations/15991959190801732750?readMask=serviceItems";
const r = await fetch(v1url, { headers: { Authorization: `Bearer ${token}` } });
const j = await r.json();
writeFileSync("/tmp/service-items.json", JSON.stringify(j.serviceItems, null, 2));

const freeForm = (j.serviceItems || []).filter((s) => s.freeFormServiceItem);
const structured = (j.serviceItems || []).filter((s) => s.structuredServiceItem);
console.log("total", j.serviceItems?.length, "freeForm", freeForm.length, "structured", structured.length);
for (const s of freeForm.slice(0, 30)) {
  const label = s.freeFormServiceItem.label;
  console.log("-", label?.displayName, "| cat:", label?.category, "| price:", JSON.stringify(s.price));
}
