import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, fail, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { buildLocationIdFilter, parseLocationIdsParam } from "@/lib/location-filter";
import { isBootstrapCompetitor } from "@/lib/places-competitors";

export const dynamic = "force-dynamic";

function roundRating(value: number | null): number | null {
  if (value == null) return null;
  return Math.round(value * 10) / 10;
}

function mapCompetitor(c: {
  id: string;
  businessName: string;
  category: string | null;
  address: string | null;
  location?: { name: string; city: string } | null;
  isActive: boolean;
  rating: number | null;
  reviewCount: number | null;
  photoCount: number | null;
  serviceCount: number | null;
  productCount: number | null;
  qnaCount: number | null;
  categoryCount: number | null;
  distance: number | null;
  phone: string | null;
  website: string | null;
  googlePlaceId?: string | null;
  rankings: { keyword: { keyword: string }; ranking: number; checkedAt: Date }[];
}) {
  return {
    id: c.id,
    businessName: c.businessName,
    category: c.category,
    address: c.address,
    locationName: c.location?.name ?? "",
    locationCity: c.location?.city ?? "",
    isActive: c.isActive,
    rating: roundRating(c.rating),
    reviewCount: c.reviewCount,
    photoCount: c.photoCount,
    serviceCount: c.serviceCount,
    productCount: c.productCount,
    qnaCount: c.qnaCount,
    categoryCount: c.categoryCount,
    distance: c.distance,
    phone: c.phone,
    website: c.website,
    googlePlaceId: c.googlePlaceId ?? null,
    isBootstrap: isBootstrapCompetitor(c.googlePlaceId),
    rankings: c.rankings.map((r) => ({
      keyword: r.keyword.keyword,
      ranking: r.ranking,
      checkedAt: r.checkedAt.toISOString(),
    })),
    avgRank: c.rankings.length
      ? Math.round((c.rankings.reduce((a, r) => a + r.ranking, 0) / c.rankings.length) * 10) / 10
      : null,
  };
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "seo.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || undefined;
  const locationIds = parseLocationIdsParam(url.searchParams.get("locationIds"));
  const withYou = url.searchParams.get("withYou") === "1";
  const where: Record<string, unknown> = {
    ...buildLocationIdFilter(user, { locationId, locationIds }),
  };

  const competitors = await db.competitor.findMany({
    where,
    include: {
      rankings: {
        include: { keyword: { select: { keyword: true } } },
        orderBy: { checkedAt: "desc" },
        take: 8,
      },
      location: { select: { name: true, city: true } },
    },
    orderBy: [{ distance: "asc" }, { businessName: "asc" }],
  });

  const mapped = competitors.map(mapCompetitor);

  if (!withYou || !locationId) {
    return ok(mapped);
  }

  const location = await db.location.findUnique({
    where: { id: locationId },
    include: {
      categories: { select: { categoryName: true, isPrimary: true } },
      _count: { select: { photos: true, services: true, products: true } },
      hours: { take: 1, select: { id: true } },
    },
  });

  if (!location) return ok({ you: null, competitors: mapped });

  const primary =
    location.categories.find((c) => c.isPrimary)?.categoryName ||
    location.categories[0]?.categoryName ||
    null;

  const you = {
    id: `you_${location.id}`,
    businessName: location.name,
    category: primary,
    address: location.address,
    locationName: location.name,
    locationCity: location.city,
    isActive: true,
    isYou: true as const,
    rating: roundRating(location.avgRating) || null,
    reviewCount: location.reviewCount || null,
    photoCount: location._count.photos,
    serviceCount: location._count.services,
    productCount: location._count.products,
    qnaCount: 0,
    categoryCount: location.categories.length || 1,
    distance: 0,
    phone: location.phone,
    website: location.website,
    googlePlaceId: null,
    rankings: [] as { keyword: string; ranking: number; checkedAt: string }[],
    avgRank: null as number | null,
    hours: location.hours.length > 0,
    description: true,
  };

  const trackedKeywords = await db.keyword.findMany({
    where: { locationId, status: "active" },
    select: { keyword: true },
    orderBy: { keyword: "asc" },
  });

  return ok({
    you,
    competitors: mapped,
    trackedKeywords: trackedKeywords.map((k) => k.keyword),
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "seo.manage")) return forbidden();

  try {
    const body = await req.json();
    const {
      locationId,
      businessName,
      category,
      address,
      rating,
      reviewCount,
      distance,
      googlePlaceId,
      phone,
      website,
      latitude,
      longitude,
      photoCount,
      serviceCount,
    } = body;
    if (!locationId || !businessName) return fail("locationId and businessName are required");

    const scoped = scopeLocationIds(user);
    if (scoped && !scoped.includes(locationId)) return forbidden();

    const location = await db.location.findUnique({ where: { id: locationId }, select: { id: true } });
    if (!location) return fail("Location not found", 404);

    if (googlePlaceId) {
      const dup = await db.competitor.findFirst({ where: { locationId, googlePlaceId } });
      if (dup) return fail("Competitor with this Google Place ID already exists");
    }

    const competitor = await db.competitor.create({
      data: {
        locationId,
        businessName: String(businessName).trim(),
        googlePlaceId: googlePlaceId || null,
        category: category || null,
        address: address || null,
        rating: rating != null && rating !== "" ? parseFloat(rating) : null,
        reviewCount: reviewCount != null && reviewCount !== "" ? parseInt(reviewCount, 10) : null,
        distance: distance != null && distance !== "" ? parseFloat(distance) : null,
        phone: phone || null,
        website: website || null,
        latitude: latitude != null && latitude !== "" ? parseFloat(latitude) : null,
        longitude: longitude != null && longitude !== "" ? parseFloat(longitude) : null,
        photoCount: photoCount != null && photoCount !== "" ? parseInt(photoCount, 10) : null,
        serviceCount: serviceCount != null && serviceCount !== "" ? parseInt(serviceCount, 10) : null,
      },
    });

    await logAudit({
      userId: user.id,
      userName: user.name,
      action: "competitors.create",
      entity: "Competitor",
      entityId: competitor.id,
      newValue: { businessName: competitor.businessName, locationId },
    });

    return ok(competitor);
  } catch (e: any) {
    return fail(e.message || "Failed to create competitor");
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "seo.manage")) return forbidden();

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return fail("id is required");

  try {
    const existing = await db.competitor.findUnique({ where: { id }, select: { id: true, locationId: true } });
    if (!existing) return fail("Competitor not found", 404);

    const scoped = scopeLocationIds(user);
    if (scoped && !scoped.includes(existing.locationId)) return forbidden();

    await db.competitor.delete({ where: { id } });

    await logAudit({
      userId: user.id,
      userName: user.name,
      action: "competitors.delete",
      entity: "Competitor",
      entityId: id,
    });

    return ok({ deleted: true });
  } catch (e: any) {
    return fail(e.message || "Failed to delete competitor");
  }
}
