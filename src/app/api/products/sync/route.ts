import { NextRequest } from "next/server";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { syncGoogleProductsForLocations } from "@/lib/google-product-sync";

export const dynamic = "force-dynamic";

/** Import GMB product catalog + PRODUCT posts into MyFNG DB (background headless Chrome). */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const requestedIds = Array.isArray(body.locationIds)
    ? (body.locationIds as string[]).filter(Boolean)
    : undefined;

  const scoped = scopeLocationIds(user);
  const locationIds = requestedIds?.length
    ? scoped
      ? requestedIds.filter((id) => scoped.includes(id))
      : requestedIds
    : undefined;

  const result = await syncGoogleProductsForLocations(locationIds);

  const message =
    result.synced > 0
      ? `Imported ${result.fromCatalog} catalog product(s) and ${result.fromPosts} product post(s) from Google`
      : result.errors[0] ||
        "Could not import products from Google. Go to More → Google → Connect and retry.";

  return ok(result, message);
}
