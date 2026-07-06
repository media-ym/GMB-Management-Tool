import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/posts/stats — post analytics dashboard (doc 09 §3, §20)
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || undefined;
  const scoped = scopeLocationIds(user, locationId);
  const where: any = {};
  if (scoped) where.locationId = { in: scoped };
  if (locationId && (!scoped || scoped.includes(locationId))) where.locationId = locationId;

  const [total, drafts, scheduled, published, failed, todayPublished, aiDrafts] = await Promise.all([
    db.post.count({ where }),
    db.post.count({ where: { ...where, status: "draft" } }),
    db.post.count({ where: { ...where, status: "scheduled" } }),
    db.post.count({ where: { ...where, status: "published" } }),
    db.post.count({ where: { ...where, status: "failed" } }),
    db.post.count({ where: { ...where, status: "published", publishedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    db.post.count({ where: { ...where, source: "ai", status: "draft" } }),
  ]);

  // Upcoming scheduled posts (next 7 days)
  const upcoming = await db.post.findMany({
    where: { ...where, status: "scheduled", scheduledAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } },
    orderBy: { scheduledAt: "asc" },
    take: 10,
    include: { location: { select: { name: true, city: true } } },
  });

  // Publishing success rate
  const successRate = (published + failed) > 0 ? Math.round((published / (published + failed)) * 100) : 100;

  // Post type distribution
  const typeCounts = await db.post.groupBy({
    by: ["type"],
    where,
    _count: { type: true },
  });

  // Top performing (most recent published posts)
  const topPerforming = await db.post.findMany({
    where: { ...where, status: "published" },
    orderBy: { publishedAt: "desc" },
    take: 5,
    include: { location: { select: { name: true, city: true } } },
  });

  // Posts by location (for multi-location view)
  const byLocation = await db.post.groupBy({
    by: ["locationId"],
    where,
    _count: { locationId: true },
  });
  const locationIds = [...new Set(byLocation.map(p => p.locationId))];
  const locations = await db.location.findMany({ where: { id: { in: locationIds } }, select: { id: true, name: true, city: true } });

  return ok({
    total,
    drafts,
    scheduled,
    published,
    failed,
    todayPublished,
    aiDrafts,
    successRate,
    upcoming: upcoming.map(p => ({
      id: p.id, title: p.title, type: p.type,
      locationName: p.location.name, locationCity: p.location.city,
      scheduledAt: p.scheduledAt?.toISOString() ?? null,
    })),
    typeDistribution: typeCounts.map(t => ({ type: t.type, count: t._count.type })),
    topPerforming: topPerforming.map(p => ({
      id: p.id, title: p.title, type: p.type,
      locationName: p.location.name, locationCity: p.location.city,
      publishedAt: p.publishedAt?.toISOString() ?? null,
    })),
    byLocation: byLocation.map(b => {
      const loc = locations.find(l => l.id === b.locationId);
      return { locationId: b.locationId, locationName: loc?.name ?? "", city: loc?.city ?? "", count: b._count.locationId };
    }).sort((a, b) => b.count - a.count),
  });
}
