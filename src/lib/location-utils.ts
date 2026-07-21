/** Parse "… at Kasarvadavali, Thane West" → area + city */
export function extractLocationFromName(name: string): { area: string | null; city: string | null } {
  const atMatch = name.match(/\bat\s+(.+)$/i);
  if (!atMatch) return { area: null, city: null };
  const locationPart = atMatch[1].trim();
  const parts = locationPart.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      area: parts.slice(0, -1).join(", "),
      city: parts[parts.length - 1],
    };
  }
  return { area: null, city: locationPart };
}

export function resolveLocationCity(loc: { city: string; name: string; address?: string }): string {
  if (loc.city && loc.city !== "Unknown") return loc.city;
  const extracted = extractLocationFromName(loc.name);
  if (extracted.city) return extracted.city;
  const fromAddress = inferCityFromAddress(loc.address ?? "");
  if (fromAddress) return fromAddress;
  if (loc.city === "Unknown") return "—";
  return loc.city || "—";
}

/** Try to pull a city/locality from a comma-separated address string. */
export function inferCityFromAddress(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const meaningful = parts.filter(
    (p) => !/^\d{5,6}$/.test(p) && !/^(maharashtra|india)$/i.test(p),
  );
  if (meaningful.length >= 2) {
    return meaningful[meaningful.length - 2] ?? meaningful[meaningful.length - 1] ?? null;
  }
  return meaningful[0] ?? null;
}

/** Area line for cards — never shows "Unknown, Maharashtra". */
export function formatLocationCardArea(loc: {
  city: string;
  region: string;
  name: string;
  address?: string;
}): string {
  const city = resolveLocationCity(loc);
  if (city === "—") return loc.region || "Maharashtra";
  const state = (loc.region || "Maharashtra").trim();
  if (state && state.toLowerCase() !== city.toLowerCase()) {
    return `${city}, ${state}`;
  }
  return city;
}

/** City + state line for headers — avoids duplicate "Maharashtra, Maharashtra". */
export function formatLocationAreaLine(loc: { city: string; region: string; state: string; name: string }): string {
  const city = resolveLocationCity(loc);
  const state = (loc.state || loc.region || "").trim();
  if (state && state.toLowerCase() !== city.toLowerCase()) {
    return `${city}, ${state}`;
  }
  return city;
}

export function resolveLocationAddress(loc: { address: string; name: string }): string {
  if (loc.address?.trim()) return loc.address.trim();
  const extracted = extractLocationFromName(loc.name);
  if (extracted.area && extracted.city) return `${extracted.area}, ${extracted.city}`;
  if (extracted.city) return extracted.city;
  return "Sync to load address";
}

export function parseGoogleAddress(addr: {
  addressLines?: string[];
  locality?: string;
  sublocality?: string;
  administrativeArea?: string;
  postalCode?: string;
} | null | undefined): {
  address: string;
  city: string;
  region: string;
  state: string;
  pincode: string | null;
} {
  if (!addr) {
    return { address: "", city: "", region: "Maharashtra", state: "Maharashtra", pincode: null };
  }
  const city = addr.locality || addr.sublocality || addr.administrativeArea || "";
  const state = addr.administrativeArea || "Maharashtra";
  const parts = [
    addr.addressLines?.join(", "),
    addr.locality,
    addr.administrativeArea,
    addr.postalCode,
  ].filter(Boolean);
  return {
    address: parts.join(", "),
    city,
    region: state,
    state,
    pincode: addr.postalCode || null,
  };
}
