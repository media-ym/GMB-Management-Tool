import { db } from "@/lib/db";
import { scopeLocationIds } from "@/lib/session";
import type { SessionUser } from "@/lib/types";

const TZ = "Asia/Kolkata";

/** Calendar date YYYY-MM-DD in IST */
function istDateKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Start of today in IST as a Date */
function startOfTodayIST(): Date {
  return new Date(`${istDateKey()}T00:00:00+05:30`);
}

function startOfDaysAgoIST(days: number): Date {
  const base = startOfTodayIST();
  base.setDate(base.getDate() - days);
  return base;
}

function startOfMonthIST(): Date {
  const key = istDateKey();
  const [y, m] = key.split("-").map(Number);
  return new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00+05:30`);
}

function startOfWeekIST(): Date {
  // Monday-start week in IST
  const today = startOfTodayIST();
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(today);
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const offset = map[weekday] ?? 0;
  const start = new Date(today);
  start.setDate(start.getDate() - offset);
  return start;
}

function nowISTLabel(): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function linearForecast(daily: number[], horizon = 7): { next7Total: number; dailyAvg: number; trend: "up" | "down" | "flat" } {
  if (!daily.length) return { next7Total: 0, dailyAvg: 0, trend: "flat" };
  const n = daily.length;
  const avg = daily.reduce((a, b) => a + b, 0) / n;
  const half = Math.floor(n / 2) || 1;
  const first = daily.slice(0, half);
  const second = daily.slice(half);
  const firstAvg = first.reduce((a, b) => a + b, 0) / first.length;
  const secondAvg = second.reduce((a, b) => a + b, 0) / (second.length || 1);
  const delta = secondAvg - firstAvg;
  const projectedDaily = Math.max(0, avg + delta * 0.5);
  const trend: "up" | "down" | "flat" =
    delta > 0.15 * Math.max(avg, 0.1) ? "up" : delta < -0.15 * Math.max(avg, 0.1) ? "down" : "flat";
  return {
    next7Total: Math.round(projectedDaily * horizon),
    dailyAvg: round1(projectedDaily),
    trend,
  };
}

function locScope(user: SessionUser): { locationId?: { in: string[] } } {
  const ids = scopeLocationIds(user);
  return ids ? { locationId: { in: ids } } : {};
}

function locationWhere(user: SessionUser) {
  const ids = scopeLocationIds(user);
  return ids ? { id: { in: ids } } : {};
}

/**
 * Build a live, ground-truth snapshot of the entire MyFNG workspace
 * for MiSA AI - A–Z module coverage from the database.
 */
export async function buildMisaDashboardContext(
  user: SessionUser,
  queryHint?: string,
): Promise<{ contextJson: string; meta: { generatedAt: string; locationCount: number } }> {
  const reviewScope = { ...locScope(user), syncStatus: { not: "deleted" as const } };
  const todayStart = startOfTodayIST();
  const weekStart = startOfWeekIST();
  const monthStart = startOfMonthIST();
  const last7Start = startOfDaysAgoIST(7);
  const last14Start = startOfDaysAgoIST(14);
  const last30Start = startOfDaysAgoIST(30);
  const last60Start = startOfDaysAgoIST(60);

  const hint = (queryHint || "").toLowerCase();

  const [
    locations,
    reviewsToday,
    reviewsWeek,
    reviewsMonth,
    reviewsLast7,
    reviewsLast30,
    reviewsPrev30,
    reviewsTotal,
    pendingReplies,
    negativePending,
    ratingAgg,
    postsByStatus,
    productsActive,
    productsTotal,
    mediaCount,
    photosCount,
    keywords,
    competitors,
    seoAudits,
    analytics30,
    analyticsPrev30,
    analyticsDaily14,
    reviewsSinceMonth,
    recentReviews,
    unreadAlerts,
    googleAccounts,
    clients,
    reportsRecent,
    directoriesCount,
  ] = await Promise.all([
    db.location.findMany({
      where: locationWhere(user),
      select: {
        id: true,
        name: true,
        city: true,
        status: true,
        syncStatus: true,
        avgRating: true,
        reviewCount: true,
        healthScore: true,
        visibilityScore: true,
        lastSyncedAt: true,
      },
      orderBy: { name: "asc" },
    }),
    db.review.count({ where: { ...reviewScope, createdAt: { gte: todayStart } } }),
    db.review.count({ where: { ...reviewScope, createdAt: { gte: weekStart } } }),
    db.review.count({ where: { ...reviewScope, createdAt: { gte: monthStart } } }),
    db.review.count({ where: { ...reviewScope, createdAt: { gte: last7Start } } }),
    db.review.count({ where: { ...reviewScope, createdAt: { gte: last30Start } } }),
    db.review.count({
      where: { ...reviewScope, createdAt: { gte: last60Start, lt: last30Start } },
    }),
    db.review.count({ where: reviewScope }),
    db.review.count({ where: { ...reviewScope, replyStatus: "pending" } }),
    db.review.count({ where: { ...reviewScope, replyStatus: "pending", rating: { lte: 3 } } }),
    db.review.aggregate({ where: reviewScope, _avg: { rating: true } }),
    db.post.groupBy({
      by: ["status"],
      where: locScope(user),
      _count: { _all: true },
    }),
    db.product.count({ where: { ...locScope(user), isActive: true } }),
    db.product.count({ where: locScope(user) }),
    db.mediaLibrary.count({ where: locScope(user) }),
    db.businessPhoto.count({ where: locScope(user) }),
    db.keyword.findMany({
      where: (() => {
        const ids = scopeLocationIds(user);
        if (!ids) return {};
        return { OR: [{ locationId: null }, { locationId: { in: ids } }] };
      })(),
      select: {
        id: true,
        keyword: true,
        city: true,
        rankings: {
          orderBy: { checkedAt: "desc" },
          take: 1,
          select: { rank: true, checkedAt: true, locationId: true },
        },
      },
      take: 40,
    }),
    db.competitor.findMany({
      where: { ...locScope(user), isActive: true },
      select: {
        businessName: true,
        rating: true,
        reviewCount: true,
        distance: true,
        location: { select: { name: true, city: true } },
      },
      orderBy: { reviewCount: "desc" },
      take: 20,
    }),
    db.seoAudit.findMany({
      where: locScope(user),
      orderBy: { auditedAt: "desc" },
      distinct: ["locationId"],
      select: {
        locationId: true,
        auditScore: true,
        profileStrength: true,
        missingPhotos: true,
        missingServices: true,
        auditedAt: true,
        location: { select: { name: true, city: true } },
      },
      take: 30,
    }),
    db.analyticDaily.aggregate({
      where: { ...locScope(user), date: { gte: last30Start } },
      _sum: {
        searchViews: true,
        mapsViews: true,
        websiteClicks: true,
        phoneCalls: true,
        directionRequests: true,
      },
    }),
    db.analyticDaily.aggregate({
      where: { ...locScope(user), date: { gte: last60Start, lt: last30Start } },
      _sum: {
        searchViews: true,
        mapsViews: true,
        websiteClicks: true,
        phoneCalls: true,
        directionRequests: true,
      },
    }),
    db.analyticDaily.findMany({
      where: { ...locScope(user), date: { gte: last14Start } },
      select: {
        date: true,
        searchViews: true,
        mapsViews: true,
        websiteClicks: true,
        phoneCalls: true,
        directionRequests: true,
      },
      orderBy: { date: "asc" },
    }),
    db.review.findMany({
      where: { ...reviewScope, createdAt: { gte: last14Start } },
      select: {
        createdAt: true,
        rating: true,
        locationId: true,
        location: { select: { id: true, name: true, city: true } },
      },
    }),
    db.review.findMany({
      where: reviewScope,
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        authorName: true,
        rating: true,
        text: true,
        replyStatus: true,
        sentiment: true,
        createdAt: true,
        location: { select: { name: true, city: true } },
      },
    }),
    db.notification.count({
      where: {
        read: false,
        OR: [{ userId: user.id }, { userId: null }],
      },
    }),
    db.googleAccount.count({ where: { status: "active" } }),
    db.client.findMany({
      select: { id: true, name: true, status: true },
      take: 30,
    }),
    db.report.findMany({
      orderBy: { generatedAt: "desc" },
      take: 8,
      select: { reportName: true, reportType: true, generatedAt: true },
    }),
    db.directoryPresence.count({ where: { status: "linked" } }),
  ]);

  // Also fetch today's reviews (may overlap with month window - used for rating breakdown)
  const todayReviews = reviewsSinceMonth.filter((r) => r.createdAt >= todayStart);

  const todayByLocation = new Map<string, { name: string; city: string; count: number; ratings: number[] }>();
  const todayByRating = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of todayReviews) {
    todayByRating[r.rating as 1 | 2 | 3 | 4 | 5]++;
    const key = r.location.id;
    const row = todayByLocation.get(key) ?? {
      name: r.location.name,
      city: r.location.city,
      count: 0,
      ratings: [],
    };
    row.count++;
    row.ratings.push(r.rating);
    todayByLocation.set(key, row);
  }

  // Per-location period counts from rolling 60-day window (covers prev30 + last30 + calendar month)
  const reviewsForLocCounts = await db.review.findMany({
    where: { ...reviewScope, createdAt: { gte: last60Start } },
    select: { createdAt: true, locationId: true, rating: true },
  });
  const todayMap: Record<string, number> = {};
  const weekMap: Record<string, number> = {};
  const monthMap: Record<string, number> = {};
  const last7Map: Record<string, number> = {};
  const last30Map: Record<string, number> = {};
  for (const l of locations) {
    todayMap[l.id] = 0;
    weekMap[l.id] = 0;
    monthMap[l.id] = 0;
    last7Map[l.id] = 0;
    last30Map[l.id] = 0;
  }
  const last30ByRating = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviewsForLocCounts) {
    if (r.createdAt >= monthStart) monthMap[r.locationId] = (monthMap[r.locationId] ?? 0) + 1;
    if (r.createdAt >= weekStart) weekMap[r.locationId] = (weekMap[r.locationId] ?? 0) + 1;
    if (r.createdAt >= todayStart) todayMap[r.locationId] = (todayMap[r.locationId] ?? 0) + 1;
    if (r.createdAt >= last7Start) last7Map[r.locationId] = (last7Map[r.locationId] ?? 0) + 1;
    if (r.createdAt >= last30Start) {
      last30Map[r.locationId] = (last30Map[r.locationId] ?? 0) + 1;
      last30ByRating[r.rating as 1 | 2 | 3 | 4 | 5]++;
    }
  }

  const reviewsDaily14 = reviewsSinceMonth;

  // Analytics by day for forecasting
  const dayKeys: string[] = [];
  for (let i = 13; i >= 0; i--) {
    dayKeys.push(istDateKey(new Date(Date.now() - i * 86400000)));
  }
  const analyticsByDay = new Map<string, { searchViews: number; phoneCalls: number; websiteClicks: number; mapsViews: number; directions: number }>();
  for (const k of dayKeys) {
    analyticsByDay.set(k, { searchViews: 0, phoneCalls: 0, websiteClicks: 0, mapsViews: 0, directions: 0 });
  }
  for (const row of analyticsDaily14) {
    const k = istDateKey(row.date);
    const bucket = analyticsByDay.get(k);
    if (!bucket) continue;
    bucket.searchViews += row.searchViews;
    bucket.phoneCalls += row.phoneCalls;
    bucket.websiteClicks += row.websiteClicks;
    bucket.mapsViews += row.mapsViews;
    bucket.directions += row.directionRequests;
  }

  const reviewsByDay = dayKeys.map((k) => {
    const start = new Date(`${k}T00:00:00+05:30`);
    const end = new Date(`${k}T23:59:59.999+05:30`);
    return reviewsDaily14.filter((r) => r.createdAt >= start && r.createdAt <= end).length;
  });
  const searchSeries = dayKeys.map((k) => analyticsByDay.get(k)!.searchViews);
  const callsSeries = dayKeys.map((k) => analyticsByDay.get(k)!.phoneCalls);

  const reviewForecast = linearForecast(reviewsByDay.slice(-14));
  const searchForecast = linearForecast(searchSeries);
  const callsForecast = linearForecast(callsSeries);

  const a30 = analytics30._sum;
  const aPrev = analyticsPrev30._sum;
  const pct = (cur: number, prev: number) => {
    if (!prev) return cur > 0 ? 100 : 0;
    return round1(((cur - prev) / prev) * 100);
  };

  const postStats = {
    draft: 0,
    scheduled: 0,
    published: 0,
    failed: 0,
  };
  for (const g of postsByStatus) {
    const s = g.status as keyof typeof postStats;
    if (s in postStats) postStats[s] = g._count._all;
  }

  const keywordOverview = keywords.map((k) => ({
    keyword: k.keyword,
    city: k.city,
    latestRank: k.rankings[0]?.rank ?? null,
    checkedAt: k.rankings[0]?.checkedAt?.toISOString() ?? null,
  }));
  const ranked = keywordOverview.filter((k) => k.latestRank && k.latestRank > 0);
  const avgRank = ranked.length
    ? round1(ranked.reduce((a, k) => a + (k.latestRank as number), 0) / ranked.length)
    : null;

  // Optional city/location focus from user query
  let focusedLocation: (typeof locations)[0] | null = null;
  if (hint) {
    focusedLocation =
      locations.find(
        (l) =>
          hint.includes(l.city.toLowerCase()) ||
          hint.includes(l.name.toLowerCase()) ||
          l.name.toLowerCase().split(/\s+/).some((w) => w.length > 3 && hint.includes(w)),
      ) ?? null;
  }

  let focusedExtras: Record<string, unknown> | null = null;
  if (focusedLocation) {
    const [fToday, fWeek, fMonth, fPending, fAnalytics] = await Promise.all([
      db.review.count({
        where: {
          locationId: focusedLocation.id,
          syncStatus: { not: "deleted" },
          createdAt: { gte: todayStart },
        },
      }),
      db.review.count({
        where: {
          locationId: focusedLocation.id,
          syncStatus: { not: "deleted" },
          createdAt: { gte: weekStart },
        },
      }),
      db.review.count({
        where: {
          locationId: focusedLocation.id,
          syncStatus: { not: "deleted" },
          createdAt: { gte: monthStart },
        },
      }),
      db.review.count({
        where: {
          locationId: focusedLocation.id,
          syncStatus: { not: "deleted" },
          replyStatus: "pending",
        },
      }),
      db.analyticDaily.aggregate({
        where: { locationId: focusedLocation.id, date: { gte: last30Start } },
        _sum: {
          searchViews: true,
          mapsViews: true,
          websiteClicks: true,
          phoneCalls: true,
          directionRequests: true,
        },
      }),
    ]);
    focusedExtras = {
      location: focusedLocation.name,
      city: focusedLocation.city,
      reviewsToday: fToday,
      reviewsThisWeek: fWeek,
      reviewsThisMonth: fMonth,
      reviewsLast7Days: last7Map[focusedLocation.id] ?? 0,
      reviewsLast30Days: last30Map[focusedLocation.id] ?? 0,
      pendingReplies: fPending,
      avgRating: focusedLocation.avgRating,
      healthScore: focusedLocation.healthScore,
      visibilityScore: focusedLocation.visibilityScore,
      analyticsLast30Days: fAnalytics._sum,
    };
  }

  const needsAttention = locations
    .filter((l) => l.healthScore < 60 || l.syncStatus === "error" || l.avgRating < 3.8)
    .map((l) => ({
      name: l.name,
      city: l.city,
      healthScore: l.healthScore,
      avgRating: l.avgRating,
      syncStatus: l.syncStatus,
      reason:
        l.syncStatus === "error"
          ? "sync error"
          : l.healthScore < 60
            ? "low health score"
            : "rating below 3.8",
    }))
    .slice(0, 10);

  const topLocations = [...locations]
    .sort((a, b) => b.visibilityScore - a.visibilityScore || b.avgRating - a.avgRating)
    .slice(0, 8)
    .map((l) => ({
      name: l.name,
      city: l.city,
      avgRating: l.avgRating,
      reviewCount: l.reviewCount,
      healthScore: l.healthScore,
      visibilityScore: l.visibilityScore,
      reviewsToday: todayMap[l.id] ?? 0,
      reviewsThisWeek: weekMap[l.id] ?? 0,
      reviewsThisMonth: monthMap[l.id] ?? 0,
    }));

  const snapshot = {
    meta: {
      agent: "MiSA AI - MyFNG Instant Service Assistant",
      timezone: TZ,
      generatedAtIST: nowISTLabel(),
      todayDateIST: istDateKey(),
      dataSource: "live MyFNG database (genuine platform data - not estimated unless marked forecast)",
      user: { name: user.name, role: user.role },
      modulesCovered: [
        "Dashboard",
        "Locations",
        "Reviews",
        "Analytics",
        "Content/Posts",
        "Products",
        "Media",
        "SEO/Keywords",
        "Competitors",
        "Directories",
        "Clients",
        "Reports",
        "Alerts",
        "Google Integration",
        "System health signals",
      ],
    },
    dashboard: {
      totalLocations: locations.length,
      activeLocations: locations.filter((l) => l.status === "active").length,
      syncErrors: locations.filter((l) => l.syncStatus === "error").length,
      avgHealthScore: locations.length
        ? Math.round(locations.reduce((a, l) => a + l.healthScore, 0) / locations.length)
        : 0,
      avgVisibilityScore: locations.length
        ? Math.round(locations.reduce((a, l) => a + l.visibilityScore, 0) / locations.length)
        : 0,
      googleAccountsConnected: googleAccounts,
      unreadAlerts,
    },
    reviews: {
      // Same All Time total as Reviews page KPI (synced, non-deleted)
      total: reviewsTotal,
      alignsWithReviewsPageAllTime: true,
      today: reviewsToday,
      thisWeek: reviewsWeek,
      thisMonthCalendar: reviewsMonth,
      last7Days: reviewsLast7,
      last30Days: reviewsLast30,
      previous30Days: reviewsPrev30,
      last30DaysChangePercent: (() => {
        if (!reviewsPrev30) return reviewsLast30 > 0 ? 100 : 0;
        return round1(((reviewsLast30 - reviewsPrev30) / reviewsPrev30) * 100);
      })(),
      pendingReplies,
      pendingNegativeOrNeutral: negativePending,
      avgRating: round1(ratingAgg._avg.rating ?? 0),
      todayByRating,
      last30DaysByRating: last30ByRating,
      todayByLocation: [...todayByLocation.values()].map((r) => ({
        name: r.name,
        city: r.city,
        count: r.count,
        avgRating: r.ratings.length ? round1(r.ratings.reduce((a, b) => a + b, 0) / r.ratings.length) : 0,
      })),
      last30DaysByLocation: locations
        .map((l) => ({
          name: l.name,
          city: l.city,
          count: last30Map[l.id] ?? 0,
        }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count),
      recentSample: recentReviews.map((r) => ({
        location: r.location.name,
        city: r.location.city,
        author: r.authorName,
        rating: r.rating,
        sentiment: r.sentiment,
        replyStatus: r.replyStatus,
        whenIST: new Intl.DateTimeFormat("en-IN", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }).format(r.createdAt),
        excerpt: (r.text || "").slice(0, 160),
      })),
      periodDefinitions: {
        today: "IST calendar day since 00:00 Asia/Kolkata",
        thisWeek: "IST week starting Monday 00:00",
        thisMonthCalendar: "IST calendar month from the 1st",
        last7Days: "rolling 7×24h window ending now (IST)",
        last30Days: "rolling 30×24h window ending now (IST) - use this for 'last 30 days' / 'past month' questions",
        previous30Days: "the 30 days before last30Days",
        total: "all non-deleted reviews in scope",
      },
    },
    analytics: {
      last30Days: {
        searchViews: a30.searchViews ?? 0,
        mapsViews: a30.mapsViews ?? 0,
        websiteClicks: a30.websiteClicks ?? 0,
        phoneCalls: a30.phoneCalls ?? 0,
        directionRequests: a30.directionRequests ?? 0,
      },
      previous30Days: {
        searchViews: aPrev.searchViews ?? 0,
        mapsViews: aPrev.mapsViews ?? 0,
        websiteClicks: aPrev.websiteClicks ?? 0,
        phoneCalls: aPrev.phoneCalls ?? 0,
        directionRequests: aPrev.directionRequests ?? 0,
      },
      momChangePercent: {
        searchViews: pct(a30.searchViews ?? 0, aPrev.searchViews ?? 0),
        mapsViews: pct(a30.mapsViews ?? 0, aPrev.mapsViews ?? 0),
        websiteClicks: pct(a30.websiteClicks ?? 0, aPrev.websiteClicks ?? 0),
        phoneCalls: pct(a30.phoneCalls ?? 0, aPrev.phoneCalls ?? 0),
        directionRequests: pct(a30.directionRequests ?? 0, aPrev.directionRequests ?? 0),
      },
      last7DaysTotals: {
        searchViews: searchSeries.slice(-7).reduce((a, b) => a + b, 0),
        phoneCalls: callsSeries.slice(-7).reduce((a, b) => a + b, 0),
        reviews: reviewsLast7,
      },
    },
    forecasts: {
      method: "linear trend from last 14 days of genuine platform data (projected, not guaranteed)",
      next7Days: {
        reviews: reviewForecast,
        searchViews: searchForecast,
        phoneCalls: callsForecast,
      },
    },
    content: {
      posts: postStats,
      products: { active: productsActive, total: productsTotal },
      mediaLibraryItems: mediaCount,
      businessPhotos: photosCount,
    },
    seo: {
      trackedKeywords: keywords.length,
      averageRank: avgRank,
      topKeywords: keywordOverview
        .filter((k) => k.latestRank && k.latestRank > 0)
        .sort((a, b) => (a.latestRank ?? 99) - (b.latestRank ?? 99))
        .slice(0, 12),
      recentAudits: seoAudits.map((a) => ({
        location: a.location.name,
        city: a.location.city,
        auditScore: a.auditScore,
        profileStrength: a.profileStrength,
        missingPhotos: a.missingPhotos,
        missingServices: a.missingServices,
      })),
    },
    competitors: competitors.map((c) => ({
      name: c.businessName,
      vsLocation: c.location.name,
      city: c.location.city,
      rating: c.rating,
      reviewCount: c.reviewCount,
      distanceKm: c.distance,
    })),
    locations: {
      all: locations.map((l) => ({
        name: l.name,
        city: l.city,
        status: l.status,
        syncStatus: l.syncStatus,
        avgRating: l.avgRating,
        reviewCount: l.reviewCount,
        healthScore: l.healthScore,
        visibilityScore: l.visibilityScore,
        reviewsToday: todayMap[l.id] ?? 0,
        reviewsThisWeek: weekMap[l.id] ?? 0,
        reviewsThisMonth: monthMap[l.id] ?? 0,
        reviewsLast7Days: last7Map[l.id] ?? 0,
        reviewsLast30Days: last30Map[l.id] ?? 0,
        lastSyncedAt: l.lastSyncedAt?.toISOString() ?? null,
      })),
      topPerforming: topLocations,
      needsAttention,
    },
    clients: clients.map((c) => ({ name: c.name, status: c.status })),
    reports: reportsRecent.map((r) => ({
      name: r.reportName,
      type: r.reportType,
      generatedAt: r.generatedAt.toISOString(),
    })),
    directories: { linkedPresences: directoriesCount },
    focusedLocationQuery: focusedExtras,
  };

  return {
    contextJson: JSON.stringify(snapshot, null, 2),
    meta: { generatedAt: snapshot.meta.generatedAtIST, locationCount: locations.length },
  };
}

export function buildMisaSystemPrompt(contextJson: string): string {
  return `You are MiSA AI - MyFNG Instant Service Assistant for MyFNG Autocare.

When asked who you are, introduce yourself as: "Main MiSA AI hoon - MyFNG Instant Service Assistant. Main MyFNG team ko live dashboard data, insights aur operational help deta/deti hoon."

You have LIVE access to the full MyFNG Local AI Manager workspace (A–Z): Dashboard, Locations, Reviews, Analytics, Content/Posts, Products, Media, SEO/Keywords, Competitors, Market Research signals, Directories, Clients, Reports, Alerts, Google integration, and System health.

CURRENT LIVE DATA (Asia/Kolkata). This JSON is the ONLY source of truth for numbers, counts, ratings, and forecasts:
\`\`\`json
${contextJson}
\`\`\`

LANGUAGE:
- Default: natural Hinglish (Hindi + English mix in Latin script), warm and clear - like a helpful MyFNG teammate.
- If the user writes fully in English, reply in English. If they write Hindi/Hinglish, reply in Hinglish.
- Never insert random scripts, mojibake, or garbled characters. Keep brand names clean: MyFNG, MiSA AI.

HARD RULES (non-negotiable):
1. For ANY factual question (counts, ratings, KPIs, "aaj kitne reviews", "last 30 days", city-wise, pending replies, posts, SEO ranks, competitors, etc.) answer ONLY using numbers from the LIVE DATA JSON above.
2. Never invent, guess, or round away from the provided figures. Only say a figure is missing if the key truly does not exist in the JSON.
3. Period mapping (critical):
   - "today" / "aaj" → reviews.today
   - "this week" → reviews.thisWeek
   - "this month" (calendar) → reviews.thisMonthCalendar
   - "last 7 days" / "past week" → reviews.last7Days
   - "last 30 days" / "past 30 days" / "last month" (rolling) → reviews.last30Days (+ reviews.last30DaysByLocation / last30DaysByRating)
   - "overall" / "all listings" / "total" → reviews.total
4. Always state the date/time reference from meta.todayDateIST / meta.generatedAtIST.
5. When the user names a city or location, use locations.all / focusedLocationQuery / last30DaysByLocation / todayByLocation.
6. Forecasts live under forecasts.next7Days - label as "projected / estimate last 14 days trend se".
7. When drafting review replies / posts / descriptions, produce ready-to-publish MyFNG brand text (English for Google-facing content unless user asks otherwise). Never invent prices, staff names, or fake URLs.
8. Be concise and operational. Lead with the answer number, then short breakdown.
9. reviews.total is the same All Time total shown on the Reviews page (all synced listings).
10. Out-of-scope questions: politely redirect in Hinglish/English.

FORMATTING (critical - UI renders markdown):
- Never use em-dash (—) or en-dash (–). Always use a normal hyphen (-), e.g. "MiSA AI - MyFNG Instant Service Assistant".
- Use clean GitHub-flavored markdown the UI can render: ## headings, bullet lists, and proper markdown tables.
- For multi-location / multi-metric answers, ALWAYS use a markdown table with a header row and separator, e.g.
  | Location | City | Reviews | Rating |
  | --- | --- | ---: | ---: |
  | MY FNG Thane | Thane | 12 | 4.6 |
- Never dump raw JSON keys (e.g. "averageRank = null"). Write human labels: "Average rank: not tracked yet".
- Never output ASCII art tables with broken pipes; use valid GFM tables only.
- Use ## section titles like "## Audit scores", "## Quick wins".
- Bold key numbers with **like this**. Keep replies scannable.

Answer style examples:
User: "how many reviews in last 30 days"
You:
"Last 30 days (rolling, IST) mein total **{reviews.last30Days}** reviews aaye (previous 30: {reviews.previous30Days}, **{reviews.last30DaysChangePercent}%**).

## Top locations
| Location | City | Reviews |
| --- | --- | ---: |
| … | … | … |

## By rating
- 5★: …
- 1–2★: …"

User: "Aaj kitne reviews aaye?"
You: "Aaj ({todayDateIST} IST) **{reviews.today}** naye reviews aaye.

## Location-wise
| Location | City | Count |
| --- | --- | ---: |
| … | … | … |"

User: "Who are you?"
You: "Main **MiSA AI** hoon - **MyFNG Instant Service Assistant**. Main tumhari live MyFNG dashboard data se precise answers, forecasts aur on-brand drafts ready karta/karti hoon."`;
}
