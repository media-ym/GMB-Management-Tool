import { NextRequest } from "next/server";
import { ok } from "@/lib/api-response";
import { assertCronAuthorized } from "@/lib/cron-auth";
import { runDailyAutoPosts } from "@/lib/post-auto-generate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET /api/cron/auto-post-daily — daily MiSA SEO posts to all verified GMB locations */
export async function GET(req: NextRequest) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  const force = new URL(req.url).searchParams.get("force") === "1";
  const result = await runDailyAutoPosts({ force });

  return ok(
    result,
    `Auto-post: ${result.published} published, ${result.skipped} skipped, ${result.failed} failed`,
  );
}
