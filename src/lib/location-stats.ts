import { db } from "./db";

export interface LocationStats {
  photoCount: number;
  serviceCount: number;
  categoryCount: number;
  productCount: number;
  attributeCount: number;
  repliedReviewCount: number;
  recentPostsCount: number;
  totalPublishedPosts: number;
  /** Any analytics rows stored for this location */
  analyticsSynced: boolean;
  /** Days with analytics in the last 30 days */
  analyticsDaysInRange: number;
  lastAnalyticsDate: string | null;
}

export async function fetchLocationStats(
  locationId: string,
  counts?: {
    photoCount: number;
    serviceCount: number;
    categoryCount: number;
    productCount: number;
    attributeCount: number;
  },
): Promise<LocationStats> {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    repliedReviewCount,
    recentPostsCount,
    totalPublishedPosts,
    analyticsDaysInRange,
    totalAnalyticsDays,
    lastAnalytics,
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
    db.analyticDaily.count({
      where: { locationId, date: { gte: since30d } },
    }),
    db.analyticDaily.count({ where: { locationId } }),
    db.analyticDaily.findFirst({
      where: { locationId },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
  ]);

  return {
    photoCount: counts?.photoCount ?? 0,
    serviceCount: counts?.serviceCount ?? 0,
    categoryCount: counts?.categoryCount ?? 0,
    productCount: counts?.productCount ?? 0,
    attributeCount: counts?.attributeCount ?? 0,
    repliedReviewCount,
    recentPostsCount,
    totalPublishedPosts,
    analyticsSynced: totalAnalyticsDays > 0,
    analyticsDaysInRange,
    lastAnalyticsDate: lastAnalytics?.date.toISOString() ?? null,
  };
}
