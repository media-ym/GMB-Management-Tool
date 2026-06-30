import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, fail, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "dashboard.view")) return forbidden();

  const locationIds = scopeLocationIds(user);
  const where = locationIds ? { id: { in: locationIds } } : {};

  const [locations, reviews, pendingReviews, posts, analyticsAgg] = await Promise.all([
    db.location.findMany({ where, select: { id: true, status: true, syncStatus: true, avgRating: true, reviewCount: true, healthScore: true, visibilityScore: true } }),
    db.review.count({ where: { locationId: locationIds ? { in: locationIds } : undefined } }),
    db.review.count({ where: { locationId: locationIds ? { in: locationIds } : undefined, replyStatus: "pending", rating: { lte: 3 } } }),
    db.post.findMany({ where: { locationId: locationIds ? { in: locationIds } : undefined }, select: { status: true } }),
    db.analyticDaily.aggregate({
      where: { locationId: locationIds ? { in: locationIds } : undefined, date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      _sum: { searchViews: true, mapsViews: true, websiteClicks: true, phoneCalls: true, directionRequests: true },
    }),
  ]);

  const avgRating = locations.length
    ? locations.reduce((a, l) => a + l.avgRating * l.reviewCount, 0) /
      Math.max(1, locations.reduce((a, l) => a + l.reviewCount, 0))
    : 0;
  const avgHealth = locations.length ? Math.round(locations.reduce((a, l) => a + l.healthScore, 0) / locations.length) : 0;
  const avgVisibility = locations.length ? Math.round(locations.reduce((a, l) => a + l.visibilityScore, 0) / locations.length) : 0;

  return ok({
    totalLocations: locations.length,
    activeLocations: locations.filter((l) => l.status === "active").length,
    syncErrors: locations.filter((l) => l.syncStatus === "error").length,
    totalReviews: reviews,
    pendingReviews,
    avgRating: Math.round(avgRating * 100) / 100,
    avgHealthScore: avgHealth,
    avgVisibilityScore: avgVisibility,
    totalSearchViews: analyticsAgg._sum.searchViews ?? 0,
    totalMapsViews: analyticsAgg._sum.mapsViews ?? 0,
    totalWebsiteClicks: analyticsAgg._sum.websiteClicks ?? 0,
    totalPhoneCalls: analyticsAgg._sum.phoneCalls ?? 0,
    totalDirectionRequests: analyticsAgg._sum.directionRequests ?? 0,
    publishedPosts: posts.filter((p) => p.status === "published").length,
    scheduledPosts: posts.filter((p) => p.status === "scheduled").length,
    draftPosts: posts.filter((p) => p.status === "draft").length,
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "system.sync")) return forbidden("Your role cannot trigger sync.");

  const body = await req.json().catch(() => ({}));
  const locationIds = scopeLocationIds(user, body.locationId);
  const where = locationIds ? { id: { in: locationIds } } : {};
  await db.location.updateMany({ where, data: { syncStatus: "synced", lastSyncedAt: new Date() } });

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "sync.run",
    entity: "location",
    newValue: { locationIds: locationIds ?? "all" },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok({ synced: true }, "Sync completed");
}
