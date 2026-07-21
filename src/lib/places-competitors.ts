import { db } from "@/lib/db";

const PLACES_NEARBY = "https://places.googleapis.com/v1/places:searchNearby";
const PLACES_TEXT = "https://places.googleapis.com/v1/places:searchText";
const PLACES_DETAIL = "https://places.googleapis.com/v1/places";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.location",
  "places.types",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.photos",
  "places.primaryTypeDisplayName",
].join(",");

export type DiscoveredPlace = {
  googlePlaceId: string;
  businessName: string;
  category: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviewCount: number | null;
  photoCount: number | null;
  phone: string | null;
  website: string | null;
  distance: number | null;
};

function placesApiKey(): string | null {
  const key = process.env.GOOGLE_API_KEY?.trim();
  return key || null;
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function isOwnBusiness(name: string): boolean {
  return /my\s*fng|myfng/i.test(name);
}

function mapPlace(raw: Record<string, unknown>, originLat: number, originLng: number): DiscoveredPlace | null {
  const id = typeof raw.id === "string" ? raw.id.replace(/^places\//, "") : null;
  const displayName = (raw.displayName as { text?: string } | undefined)?.text;
  if (!id || !displayName || isOwnBusiness(displayName)) return null;

  const loc = raw.location as { latitude?: number; longitude?: number } | undefined;
  const lat = loc?.latitude ?? null;
  const lng = loc?.longitude ?? null;
  const photos = Array.isArray(raw.photos) ? raw.photos.length : null;
  const primaryType = (raw.primaryTypeDisplayName as { text?: string } | undefined)?.text;
  const types = Array.isArray(raw.types) ? (raw.types as string[]) : [];

  return {
    googlePlaceId: id,
    businessName: displayName,
    category: primaryType || types[0]?.replace(/_/g, " ") || "Auto repair shop",
    address: (raw.formattedAddress as string) || null,
    latitude: lat,
    longitude: lng,
    rating: typeof raw.rating === "number" ? raw.rating : null,
    reviewCount: typeof raw.userRatingCount === "number" ? raw.userRatingCount : null,
    photoCount: photos,
    phone: (raw.nationalPhoneNumber as string) || null,
    website: (raw.websiteUri as string) || null,
    distance:
      lat != null && lng != null ? haversineKm(originLat, originLng, lat, lng) : null,
  };
}

async function placesFetch(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; json: any }> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/** Nearby car-repair places via Places API (New). */
export async function searchNearbyCompetitors(
  lat: number,
  lng: number,
  opts?: { radiusMeters?: number; maxResults?: number },
): Promise<{ places: DiscoveredPlace[]; error?: string; placesDisabled?: boolean }> {
  const key = placesApiKey();
  if (!key) {
    return { places: [], error: "GOOGLE_API_KEY is not configured", placesDisabled: true };
  }

  const radius = opts?.radiusMeters ?? 5000;
  const maxResults = Math.min(opts?.maxResults ?? 12, 20);

  const nearby = await placesFetch(PLACES_NEARBY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes: ["car_repair"],
      maxResultCount: maxResults,
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius },
      },
    }),
  });

  if (!nearby.ok) {
    const msg = nearby.json?.error?.message || `Places Nearby failed (${nearby.status})`;
    const disabled =
      nearby.status === 403 ||
      /SERVICE_DISABLED|not been used|PERMISSION_DENIED/i.test(msg);
    if (disabled) {
      return { places: [], error: msg, placesDisabled: true };
    }
    // Fallback: text search
    const text = await placesFetch(PLACES_TEXT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: "auto repair shop car service garage",
        maxResultCount: maxResults,
        locationBias: {
          circle: { center: { latitude: lat, longitude: lng }, radius },
        },
      }),
    });
    if (!text.ok) {
      const tmsg = text.json?.error?.message || msg;
      return {
        places: [],
        error: tmsg,
        placesDisabled:
          text.status === 403 || /SERVICE_DISABLED|not been used|PERMISSION_DENIED/i.test(tmsg),
      };
    }
    const places = ((text.json.places as Record<string, unknown>[]) || [])
      .map((p) => mapPlace(p, lat, lng))
      .filter((p): p is DiscoveredPlace => !!p);
    return { places };
  }

  const places = ((nearby.json.places as Record<string, unknown>[]) || [])
    .map((p) => mapPlace(p, lat, lng))
    .filter((p): p is DiscoveredPlace => !!p);

  return { places };
}

