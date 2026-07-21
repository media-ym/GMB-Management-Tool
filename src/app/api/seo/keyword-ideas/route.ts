import { NextRequest } from "next/server";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, fail, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import {
  generateKeywordIdeas,
  getKeywordPlannerStatus,
  isGoogleAdsConfigured,
} from "@/lib/google-ads-keyword-planner";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "seo.view")) return forbidden();

  const status = await getKeywordPlannerStatus();
  return ok({
    ...status,
    ready: status.configured && status.connected && status.hasAdwordsScope,
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "seo.view")) return forbidden();

  if (!isGoogleAdsConfigured()) {
    return fail(
      "Google Ads not configured. Add GOOGLE_ADS_DEVELOPER_TOKEN and GOOGLE_ADS_CUSTOMER_ID to .env",
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const seedRaw = body.seed ?? body.keyword ?? body.seeds;
    const seeds: string[] = Array.isArray(seedRaw)
      ? seedRaw.map(String)
      : typeof seedRaw === "string"
        ? seedRaw
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    const locationId = (body.locationId as string | undefined) || undefined;
    if (locationId) {
      const scoped = scopeLocationIds(user);
      if (scoped && !scoped.includes(locationId)) return forbidden();
    }

    const pageUrl = (body.pageUrl as string | undefined) || undefined;
    const languageId = (body.languageId as string | undefined) || undefined;

    const result = await generateKeywordIdeas({
      seeds,
      locationId,
      pageUrl,
      languageId,
      pageSize: body.pageSize ? Number(body.pageSize) : 50,
    });

    return ok(result, `${result.ideas.length} keyword ideas`);
  } catch (e: any) {
    return fail(e.message || "Failed to generate keyword ideas");
  }
}
