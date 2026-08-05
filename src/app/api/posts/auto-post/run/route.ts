import { NextRequest } from "next/server";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { runDailyAutoPosts } from "@/lib/post-auto-generate";

export const dynamic = "force-dynamic";

/** POST /api/posts/auto-post/run — generate + publish now for eligible locations */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.manage")) return forbidden();

  const locationIds = scopeLocationIds(user);
  const result = await runDailyAutoPosts({
    force: true,
    locationIds,
  });

  return ok(
    result,
    `Published ${result.published} post(s)${result.skipped ? ` · ${result.skipped} skipped` : ""}${result.failed ? ` · ${result.failed} failed` : ""}`,
  );
}
