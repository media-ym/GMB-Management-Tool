import { db } from "@/lib/db";

/** "Near me" + national local-intent phrases — same text for every location. */
export const DEFAULT_TRACKING_KEYWORDS_STATIC = [
  "car service near me",
  "car garage near me",
  "car repair near me",
  "car mechanic near me",
  "car ac service near me",
  "car servicing near me",
  "multi brand car service near me",
  "auto repair shop near me",
  "wheel alignment near me",
  "brake repair near me",
  "car battery replacement near me",
  "periodic car service near me",
  "denting painting near me",
  "car workshop near me",
  "oil change near me",
] as const;

/** Expanded with `{city}` for hyper-local tracking (doc 10 §6). */
export const DEFAULT_TRACKING_KEYWORD_TEMPLATES = [
  "car service {city}",
  "car repair {city}",
  "car garage {city}",
  "car ac repair {city}",
  "wheel alignment {city}",
  "multi brand car service {city}",
  "car mechanic {city}",
  "best car service {city}",
  "maruti service center {city}",
  "hyundai car service {city}",
] as const;

/** @deprecated use buildKeywordsForLocation — kept for imports */
export const DEFAULT_TRACKING_KEYWORDS = DEFAULT_TRACKING_KEYWORDS_STATIC;

export function buildKeywordsForLocation(city: string): string[] {
  const place = city.trim() || "near me";
  const cityKeywords = DEFAULT_TRACKING_KEYWORD_TEMPLATES.map((t) =>
    t.replace(/\{city\}/gi, place),
  );
  return [...DEFAULT_TRACKING_KEYWORDS_STATIC, ...cityKeywords];
}

export type EnsureDefaultKeywordsResult = {
  locations: number;
  created: number;
  skipped: number;
  keywordsPerLocation: number;
};

/**
 * Idempotent — adds missing default keywords per location (does not delete or overwrite).
 */
export async function ensureDefaultLocationKeywords(opts?: {
  locationIds?: string[];
}): Promise<EnsureDefaultKeywordsResult> {
  const locations = await db.location.findMany({
    where: {
      status: "active",
      ...(opts?.locationIds?.length ? { id: { in: opts.locationIds } } : {}),
    },
    select: { id: true, city: true, state: true },
    orderBy: { name: "asc" },
  });

  const keywordsPerLocation =
    DEFAULT_TRACKING_KEYWORDS_STATIC.length + DEFAULT_TRACKING_KEYWORD_TEMPLATES.length;

  if (locations.length === 0) {
    return { locations: 0, created: 0, skipped: 0, keywordsPerLocation };
  }

  const locationIds = locations.map((l) => l.id);
  const existing = await db.keyword.findMany({
    where: { locationId: { in: locationIds } },
    select: { locationId: true, keyword: true },
  });

  const have = new Set(existing.map((k) => `${k.locationId}\0${k.keyword.toLowerCase()}`));
  const toCreate: {
    locationId: string;
    keyword: string;
    city: string;
    state: string;
    status: string;
  }[] = [];

  for (const loc of locations) {
    const city = loc.city?.trim() || "Unknown";
    const state = loc.state?.trim() || "Maharashtra";
    for (const keyword of buildKeywordsForLocation(city)) {
      if (have.has(`${loc.id}\0${keyword.toLowerCase()}`)) continue;
      toCreate.push({
        locationId: loc.id,
        keyword,
        city,
        state,
        status: "active",
      });
    }
  }

  if (toCreate.length > 0) {
    await db.keyword.createMany({ data: toCreate, skipDuplicates: true });
  }

  const expected = locations.length * keywordsPerLocation;
  return {
    locations: locations.length,
    created: toCreate.length,
    skipped: expected - toCreate.length,
    keywordsPerLocation,
  };
}