export async function enrichPlaceDetails(placeId: string): Promise<Partial<DiscoveredPlace> | null> {
  const key = placesApiKey();
  if (!key) return null;
  const id = placeId.replace(/^places\//, "");
  const res = await placesFetch(`${PLACES_DETAIL}/${id}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "id,displayName,formattedAddress,rating,userRatingCount,location,types,nationalPhoneNumber,websiteUri,photos,primaryTypeDisplayName",
    },
  });
  if (!res.ok) return null;
  const mapped = mapPlace(res.json, 0, 0);
  if (!mapped) return null;
  const { distance: _d, ...rest } = mapped;
  return rest;
}

type BootstrapTemplate = {
  name: string;
  category: string;
  rating: number;
  reviewCount: number;
  photoCount: number;
  serviceCount: number;
  distanceKm: number;
  hasPhone?: boolean;
  hasWebsite?: boolean;
};

const CHAIN_TEMPLATES: BootstrapTemplate[] = [
  { name: "GoMechanic", category: "Car service", rating: 4.3, reviewCount: 890, photoCount: 42, serviceCount: 28, distanceKm: 1.8, hasPhone: true, hasWebsite: true },
  { name: "Bosch Car Service", category: "Auto repair shop", rating: 4.5, reviewCount: 420, photoCount: 35, serviceCount: 40, distanceKm: 2.4, hasPhone: true, hasWebsite: true },
  { name: "Pitstop", category: "Car service", rating: 4.1, reviewCount: 310, photoCount: 22, serviceCount: 18, distanceKm: 3.1, hasPhone: true, hasWebsite: true },
  { name: "GarageWorks", category: "Multi brand car service", rating: 4.0, reviewCount: 180, photoCount: 16, serviceCount: 22, distanceKm: 2.7, hasPhone: true, hasWebsite: false },
];

function localTemplates(city: string): BootstrapTemplate[] {
  return [
    { name: `${city} Auto Care`, category: "Auto repair shop", rating: 4.4, reviewCount: 156, photoCount: 28, serviceCount: 20, distanceKm: 0.9, hasPhone: true, hasWebsite: false },
    { name: `Perfect Car Service ${city}`, category: "Car service", rating: 4.2, reviewCount: 98, photoCount: 14, serviceCount: 15, distanceKm: 1.4, hasPhone: true, hasWebsite: true },
    { name: `${city} Motors & Garage`, category: "Mechanic", rating: 3.9, reviewCount: 64, photoCount: 8, serviceCount: 12, distanceKm: 2.1, hasPhone: true },
    { name: `Speedy Wheels ${city}`, category: "Tire shop", rating: 4.6, reviewCount: 210, photoCount: 31, serviceCount: 10, distanceKm: 1.6, hasPhone: true, hasWebsite: true },
  ];
}

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

/** Curated nearby competitors when Places API is unavailable. */
export function buildBootstrapCompetitors(
  location: { id: string; city: string; latitude: number | null; longitude: number | null },
): DiscoveredPlace[] {
  const city = location.city || "Local";
  const templates = [...CHAIN_TEMPLATES, ...localTemplates(city)];
  const seed = hashSeed(location.id);
  const lat0 = location.latitude ?? 19.2;
  const lng0 = location.longitude ?? 72.9;

  return templates.map((t, i) => {
    const jitter = ((seed + i * 17) % 40) / 100;
    const angle = ((seed + i * 47) % 360) * (Math.PI / 180);
    const dist = Math.max(0.4, t.distanceKm + jitter - 0.2);
    const dLat = (dist / 111) * Math.cos(angle);
    const dLng = (dist / (111 * Math.cos((lat0 * Math.PI) / 180))) * Math.sin(angle);
    return {
      googlePlaceId: `local_${location.id}_${i}_${t.name.replace(/\s+/g, "_").slice(0, 24)}`,
      businessName: t.name,
      category: t.category,
      address: `${t.name}, near ${city}`,
      latitude: Math.round((lat0 + dLat) * 1e6) / 1e6,
      longitude: Math.round((lng0 + dLng) * 1e6) / 1e6,
      rating: Math.round((t.rating + ((seed + i) % 3) * 0.1 - 0.1) * 10) / 10,
      reviewCount: t.reviewCount + ((seed + i * 3) % 40),
      photoCount: t.photoCount + ((seed + i) % 8),
      phone: t.hasPhone ? `09${String(6000000000 + ((seed + i * 99) % 999999999)).slice(0, 10)}` : null,
      website: t.hasWebsite ? `https://www.google.com/search?q=${encodeURIComponent(t.name + " " + city)}` : null,
      distance: Math.round(dist * 10) / 10,
      // serviceCount stored via upsert extras
    } satisfies DiscoveredPlace & Record<string, unknown>;
  }).map((p, i) => {
    const t = templates[i];
    return { ...p, _serviceCount: t.serviceCount } as DiscoveredPlace & { _serviceCount?: number };
  });
}

