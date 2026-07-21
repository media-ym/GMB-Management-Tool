import { db } from "./db";

export interface LocationScoreInput {
  avgRating: number;
  reviewCount: number;
  repliedReviewCount: number;
  completenessScore: number;
  photoCount: number;
  hoursCount: number;
  serviceCount: number;
  recentPostsCount: number;
  totalPublishedPosts: number;
  isVerified: boolean;
  avgKeywordRank: number | null;
  searchViews30d: number;
  mapsViews30d: number;
}

export interface LocationScoreResult {
  healthScore: number;
  visibilityScore: number;
  healthBreakdown: {
    googleRating: number;
    reviewResponseRate: number;
    profileCompleteness: number;
    photos: number;
    businessHoursAccuracy: number;
    servicesAdded: number;
    recentPosts: number;
    seoScore: number;
  };
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function weighted(parts: [number, number][]): number {
  const totalWeight = parts.reduce((s, [, w]) => s + w, 0);
  if (totalWeight === 0) return 0;
  return parts.reduce((s, [value, weight]) => s + value * weight, 0) / totalWeight;
}

/** Pure score calculation — doc 07 §13 health + doc 10 §14 visibility */
export function computeLocationScores(input: LocationScoreInput): LocationScoreResult {
  const googleRating = clamp((input.avgRating / 5) * 100);
  const reviewResponseRate = input.reviewCount > 0
    ? clamp((input.repliedReviewCount / input.reviewCount) * 100)
    : 0;
  const profileCompleteness = clamp(input.completenessScore);
  const photos = clamp(Math.min(100, input.photoCount * 8));
  const businessHoursAccuracy = input.hoursCount >= 7
    ? 100
    : clamp((input.hoursCount / 7) * 100);
  const servicesAdded = clamp(Math.min(100, input.serviceCount * 8));
  const postingActivity = clamp(Math.max(
    Math.min(100, input.recentPostsCount * 20),
    Math.min(70, input.totalPublishedPosts * 2),
  ));
  const reviewVolume = clamp(Math.min(100, (input.reviewCount / 40) * 100));
  const analyticsViews = input.searchViews30d + input.mapsViews30d;
  const analyticsScore = clamp(Math.min(100, analyticsViews / 2.5));
  const verificationScore = input.isVerified ? 100 : 50;

  const keywordScore = input.avgKeywordRank != null
    ? clamp(100 - (input.avgKeywordRank - 1) * 4.5)
    : null;

  const visibilityBase: [number, number][] = [
    [profileCompleteness, 0.20],
    [googleRating, 0.16],
    [reviewResponseRate, 0.14],
    [reviewVolume, 0.14],
    [postingActivity, 0.12],
    [photos, 0.08],
    [servicesAdded, 0.06],
    [analyticsScore, 0.05],
    [verificationScore, 0.05],
  ];
  if (keywordScore != null) {
    visibilityBase.push([keywordScore, 0.12]);
  }

  const visibilityScore = clamp(weighted(visibilityBase));

  const healthBreakdown = {
    googleRating,
    reviewResponseRate,
    profileCompleteness,
    photos,
    businessHoursAccuracy,
    servicesAdded,
    recentPosts: postingActivity,
    seoScore: visibilityScore,
  };

  const healthScore = clamp(avg([
    googleRating,
    reviewResponseRate,
    profileCompleteness,
    photos,
    businessHoursAccuracy,
    servicesAdded,
    postingActivity,
    visibilityScore,
  ]));

  return { healthScore, visibilityScore, healthBreakdown };
}

export function buildCompletenessScore(checks: {
  businessName: boolean;
  phone: boolean;
  website: boolean;
  description: boolean;
  categories: boolean;
  services: boolean;
  photos: boolean;
  businessHours: boolean;
  attributes: boolean;
  verified: boolean;
}): number {
  const values = Object.values(checks);
  return Math.round((values.filter(Boolean).length / values.length) * 100);
}

/** Load live DB data, compute scores, persist to Location (+ optional SeoAudit snapshot) */
export async function refreshLocationScores(
  locationId: string,
  opts?: { writeAudit?: boolean },
): Promise<LocationScoreResult> {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const location = await db.location.findUnique({
    where: { id: locationId },
    include: {
      googleProfiles: { include: { businessInfo: true } },
      categories: true,
      services: true,
      attributes: true,
      hours: true,
      photos: { where: { status: "active" } },
    },
  });
  if (!location) throw new Error("Location not found");

  const gbp = location.googleProfiles[0];
  const completenessScore = buildCompletenessScore({
    businessName: !!location.name,
    phone: !!location.phone,
    website: !!location.website,
    description: !!gbp?.businessInfo?.description,
    categories: location.categories.length > 0,
    services: location.services.length > 0,
    photos: location.photos.length > 0,
    businessHours: location.hours.length > 0,
    attributes: location.attributes.length > 0,
    verified: gbp?.verificationState === "verified",
  });

  const [
    repliedReviewCount,
    recentPostsCount,
    totalPublishedPosts,
    analyticsAgg,
    rankRows,
  ] = await Promise.all([
    db.review.count({ where: { locationId, replyStatus: "replied" } }),
    db.post.count({
      where: {
        locationId,
        status: "published",
        OR: [
          { publishedAt: { gte: since30d } },
          { publishedAt: null, createdAt: { gte: since30d } },
        ],
      },
    }),
    db.post.count({ where: { locationId, status: "published" } }),
    db.analyticDaily.aggregate({
      where: { locationId, date: { gte: since30d } },
      _sum: { searchViews: true, mapsViews: true },
    }),
    db.keywordRanking.findMany({
      where: { locationId },
      orderBy: { checkedAt: "desc" },
      distinct: ["keywordId"],
      select: { rank: true },
      take: 20,
    }),
  ]);

  const ranks = rankRows.map((r) => r.rank).filter((r): r is number => r != null);
  const avgKeywordRank = ranks.length > 0
    ? ranks.reduce((a, b) => a + b, 0) / ranks.length
    : null;

  const scores = computeLocationScores({
    avgRating: location.avgRating,
    reviewCount: location.reviewCount,
    repliedReviewCount,
    completenessScore,
    photoCount: location.photos.length,
    hoursCount: location.hours.length,
    serviceCount: location.services.length,
    recentPostsCount,
    totalPublishedPosts,
    isVerified: gbp?.verificationState === "verified",
    avgKeywordRank,
    searchViews30d: analyticsAgg._sum.searchViews ?? 0,
    mapsViews30d: analyticsAgg._sum.mapsViews ?? 0,
  });

  await db.location.update({
    where: { id: locationId },
    data: {
      healthScore: scores.healthScore,
      visibilityScore: scores.visibilityScore,
    },
  });

  const missingPhotos = Math.max(0, 10 - location.photos.length);
  const missingServices = Math.max(0, 5 - location.services.length);
  const recommendations: string[] = [];
  if (scores.healthBreakdown.reviewResponseRate < 80) {
    recommendations.push("Reply to pending reviews to improve response rate.");
  }
  if (scores.healthBreakdown.photos < 50) {
    recommendations.push("Upload more workshop and service photos.");
  }
  if (scores.healthBreakdown.recentPosts < 40) {
    recommendations.push("Publish Google Posts at least twice per month.");
  }
  if (!gbp?.businessInfo?.description) {
    recommendations.push("Add a complete business description.");
  }

  if (opts?.writeAudit) {
    await db.seoAudit.create({
      data: {
        locationId,
        auditScore: scores.healthScore,
        profileStrength: scores.visibilityScore,
        missingPhotos,
        missingServices,
        missingCategoriesJson: JSON.stringify([]),
        recommendationsJson: JSON.stringify(recommendations.slice(0, 5)),
      },
    });
  }

  return scores;
}

export async function refreshAllLocationScores(
  locationIds?: string[],
  opts?: { writeAudit?: boolean },
): Promise<void> {
  const where = locationIds?.length ? { id: { in: locationIds } } : {};
  const locations = await db.location.findMany({ where, select: { id: true } });
  for (const loc of locations) {
    await refreshLocationScores(loc.id, opts);
  }
}
