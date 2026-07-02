import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/dashboard/executive — executive dashboard with all KPIs (doc 11 §4)
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "dashboard.view")) return forbidden();

  const scoped = scopeLocationIds(user);
  const where: any = {};
  if (scoped) where.id = { in: scoped };

  const [locations, reviews, posts, analyticsAgg] = await Promise.all([
    db.location.findMany({ where, select: { id: true, status: true, syncStatus: true, avgRating: true, reviewCount: true, healthScore: true, visibilityScore: true, name: true, city: true } }),
    db.review.findMany({ where: { locationId: scoped ? { in: scoped } : undefined }, select: { rating: true, replyStatus: true, createdAt: true, sentiment: true } }),
    db.post.findMany({ where: { locationId: scoped ? { in: scoped } : undefined }, select: { status: true, source: true, publishedAt: true, createdAt: true } }),
    db.analyticDaily.aggregate({
      where: { locationId: scoped ? { in: scoped } : undefined, date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      _sum: { searchViews: true, mapsViews: true, websiteClicks: true, phoneCalls: true, directionRequests: true },
    }),
  ]);

  const totalLocations = locations.length;
  const activeLocations = locations.filter(l => l.status === "active").length;
  const totalReviews = reviews.length;
  const reviewsThisMonth = reviews.filter(r => r.createdAt >= new Date(new Date().getFullYear(), new Date().getMonth(), 1)).length;
  const avgRating = totalReviews > 0 ? Math.round((reviews.reduce((a, r) => a + r.rating, 0) / totalReviews) * 100) / 100 : 0;
  const pendingReviews = reviews.filter(r => r.replyStatus === "pending" && r.rating <= 3).length;
  const repliedReviews = reviews.filter(r => r.replyStatus === "replied").length;
  const responseRate = totalReviews > 0 ? Math.round((repliedReviews / totalReviews) * 100) : 0;
  const negativeReviews = reviews.filter(r => r.rating <= 2).length;
  const positiveReviews = reviews.filter(r => r.rating >= 4).length;

  const publishedPosts = posts.filter(p => p.status === "published").length;
  const scheduledPosts = posts.filter(p => p.status === "scheduled").length;
  const draftPosts = posts.filter(p => p.status === "draft").length;
  const aiGeneratedPosts = posts.filter(p => p.source === "ai").length;

  const avgHealthScore = locations.length ? Math.round(locations.reduce((a, l) => a + l.healthScore, 0) / locations.length) : 0;
  const avgSeoScore = locations.length ? Math.round(locations.reduce((a, l) => a + l.visibilityScore, 0) / locations.length) : 0;

  // Top performing locations (by search views)
  const locationPerformance = await Promise.all(locations.slice(0, 15).map(async (loc) => {
    const locAnalytics = await db.analyticDaily.aggregate({
      where: { locationId: loc.id, date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      _sum: { searchViews: true, websiteClicks: true, phoneCalls: true },
    });
    const locReviews = reviews.filter(r => r.locationId === loc.id || true); // simplified
    return {
      id: loc.id, name: loc.name, city: loc.city,
      searchViews: locAnalytics._sum.searchViews ?? 0,
      websiteClicks: locAnalytics._sum.websiteClicks ?? 0,
      phoneCalls: locAnalytics._sum.phoneCalls ?? 0,
      avgRating: loc.avgRating, reviewCount: loc.reviewCount,
      healthScore: loc.healthScore, visibilityScore: loc.visibilityScore,
      status: loc.status, syncStatus: loc.syncStatus,
    };
  }));

  const topPerforming = [...locationPerformance].sort((a, b) => b.searchViews - a.searchViews).slice(0, 5);
  const needsAttention = [...locationPerformance].filter(l => l.healthScore < 60 || l.syncStatus === "error").slice(0, 5);

  // Rating distribution
  const ratingDistribution = [1, 2, 3, 4, 5].map(rating => ({
    rating,
    count: reviews.filter(r => r.rating === rating).length,
  }));

  return ok({
    kpis: {
      totalLocations, activeLocations, totalReviews, reviewsThisMonth, avgRating,
      pendingReviews, responseRate, negativeReviews, positiveReviews,
      searchViews: analyticsAgg._sum.searchViews ?? 0,
      mapsViews: analyticsAgg._sum.mapsViews ?? 0,
      websiteClicks: analyticsAgg._sum.websiteClicks ?? 0,
      phoneCalls: analyticsAgg._sum.phoneCalls ?? 0,
      directionRequests: analyticsAgg._sum.directionRequests ?? 0,
      publishedPosts, scheduledPosts, draftPosts, aiGeneratedPosts,
      avgHealthScore, avgSeoScore,
      syncErrors: locations.filter(l => l.syncStatus === "error").length,
    },
    ratingDistribution,
    topPerforming,
    needsAttention,
    allLocations: locationPerformance.sort((a, b) => a.city.localeCompare(b.city)),
  });
}
