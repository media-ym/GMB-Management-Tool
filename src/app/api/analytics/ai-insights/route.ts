import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/analytics/ai-insights — AI-generated insights (doc 11 §15)
// This doesn't call the AI model — it generates rule-based insights from the data
// that would normally be surfaced by MiSA AI.
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "analytics.view")) return forbidden();

  const scoped = scopeLocationIds(user);
  const where: any = {};
  if (scoped) where.id = { in: scoped };

  const locations = await db.location.findMany({
    where,
    select: { id: true, name: true, city: true, avgRating: true, reviewCount: true, healthScore: true, visibilityScore: true, syncStatus: true, status: true },
  });

  const insights: {
    type: "warning" | "success" | "info" | "critical";
    category: string;
    title: string;
    description: string;
    locationName?: string;
    impact: "high" | "medium" | "low";
    action?: string;
  }[] = [];

  // 1. Locations losing visibility (visibility score < 50)
  for (const loc of locations) {
    if (loc.visibilityScore < 50) {
      insights.push({
        type: "warning", category: "visibility",
        title: `${loc.city} visibility declining`,
        description: `${loc.name} has a visibility score of ${loc.visibilityScore}/100. Consider refreshing photos and publishing new posts.`,
        locationName: loc.name, impact: "high", action: "View SEO",
      });
    }
  }

  // 2. Rating drops (avgRating < 4.0)
  for (const loc of locations) {
    if (loc.avgRating < 4.0 && loc.reviewCount > 10) {
      insights.push({
        type: "critical", category: "reputation",
        title: `${loc.city} rating below 4.0`,
        description: `${loc.name} has an average rating of ${loc.avgRating}. Negative reviews need immediate attention.`,
        locationName: loc.name, impact: "high", action: "View Reviews",
      });
    }
  }

  // 3. Sync failures
  const syncFailed = locations.filter(l => l.syncStatus === "error");
  for (const loc of syncFailed) {
    insights.push({
      type: "critical", category: "sync",
      title: `${loc.city} sync failed`,
      description: `${loc.name} has a sync error. Google OAuth token may have expired.`,
      locationName: loc.name, impact: "high", action: "View Google Integration",
    });
  }

  // 4. High-performing branches
  const topLoc = [...locations].sort((a, b) => b.healthScore - a.healthScore)[0];
  if (topLoc && topLoc.healthScore >= 75) {
    insights.push({
      type: "success", category: "performance",
      title: `${topLoc.city} is your top performer`,
      description: `${topLoc.name} has a health score of ${topLoc.healthScore}/100 and ${topLoc.avgRating}★ rating. Great work!`,
      locationName: topLoc.name, impact: "low",
    });
  }

  // 5. Low posting frequency (check posts)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  for (const loc of locations.slice(0, 8)) {
    const recentPosts = await db.post.count({ where: { locationId: loc.id, status: "published", publishedAt: { gte: thirtyDaysAgo } } });
    if (recentPosts === 0) {
      insights.push({
        type: "warning", category: "content",
        title: `${loc.city} hasn't posted in 30 days`,
        description: `${loc.name} has zero published posts in the last 30 days. Use MiSA AI to generate fresh content.`,
        locationName: loc.name, impact: "medium", action: "Create Post",
      });
    }
  }

  // 6. Pending reviews
  for (const loc of locations.slice(0, 5)) {
    const pending = await db.review.count({ where: { locationId: loc.id, replyStatus: "pending", rating: { lte: 3 } } });
    if (pending >= 3) {
      insights.push({
        type: "warning", category: "reviews",
        title: `${pending} pending negative reviews on ${loc.city}`,
        description: `${loc.name} has ${pending} unanswered negative reviews. Respond within 2h SLA.`,
        locationName: loc.name, impact: "high", action: "View Reviews",
      });
    }
  }

  // 7. SEO opportunities
  const lowSeoLocs = locations.filter(l => l.visibilityScore >= 50 && l.visibilityScore < 70).slice(0, 3);
  for (const loc of lowSeoLocs) {
    insights.push({
      type: "info", category: "seo",
      title: `SEO improvement opportunity: ${loc.city}`,
      description: `${loc.name} has moderate visibility (${loc.visibilityScore}/100). Adding services and updating description could boost rankings.`,
      locationName: loc.name, impact: "medium", action: "View SEO",
    });
  }

  // Sort by impact: high → medium → low
  const impactOrder = { high: 0, medium: 1, low: 2 };
  insights.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);

  return ok({
    insights: insights.slice(0, 15),
    summary: {
      total: insights.length,
      critical: insights.filter(i => i.type === "critical").length,
      warnings: insights.filter(i => i.type === "warning").length,
      successes: insights.filter(i => i.type === "success").length,
    },
  });
}
