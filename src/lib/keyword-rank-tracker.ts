import { db } from "@/lib/db";
import {
  formatPlacesApiError,
  getPlacesApiKey,
  isPlacesConfigError,
} from "@/lib/places-api-key";

const PLACES_TEXT = "https://places.googleapis.com/v1/places:searchText";
const LEGACY_TEXT = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const FIELD_MASK = "places.id,places.displayName";

function normalizePlaceId(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.replace(/^places\//, "");
}

function isOwnBusiness(name: string): boolean {
  return /my\s*fng|myfng/i.test(name);
}

function rankFromResults(
  places: Array<{ id?: string; name?: string }>,
  targetPlaceId: string | null,
): number {
  for (let i = 0; i < places.length; i++) {
    const id = normalizePlaceId(places[i].id);
    const name = places[i].name || "";
    if (targetPlaceId && id === targetPlaceId) return i + 1;
    if (isOwnBusiness(name)) return i + 1;
    if (name.toLowerCase().includes("my fng")) return i + 1;
  }
  return 0;
}

async function searchPlacesNew(
  keyword: string,
  lat: number,
  lng: number,
  key: string,
): Promise<Array<{ id?: string; name?: string }>> {
  const res = await fetch(PLACES_TEXT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: keyword,
      maxResultCount: 20,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: 8000,
        },
      },
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message || `Places search failed (${res.status})`);
  }

  return ((json.places as Array<Record<string, unknown>>) || []).map((raw) => ({
    id: typeof raw.id === "string" ? raw.id : undefined,
    name: (raw.displayName as { text?: string } | undefined)?.text,
  }));
}

async function searchPlacesLegacy(
  keyword: string,
  lat: number,
  lng: number,
  key: string,
): Promise<Array<{ id?: string; name?: string }>> {
  const url = new URL(LEGACY_TEXT);
  url.searchParams.set("query", keyword);
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("radius", "8000");
  url.searchParams.set("key", key);

  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  const status = json?.status as string | undefined;
  if (status && status !== "OK" && status !== "ZERO_RESULTS") {
    throw new Error(json?.error_message || status);
  }

  return ((json.results as Array<Record<string, unknown>>) || []).map((raw) => ({
    id: typeof raw.place_id === "string" ? raw.place_id : undefined,
    name: (raw.name as string) || undefined,
  }));
}

/** Find local pack rank (1–20) for a keyword near a lat/lng. 0 = not in top 20. */
export async function findKeywordLocalRank(opts: {
  keyword: string;
  lat: number;
  lng: number;
  placeId?: string | null;
  businessName?: string | null;
}): Promise<number> {
  const key = getPlacesApiKey();
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY or GOOGLE_API_KEY is not configured");

  const targetPlaceId = normalizePlaceId(opts.placeId);
  let lastError = "";

  try {
    const places = await searchPlacesNew(opts.keyword, opts.lat, opts.lng, key);
    return rankFromResults(places, targetPlaceId);
  } catch (e: unknown) {
    lastError = e instanceof Error ? e.message : "Places (New) failed";
    if (!isPlacesConfigError(lastError)) throw new Error(formatPlacesApiError(lastError));
  }

  try {
    const places = await searchPlacesLegacy(opts.keyword, opts.lat, opts.lng, key);
    return rankFromResults(places, targetPlaceId);
  } catch (e: unknown) {
    const legacyMsg = e instanceof Error ? e.message : "Legacy Places failed";
    throw new Error(formatPlacesApiError(lastError || legacyMsg));
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type RefreshKeywordRankingsResult = {
  checked: number;
  ranked: number;
  skipped: number;
  errors: string[];
};

/**
 * Check Google Maps rank for tracked keywords and store KeywordRanking snapshots.
 */
export async function refreshKeywordRankings(opts?: {
  locationIds?: string[];
  keywordIds?: string[];
  limit?: number;
  delayMs?: number;
}): Promise<RefreshKeywordRankingsResult> {
  if (!getPlacesApiKey()) {
    throw new Error(
      "Set GOOGLE_PLACES_API_KEY (server key, no HTTP referrer lock) or GOOGLE_API_KEY in .env",
    );
  }

  const limit = Math.min(Math.max(opts?.limit ?? 40, 1), 100);
  const delayMs = opts?.delayMs ?? 250;

  const keywords = await db.keyword.findMany({
    where: {
      status: "active",
      ...(opts?.keywordIds?.length ? { id: { in: opts.keywordIds } } : {}),
      ...(opts?.locationIds?.length ? { locationId: { in: opts.locationIds } } : {}),
      locationId: { not: null },
    },
    include: {
      location: {
        select: {
          id: true,
          name: true,
          latitude: true,
          longitude: true,
          googleProfiles: { take: 1, select: { placeId: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let checked = 0;
  let ranked = 0;
  let skipped = 0;
  const errors: string[] = [];
  const now = new Date();

  for (const kw of keywords) {
    const loc = kw.location;
    if (!loc?.latitude || !loc?.longitude) {
      skipped++;
      continue;
    }

    try {
      const rank = await findKeywordLocalRank({
        keyword: kw.keyword,
        lat: loc.latitude,
        lng: loc.longitude,
        placeId: loc.googleProfiles[0]?.placeId,
        businessName: loc.name,
      });

      await db.keywordRanking.create({
        data: {
          keywordId: kw.id,
          locationId: loc.id,
          lat: loc.latitude,
          lng: loc.longitude,
          rank,
          searchDate: now,
          checkedAt: now,
        },
      });

      checked++;
      if (rank > 0) ranked++;
    } catch (e: unknown) {
      const msg = formatPlacesApiError(e instanceof Error ? e.message : "rank check failed");
      if (isPlacesConfigError(msg) && errors.length === 0) {
        errors.push(msg);
        break;
      }
      if (errors.length < 3) errors.push(`${kw.keyword}: ${msg}`);
      skipped++;
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  return { checked, ranked, skipped, errors };
}