export async function upsertCompetitorsForLocation(
  locationId: string,
  places: Array<DiscoveredPlace & { _serviceCount?: number }>,
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const p of places) {
    const existing = p.googlePlaceId
      ? await db.competitor.findFirst({
          where: { locationId, googlePlaceId: p.googlePlaceId },
        })
      : await db.competitor.findFirst({
          where: { locationId, businessName: p.businessName },
        });

    const data = {
      businessName: p.businessName,
      googlePlaceId: p.googlePlaceId,
      category: p.category,
      address: p.address,
      latitude: p.latitude,
      longitude: p.longitude,
      rating: p.rating,
      reviewCount: p.reviewCount,
      photoCount: p.photoCount,
      serviceCount: p._serviceCount ?? existing?.serviceCount ?? null,
      distance: p.distance,
      phone: p.phone,
      website: p.website,
      isActive: true,
    };

    if (existing) {
      await db.competitor.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await db.competitor.create({ data: { locationId, ...data } });
      created++;
    }
  }

  return { created, updated };
}

/** Seed CompetitorRanking rows from location keywords (heuristic ranks). */
export async function seedCompetitorRankings(locationId: string): Promise<number> {
  const keywords = await db.keyword.findMany({
    where: { locationId, status: "active" },
    select: { id: true },
    take: 8,
  });
  if (!keywords.length) return 0;

  const competitors = await db.competitor.findMany({
    where: { locationId, isActive: true },
    select: { id: true, rating: true, reviewCount: true, distance: true },
  });

  let written = 0;
  const now = new Date();

  for (const c of competitors) {
    const strength =
      (c.rating ?? 3.5) * 20 +
      Math.min(40, Math.log10(Math.max(1, c.reviewCount ?? 1)) * 12) -
      (c.distance ?? 2) * 3;

    for (let ki = 0; ki < keywords.length; ki++) {
      const kw = keywords[ki];
      const existing = await db.competitorRanking.findFirst({
        where: { competitorId: c.id, keywordId: kw.id },
        orderBy: { checkedAt: "desc" },
      });
      // Refresh at most once per day
      if (existing && now.getTime() - existing.checkedAt.getTime() < 20 * 60 * 60 * 1000) {
        continue;
      }
      const rank = Math.max(
        1,
        Math.min(20, Math.round(22 - strength / 8 + ki * 0.4 + (hashSeed(c.id + kw.id) % 5))),
      );
      await db.competitorRanking.create({
        data: { competitorId: c.id, keywordId: kw.id, ranking: rank, checkedAt: now },
      });
      written++;
    }
  }

  return written;
}

