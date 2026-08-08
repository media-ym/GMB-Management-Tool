import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { listEligibleLocations } from "@/lib/post-auto-generate";

export const dynamic = "force-dynamic";

/** GET /api/posts/auto-post/locations — fast list for test dropdown (no Google API calls) */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.view")) return forbidden();

  let locations = await listEligibleLocations();
  const scoped = scopeLocationIds(user);
  if (scoped) {
    const allowed = new Set(scoped);
    locations = locations.filter((l) => allowed.has(l.id));
  }

  return ok(
    locations.map((l) => ({
      id: l.id,
      name: l.name,
      city: l.city,
    })),
  );
}
