import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, fail, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { syncLocationFull, isGoogleOAuthConnected } from "@/lib/google-service";
import { parseDateRangeFromSearchParams } from "@/lib/location-filter";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "dashboard.view")) return forbidden();

  const url = new URL(req.url);
  const filterLocationIds = url.searchParams.get("locationIds")?.split(",").filter(Boolean) || null;
  const dateRange = parseDateRangeFromSearchParams(url.searchParams) ?? {
    gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  };

  const scoped = scopeLocationIds(user);
  let effectiveIds: string[] | null = scoped ?? null;
  if (filterLocationIds) {
    effectiveIds = scoped ? filterLocationIds.filter((id) => scoped.includes(id)) : filterLocationIds;
  }
  const where = effectiveIds ? { id: { in: effectiveIds } } : {};
  const locWhere = effectiveIds ? { in: effectiveIds } : undefined;

  const [locations, reviews, pendingReviews, posts, analyticsAgg] = await Promise.all([
    db.location.findMany({ where, select: { id: true, name: true, city: true, status: true, syncStatus: true, avgRating: true, reviewCount: true, healthScore: true, visibilityScore: true } }),
    db.review.count({ where: { locationId: locWhere } }),
    db.review.count({ where: { locationId: locWhere, replyStatus: "pending", rating: { lte: 3 } } }),
    db.post.findMany({ where: { locationId: locWhere }, select: { status: true } }),
    db.analyticDaily.aggregate({
      where: { locationId: locWhere, date: dateRange },
      _sum: {
        searchViews: true,
        mapsViews: true,
        searchDesktop: true,
        searchMobile: true,
        mapsDesktop: true,
        mapsMobile: true,
        websiteClicks: true,
        phoneCalls: true,
        directionRequests: true,
        conversations: true,
        bookings: true,
      },
    }),
  ]);

  const avgRating = locations.length
    ? locations.reduce((a, l) => a + l.avgRating * l.reviewCount, 0) /
      Math.max(1, locations.reduce((a, l) => a + l.reviewCount, 0))
    : 0;
  const avgHealth = locations.length ? Math.round(locations.reduce((a, l) => a + l.healthScore, 0) / locations.length) : 0;
  const avgVisibility = locations.length ? Math.round(locations.reduce((a, l) => a + l.visibilityScore, 0) / locations.length) : 0;

  const googleConnected = await isGoogleOAuthConnected();
  const sum = analyticsAgg._sum;
  const totalWebsiteClicks = sum.websiteClicks ?? 0;
  const totalPhoneCalls = sum.phoneCalls ?? 0;
  const totalDirectionRequests = sum.directionRequests ?? 0;
  const totalConversations = sum.conversations ?? 0;
  const totalBookings = sum.bookings ?? 0;

  return ok({
    googleConnected,
    totalLocations: locations.length,
    activeLocations: locations.filter((l) => l.status === "active").length,
    syncErrors: googleConnected ? locations.filter((l) => l.syncStatus === "error").length : 0,
    totalReviews: googleConnected ? reviews : 0,
    pendingReviews: googleConnected ? pendingReviews : 0,
    avgRating: googleConnected ? Math.round(avgRating * 100) / 100 : 0,
    avgHealthScore: googleConnected ? avgHealth : 0,
    avgVisibilityScore: googleConnected ? avgVisibility : 0,
    totalSearchViews: googleConnected ? (sum.searchViews ?? 0) : 0,
    totalMapsViews: googleConnected ? (sum.mapsViews ?? 0) : 0,
    totalSearchDesktop: googleConnected ? (sum.searchDesktop ?? 0) : 0,
    totalSearchMobile: googleConnected ? (sum.searchMobile ?? 0) : 0,
    totalMapsDesktop: googleConnected ? (sum.mapsDesktop ?? 0) : 0,
    totalMapsMobile: googleConnected ? (sum.mapsMobile ?? 0) : 0,
    totalWebsiteClicks: googleConnected ? totalWebsiteClicks : 0,
    totalPhoneCalls: googleConnected ? totalPhoneCalls : 0,
    totalDirectionRequests: googleConnected ? totalDirectionRequests : 0,
    totalConversations: googleConnected ? totalConversations : 0,
    totalBookings: googleConnected ? totalBookings : 0,
    totalInteractions: googleConnected
      ? totalWebsiteClicks + totalPhoneCalls + totalDirectionRequests + totalConversations + totalBookings
      : 0,
    publishedPosts: googleConnected ? posts.filter((p) => p.status === "published").length : 0,
    scheduledPosts: googleConnected ? posts.filter((p) => p.status === "scheduled").length : 0,
    draftPosts: googleConnected ? posts.filter((p) => p.status === "draft").length : 0,
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "system.sync")) return forbidden("Your role cannot trigger sync.");

  if (!(await isGoogleOAuthConnected())) {
    return fail("Google account not connected. Connect from Google Integration first.", 401);
  }

  const body = await req.json().catch(() => ({}));
  const locationIds = scopeLocationIds(user, body.locationId);
  const where = locationIds ? { id: { in: locationIds } } : {};

  // Fetch all in-scope locations with their Google Business Profiles
  const locations = await db.location.findMany({
    where,
    select: { id: true, name: true, googleProfiles: { select: { googleLocationId: true } } },
  });

  const errors: string[] = [];
  const syncResults: Record<string, any> = {};
  const BATCH = 4;

  const linked = locations.filter((loc) => loc.googleProfiles?.[0]);
  const unlinked = locations.filter((loc) => !loc.googleProfiles?.[0]);

  if (unlinked.length) {
    await db.location.updateMany({
      where: { id: { in: unlinked.map((l) => l.id) } },
      data: { syncStatus: "synced", lastSyncedAt: new Date() },
    });
  }

  for (let i = 0; i < linked.length; i += BATCH) {
    const batch = linked.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (loc) => {
        const result = await syncLocationFull(loc.id);
        syncResults[loc.name] = result.synced;
        if (result.errors.length > 0) errors.push(`${loc.name}: ${result.errors.join(", ")}`);
      }),
    );
  }

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "sync.run",
    entity: "location",
    newValue: { locationIds: locationIds ?? "all", locationsSynced: locations.length, syncResults, errors: errors.length },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok({ synced: true, locations: locations.length, syncResults, errors }, `Full sync complete for ${locations.length} location(s)`);
}