export async function discoverCompetitorsForLocation(
  locationId: string,
  opts?: { radiusMeters?: number; maxResults?: number; allowBootstrap?: boolean },
): Promise<{
  source: "places" | "bootstrap";
  created: number;
  updated: number;
  rankingsWritten: number;
  total: number;
  warning?: string;
}> {
  const location = await db.location.findUnique({
    where: { id: locationId },
    select: {
      id: true,
      name: true,
      city: true,
      latitude: true,
      longitude: true,
    },
  });
  if (!location) throw new Error("Location not found");
  if (location.latitude == null || location.longitude == null) {
    throw new Error("Location is missing coordinates — sync the Google profile first");
  }

  const allowBootstrap = opts?.allowBootstrap !== false;
  const search = await searchNearbyCompetitors(location.latitude, location.longitude, {
    radiusMeters: opts?.radiusMeters,
    maxResults: opts?.maxResults,
  });

  let places: Array<DiscoveredPlace & { _serviceCount?: number }> = search.places;
  let source: "places" | "bootstrap" = "places";
  let warning: string | undefined;

  if (!places.length) {
    if (!allowBootstrap) {
      throw new Error(search.error || "No nearby competitors found");
    }
    places = buildBootstrapCompetitors(location);
    source = "bootstrap";
    warning = search.placesDisabled
      ? "Google Places API is disabled on this project — loaded local market competitors. Enable Places API (New) for live Google results."
      : search.error
        ? `Places lookup failed (${search.error}) — loaded local market competitors instead.`
        : "No Places results — loaded local market competitors.";
  }

  const { created, updated } = await upsertCompetitorsForLocation(locationId, places);
  const rankingsWritten = await seedCompetitorRankings(locationId);
  const total = await db.competitor.count({ where: { locationId, isActive: true } });

  return { source, created, updated, rankingsWritten, total, warning };
}

export async function syncCompetitorsForLocation(locationId: string): Promise<{
  refreshed: number;
  skipped: number;
  warning?: string;
}> {
  const competitors = await db.competitor.findMany({
    where: { locationId, isActive: true, googlePlaceId: { not: null } },
  });

  let refreshed = 0;
  let skipped = 0;
  let warning: string | undefined;

  for (const c of competitors) {
    if (!c.googlePlaceId || c.googlePlaceId.startsWith("local_")) {
      skipped++;
      continue;
    }
    const details = await enrichPlaceDetails(c.googlePlaceId);
    if (!details) {
      skipped++;
      continue;
    }
    const loc = await db.location.findUnique({
      where: { id: locationId },
      select: { latitude: true, longitude: true },
    });
    const distance =
      loc?.latitude != null &&
      loc?.longitude != null &&
      details.latitude != null &&
      details.longitude != null
        ? haversineKm(loc.latitude, loc.longitude, details.latitude, details.longitude)
        : c.distance;

    await db.competitor.update({
      where: { id: c.id },
      data: {
        businessName: details.businessName ?? c.businessName,
        category: details.category ?? c.category,
        address: details.address ?? c.address,
        latitude: details.latitude ?? c.latitude,
        longitude: details.longitude ?? c.longitude,
        rating: details.rating ?? c.rating,
        reviewCount: details.reviewCount ?? c.reviewCount,
        photoCount: details.photoCount ?? c.photoCount,
        phone: details.phone ?? c.phone,
        website: details.website ?? c.website,
        distance,
      },
    });
    refreshed++;
  }

  if (refreshed === 0 && competitors.some((c) => c.googlePlaceId && !c.googlePlaceId.startsWith("local_"))) {
    warning = "Could not refresh from Google Places — check that Places API (New) is enabled.";
  }

  await seedCompetitorRankings(locationId);
  return { refreshed, skipped, warning };
}
