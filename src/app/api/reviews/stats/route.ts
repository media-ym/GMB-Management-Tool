import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import {
  buildLocationIdFilter,
  parseLocationIdsParam,
  parseDateRangeFromSearchParams,
  computeNps,
} from "@/lib/location-filter";

export const dynamic = "force-dynamic";

// GET /api/reviews/stats — review analytics dashboard (doc 08 §3, §16)
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || undefined;
  const locationIds = parseLocationIdsParam(url.searchParams.get("locationIds"));
  const dateRange = parseDateRangeFromSearchParams(url.searchParams);

  try {
    const locFilter = buildLocationIdFilter(user, { locationId, locationIds });
    const where: Record<string, unknown> = {
      ...locFilter,
      syncStatus: { not: "deleted" },
    };
    if (dateRange) where.createdAt = dateRange;

    const [total, pending, pendingAll, negative, positive, replied, todayReviews] = await Promise.all([
      db.review.count({ where }),
      db.review.count({ where: { ...where, replyStatus: "pending", rating: { lte: 3 } } }),
      db.review.count({ where: { ...where, replyStatus: "pending" } }),
      db.review.count({ where: { ...where, rating: { lte: 2 } } }),
      db.review.count({ where: { ...where, sentiment: "positive" } }),
      db.review.count({ where: { ...where, replyStatus: "replied" } }),
      db.review.count({
        where: {
          ...where,
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ]);

    const ratingAgg = await db.review.aggregate({ where, _avg: { rating: true } });
    const avgRating = Math.round((ratingAgg._avg.rating ?? 0) * 100) / 100;

    const distribution = await Promise.all(
      [1, 2, 3, 4, 5].map(async (r) => ({
        rating: r,
        count: await db.review.count({ where: { ...where, rating: r } }),
      })),
    );
    const distTotal = distribution.reduce((a, d) => a + d.count, 0) || 1;

    const responseRate = total > 0 ? Math.round((replied / total) * 100) : 0;
    const repliedReviews = await db.review.findMany({
      where: { ...where, replyStatus: "replied", repliedAt: { not: null } },
      select: { createdAt: true, repliedAt: true, rating: true },
    });
    const responseTimes = repliedReviews.map(
      (r) => (new Date(r.repliedAt!).getTime() - new Date(r.createdAt).getTime()) / (1000 * 60 * 60),
    );
    const avgResponseTimeHours = responseTimes.length
      ? Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 10) / 10
      : 0;

    const slaNegative = repliedReviews.filter((r) => r.rating <= 2);
    const slaPositive = repliedReviews.filter((r) => r.rating >= 3);
    const slaNegativeCompliant = slaNegative.filter(
      (r) => new Date(r.repliedAt!).getTime() - new Date(r.createdAt).getTime() <= 2 * 60 * 60 * 1000,
    ).length;
    const slaPositiveCompliant = slaPositive.filter(
      (r) => new Date(r.repliedAt!).getTime() - new Date(r.createdAt).getTime() <= 24 * 60 * 60 * 1000,
    ).length;
    const slaCompliance = {
      negative: {
        total: slaNegative.length,
        compliant: slaNegativeCompliant,
        rate: slaNegative.length ? Math.round((slaNegativeCompliant / slaNegative.length) * 100) : 100,
        target: "2 hours",
      },
      positive: {
        total: slaPositive.length,
        compliant: slaPositiveCompliant,
        rate: slaPositive.length ? Math.round((slaPositiveCompliant / slaPositive.length) * 100) : 100,
        target: "24 hours",
      },
    };

    const trendDays = dateRange?.gte
      ? Math.min(180, Math.ceil((Date.now() - dateRange.gte.getTime()) / (24 * 60 * 60 * 1000)))
      : 30;
    const trendStart = dateRange?.gte ?? new Date(Date.now() - trendDays * 24 * 60 * 60 * 1000);
    const trendWhere: Record<string, unknown> = { ...where, createdAt: { gte: trendStart } };
    if (dateRange?.lte) {
      trendWhere.createdAt = { gte: trendStart, lte: dateRange.lte };
    }
    const recentReviews = await db.review.findMany({
      where: trendWhere,
      select: { createdAt: true, rating: true, sentiment: true },
    });
    const trend = new Map<string, { date: string; count: number; positive: number; negative: number }>();
    for (let d = trendDays - 1; d >= 0; d--) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      date.setHours(0, 0, 0, 0);
      const key = date.toISOString().slice(0, 10);
      trend.set(key, { date: key, count: 0, positive: 0, negative: 0 });
    }
    for (const r of recentReviews) {
      const key = r.createdAt.toISOString().slice(0, 10);
      const t = trend.get(key);
      if (t) {
        t.count++;
        if (r.sentiment === "positive") t.positive++;
        if (r.sentiment === "negative") t.negative++;
      }
    }

    const labels = await db.reviewLabel.groupBy({
      by: ["label"],
      where: { review: where },
      _count: { label: true },
      orderBy: { _count: { label: "desc" } },
      take: 10,
    });
    const complaintLabels = ["Complaint", "Delayed Service", "Pricing", "Poor Communication", "Long Waiting", "Parts Availability"];
    const appreciationLabels = ["Appreciation", "Fast Service", "Professional", "Affordable", "Friendly Staff", "Quality Work"];
    const topComplaints = labels
      .filter((l) => complaintLabels.includes(l.label))
      .map((l) => ({ topic: l.label, count: l._count.label }));
    const topAppreciation = labels
      .filter((l) => appreciationLabels.includes(l.label))
      .map((l) => ({ topic: l.label, count: l._count.label }));

    const sentimentCounts = {
      positive: await db.review.count({ where: { ...where, sentiment: "positive" } }),
      neutral: await db.review.count({ where: { ...where, sentiment: "neutral" } }),
      negative: await db.review.count({ where: { ...where, sentiment: "negative" } }),
    };

    const nps = computeNps(distribution, total);

    return ok({
      total,
      pending,
      pendingAll,
      negative,
      positive,
      replied,
      todayReviews,
      avgRating,
      responseRate,
      avgResponseTimeHours,
      slaCompliance,
      ratingDistribution: distribution.map((d) => ({
        ...d,
        percentage: Math.round((d.count / distTotal) * 100),
      })),
      trend: Array.from(trend.values()),
      topComplaints,
      topAppreciation,
      sentimentCounts,
      aiSuggestedCount: await db.review.count({ where: { ...where, replySource: "ai" } }),
      nps,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") return forbidden();
    throw e;
  }
}
