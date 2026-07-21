/** GBP merchant catalog products — not services synced from serviceItems. */
export function isMerchantProduct(p: {
  name: string;
  category: string | null;
  source: string;
  googleItemId?: string | null;
}): boolean {
  if (p.source === "manual") return true;
  if (p.source === "gmb_catalog") return true;
  // Created from Google PRODUCT-type posts
  if (p.googleItemId?.includes("localPosts")) return true;
  if (p.source !== "google") return true;

  const name = p.name.trim().toLowerCase();
  if (!name || name === "product" || name === "service") return false;
  if (name.startsWith("job_type_id:")) return false;

  const cat = (p.category ?? "").toLowerCase();
  if (cat === "services" || cat.startsWith("job_type_id")) return false;

  return false;
}

export function merchantProductWhere(locationIds: string[]) {
  return {
    locationId: { in: locationIds },
    isActive: true,
    OR: [
      { source: "manual" },
      { source: "gmb_catalog" },
      { googleItemId: { contains: "localPosts" } },
    ],
  };
}
