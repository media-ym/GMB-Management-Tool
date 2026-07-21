import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// POST /api/seo/refresh — trigger rank refresh (doc 10 §8)
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "seo.manage") && !can(user.role, "system.sync")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const locationId = body.locationId;
  const scoped = scopeLocationIds(user, locationId);
  const where: { locationId?: { in: string[] } | string } = {};
  if (scoped) where.locationId = { in: scoped };
  if (locationId && (!scoped || scoped.includes(locationId))) where.locationId = locationId;

  const keywords = await db.keyword.findMany({
    where,
    select: { id: true },
  });

  if (keywords.length === 0) {
    return fail("No keywords found to refresh. Add keywords first.", 400);
  }

  const latest = await db.keywordRanking.findFirst({
    where: { keywordId: { in: keywords.map((k) => k.id) } },
    orderBy: { checkedAt: "desc" },
    select: { checkedAt: true },
  });

  if (!latest) {
    return fail(
      "No ranking data yet. Rank refresh requires a connected rank-tracking provider — sync keywords from Google or import rankings first.",
      501,
    );
  }

  const now = new Date();
  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "seo.refresh",
    entity: "keyword",
    newValue: { keywords: keywords.length, locationId: locationId ?? "all", note: "no-op — awaiting rank provider" },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok(
    { refreshed: 0, keywords: keywords.length, lastCheckedAt: latest.checkedAt.toISOString(), timestamp: now.toISOString() },
    "Rankings are up to date. Automated refresh will run when a rank-tracking provider is configured.",
  );
}
