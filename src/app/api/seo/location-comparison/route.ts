import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/seo/location-comparison — compare locations by SEO metrics (doc 10 §18)
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "seo.view")) return forbidden();

  const scoped = scopeLocationIds(user);
  const where: any = {};
  if (scoped) where.id = { in: scoped };

  const locations = await db.location.findMany({
    where,
    select: {
      id: true, name: true, city: true,
      healthScore: true, visibilityScore: true,
      avgRating: true, reviewCount: true,
    },
    orderBy: { city: "asc" },
  });

  // For each location, get keyword rank stats + post count + response rate
  const comparison = await Promise.all(locations.map(async (loc) => {
    const keywords = await db.keyword.findMany({
      where: { locationId: loc.id },
      include: { rankings: { orderBy: { checkedAt: "desc" }, take: 25, select: { rank: true } } },
    });
    const allRanks = keywords.flatMap(k => k.rankings.map(r => r.rank).filter(r => r > 0));
    const avgRank = allRanks.length ? Math.round((allRanks.reduce((a, b) => a + b, 0) / allRanks.length) * 10) / 10 : 0;
    const top3 = allRanks.filter(r => r <= 3).length;
    const postCount = await db.post.count({ where: { locationId: loc.id, status: "published" } });
    const repliedReviews = await db.review.count({ where: { locationId: loc.id, replyStatus: "replied" } });
    const responseRate = loc.reviewCount > 0 ? Math.round((repliedReviews / loc.reviewCount) * 100) : 0;

    return {
      id: loc.id,
      name: loc.name,
      city: loc.city,
      seoScore: loc.healthScore,
      visibilityScore: loc.visibilityScore,
      avgRank,
      keywordCount: keywords.length,
      top3Count: top3,
      avgRating: loc.avgRating,
      reviewCount: loc.reviewCount,
      postCount,
      responseRate,
    };
  }));

  return ok(comparison);
}
