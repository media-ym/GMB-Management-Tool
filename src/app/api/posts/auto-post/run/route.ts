import { NextRequest } from "next/server";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { runDailyAutoPosts } from "@/lib/post-auto-generate";

export const dynamic = "force-dynamic";

/** POST /api/posts/auto-post/run — generate + publish now { locationId?: string } */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const locationId =
    typeof body.locationId === "string" && body.locationId.trim()
      ? body.locationId.trim()
      : undefined;

  let locationIds: string[] | undefined;
  try {
    locationIds = scopeLocationIds(user, locationId);
  } catch {
    return forbidden("You cannot run auto-post for this location");
  }

  const result = await runDailyAutoPosts({
    force: true,
    locationIds: locationId ? [locationId] : locationIds,
  });

  const scope = locationId ? "1 location" : "all eligible locations";
  return ok(
    result,
    `Published ${result.published} post(s) (${scope})${result.skipped ? ` · ${result.skipped} skipped` : ""}${result.failed ? ` · ${result.failed} failed` : ""}`,
  );
}
