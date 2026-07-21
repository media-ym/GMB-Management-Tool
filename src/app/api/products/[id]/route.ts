import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { pushProductUpdateToGoogle } from "@/lib/gbp-product-update";
import { ensureGmbBrowserSession } from "@/lib/gbp-chrome-session";

export const dynamic = "force-dynamic";

/** PATCH /api/products/[id] — update product and optionally sync to GMB Product Editor */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.manage")) return forbidden();

  const { id } = await params;
  const product = await db.product.findUnique({
    where: { id },
    include: {
      location: { select: { name: true, googleProfiles: { select: { googleLocationId: true } } } },
    },
  });
  if (!product) return fail("Product not found", 404);

  const scoped = scopeLocationIds(user, product.locationId);
  if (scoped && !scoped.includes(product.locationId)) return forbidden("Location out of scope");

  const body = await req.json().catch(() => ({}));
  const originalName = product.name;

  const data: {
    name?: string;
    description?: string | null;
    category?: string | null;
    price?: number | null;
    imageUrl?: string | null;
    landingUrl?: string | null;
    googleEditId?: string | null;
  } = {};

  if (body.name != null) data.name = String(body.name).trim();
  if (body.description !== undefined) data.description = body.description || null;
  if (body.category !== undefined) data.category = body.category || null;
  if (body.price !== undefined) data.price = body.price != null ? parseFloat(body.price) : null;
  if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl || null;
  if (body.landingUrl !== undefined) data.landingUrl = body.landingUrl || null;

  const gbp = product.location.googleProfiles[0];
  const shouldPushToGoogle =
    body.pushToGoogle !== false && !!gbp?.googleLocationId && !!(product.googleEditId || body.googleEditId);

  let googleSyncError: string | undefined;
  if (shouldPushToGoogle) {
    if (!gbp?.googleLocationId) {
      googleSyncError = "No Google profile linked for this listing";
    } else {
      const session = ensureGmbBrowserSession({ autoLaunch: false });
      if (!session.ready) {
        googleSyncError = session.error;
      } else {
        const result = await pushProductUpdateToGoogle({
          googleLocationId: gbp.googleLocationId,
          locationName: product.location.name,
          originalName,
          googleEditId: product.googleEditId,
          name: data.name || product.name,
          description: data.description ?? product.description,
          category: data.category ?? product.category,
          price: data.price ?? product.price,
          imageUrl: data.imageUrl ?? product.imageUrl,
          landingUrl: data.landingUrl ?? product.landingUrl,
        });
        if (!result.ok) {
          googleSyncError = result.error || "Google sync failed";
        } else if (result.googleEditId) {
          data.googleEditId = result.googleEditId;
        }
      }
    }
  }

  const updated = await db.product.update({
    where: { id },
    data,
  });

  return ok(
    {
      id: updated.id,
      name: updated.name,
      googleEditId: updated.googleEditId,
      googleSynced: shouldPushToGoogle && !googleSyncError,
      googleSyncError,
    },
    googleSyncError
      ? `Saved locally. Google sync failed: ${googleSyncError}`
      : shouldPushToGoogle
        ? "Product saved and synced to Google"
        : "Product saved",
  );
}
