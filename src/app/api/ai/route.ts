import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { aiChat, aiSeoSuggestions, aiMonthlySummary } from "@/lib/ai";

export const dynamic = "force-dynamic";

// POST /api/ai — unified AI endpoint (chat / seo / summary)
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "ai.use")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const action: string = body.action || "chat";

  try {
    if (action === "chat") {
      const messages: { role: "user" | "assistant"; content: string }[] = body.messages || [];
      if (!messages.length) return fail("messages required");
      const { reply } = await aiChat({ user, messages });
      await logAudit({ userId: user.id, userName: user.name, action: "ai.generate", entity: "chat", newValue: { msgCount: messages.length }, ip: req.headers.get("x-forwarded-for") ?? undefined });
      return ok({ reply }, "MiSA AI response");
    }

    if (action === "seo") {
      if (!can(user.role, "seo.view")) return forbidden();
      const { locationId } = body;
      const loc = await db.location.findUnique({ where: { id: locationId } });
      if (!loc) return fail("Location not found", 404);

      const keywords = await db.keyword.findMany({
        where: { locationId },
        include: { rankings: { orderBy: { checkedAt: "desc" }, take: 25 } },
      });
      const topKeywords = keywords
        .map((k) => {
          const ranks = k.rankings.map((r) => r.rank).filter((r) => r > 0);
          return { keyword: k.keyword, rank: ranks.length ? Math.min(...ranks) : 99 };
        })
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 8);
      const avgRank = topKeywords.length ? topKeywords.reduce((a, k) => a + k.rank, 0) / topKeywords.length : 0;

      const { recommendations } = await aiSeoSuggestions({
        user, locationName: loc.name, avgRank, topKeywords, healthScore: loc.healthScore, visibilityScore: loc.visibilityScore,
      });
      await logAudit({ userId: user.id, userName: user.name, action: "ai.generate", entity: "seo", entityId: locationId, ip: req.headers.get("x-forwarded-for") ?? undefined });
      return ok({ recommendations }, "MiSA AI SEO recommendations");
    }

    if (action === "summary") {
      if (!can(user.role, "analytics.view")) return forbidden();
      const { locationId } = body;
      const loc = await db.location.findUnique({ where: { id: locationId } });
      if (!loc) return fail("Location not found", 404);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const [current, previous, reviewsNow, reviewsPrev] = await Promise.all([
        db.analyticDaily.aggregate({ where: { locationId, date: { gte: thirtyDaysAgo } }, _sum: { searchViews: true, mapsViews: true, websiteClicks: true, phoneCalls: true, directionRequests: true } }),
        db.analyticDaily.aggregate({ where: { locationId, date: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } }, _sum: { searchViews: true, mapsViews: true, websiteClicks: true, phoneCalls: true, directionRequests: true } }),
        db.review.count({ where: { locationId, createdAt: { gte: thirtyDaysAgo } } }),
        db.review.aggregate({ where: { locationId, createdAt: { gte: thirtyDaysAgo } }, _avg: { rating: true } }),
      ]);
      const prevAvgAgg = await db.review.aggregate({ where: { locationId, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } }, _avg: { rating: true } });

      const { summary } = await aiMonthlySummary({
        user, locationName: loc.name,
        metrics: {
          searchViews: current._sum.searchViews ?? 0,
          mapsViews: current._sum.mapsViews ?? 0,
          websiteClicks: current._sum.websiteClicks ?? 0,
          phoneCalls: current._sum.phoneCalls ?? 0,
          directionRequests: current._sum.directionRequests ?? 0,
          newReviews: reviewsNow,
          avgRating: Math.round((reviewsNow._avg.rating ?? loc.avgRating) * 100) / 100,
          prevAvgRating: Math.round((prevAvgAgg._avg.rating ?? loc.avgRating) * 100) / 100,
        },
      });
      await logAudit({ userId: user.id, userName: user.name, action: "ai.generate", entity: "summary", entityId: locationId, ip: req.headers.get("x-forwarded-for") ?? undefined });
      return ok({ summary, deltas: { searchViews: (current._sum.searchViews ?? 0) - (previous._sum.searchViews ?? 0) } }, "MiSA AI monthly summary");
    }

    return fail("Unknown action");
  } catch (e: any) {
    return fail(e.message || "AI request failed", 500);
  }
}
