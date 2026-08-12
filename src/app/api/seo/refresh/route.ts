import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { refreshKeywordRankings } from "@/lib/keyword-rank-tracker";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/seo/refresh — check Google Maps ranks via Places API (doc 10 §8)
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "seo.manage") && !can(user.role, "system.sync")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const locationId = typeof body.locationId === "string" ? body.locationId : undefined;
  const limit = typeof body.limit === "number" ? body.limit : undefined;

  const scoped = scopeLocationIds(user, locationId);
  let locationIds: string[] | undefined;
  if (locationId) {
    if (scoped && !scoped.includes(locationId)) return forbidden("Location out of scope");
    locationIds = [locationId];
  } else if (scoped) {
    locationIds = scoped.filter((id) => id !== "__none__");
  }

  const keywordCount = await db.keyword.count({
    where: {
      status: "active",
      locationId: locationIds?.length ? { in: locationIds } : { not: null },
    },
  });

  if (keywordCount === 0) {
    return fail("No keywords found to refresh. Add keywords first.", 400);
  }

  // Single location: check all its keywords (typically 25)
  const effectiveLimit = limit ?? (locationId ? Math.min(keywordCount, 100) : 40);

  try {
    const result = await refreshKeywordRankings({ locationIds, limit: effectiveLimit });
    const now = new Date();

    await logAudit({
      userId: user.id,
      userName: user.name,
      action: "seo.refresh",
      entity: "keyword",
      newValue: { ...result, locationId: locationId ?? "scoped", limit },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });

    const msg =
      result.checked > 0
        ? `Checked ${result.checked} keyword(s) · ${result.ranked} ranked in top 20`
        : "No ranks checked — set GOOGLE_PLACES_API_KEY (server key, no referrer lock) in .env and click Check ranks";

    return ok(
      {
        refreshed: result.checked,
        ranked: result.ranked,
        skipped: result.skipped,
        errors: result.errors,
        keywords: keywordCount,
        timestamp: now.toISOString(),
      },
      msg,
    );
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : "Rank refresh failed", 502);
  }
}
