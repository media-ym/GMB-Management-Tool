import { db } from "./db";
import { getValidAccessToken, listGooglePosts, resolveV4LocationName } from "./google-service";
import { importGbpProductCatalogForLocation } from "./gbp-product-catalog-import";

export interface GoogleProductSyncResult {
  synced: number;
  fromCatalog: number;
  fromPosts: number;
  locationsProcessed: number;
  errors: string[];
}

/** RightChoice-style: import existing GMB catalog + PRODUCT posts into MyFNG DB. */
export async function syncGoogleProductsForLocation(locationId: string): Promise<{
  synced: number;
  fromCatalog: number;
  fromPosts: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let fromCatalog = 0;
  let fromPosts = 0;

  const catalogResult = await importGbpProductCatalogForLocation(locationId);
  fromCatalog = catalogResult.imported;
  errors.push(...catalogResult.errors);

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return { synced: fromCatalog, fromCatalog, fromPosts, errors: [...errors, "No valid Google access token for posts"] };
  }

  const gbp = await db.googleBusinessProfile.findFirst({
    where: { locationId },
    select: { googleLocationId: true },
  });
  if (!gbp) {
    return { synced: fromCatalog, fromCatalog, fromPosts, errors };
  }

  try {
    let v4Name: string;
    try {
      v4Name = await resolveV4LocationName(accessToken, gbp.googleLocationId);
    } catch {
      v4Name = gbp.googleLocationId;
    }

    await db.product.deleteMany({
      where: {
        locationId,
        source: "google",
        googleItemId: { contains: "localPosts" },
      },
    });

    const allPosts = await listGooglePosts(accessToken, v4Name);
    const productPosts = allPosts.filter((p: { topicType?: string }) => p.topicType === "PRODUCT");

    for (const gp of productPosts) {
      const name = gp.summary || gp.event?.title;
      if (!name?.trim()) continue;

      await db.product.create({
        data: {
          locationId,
          name: name.trim(),
          description: gp.summary || null,
          imageUrl: gp.media?.[0]?.googleUrl || gp.media?.[0]?.sourceUrl || null,
          googleItemId: gp.name,
          source: "google",
          category: "Products",
        },
      });
      fromPosts++;
    }
  } catch (e: unknown) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  return { synced: fromCatalog + fromPosts, fromCatalog, fromPosts, errors };
}

export async function syncGoogleProductsForLocations(
  locationIds?: string[],
): Promise<GoogleProductSyncResult> {
  const scopedIds =
    locationIds?.length
      ? locationIds
      : (
          await db.googleBusinessProfile.findMany({ select: { locationId: true } })
        ).map((g) => g.locationId);

  let fromCatalog = 0;
  let fromPosts = 0;
  const errors: string[] = [];

  for (const locationId of scopedIds) {
    const result = await syncGoogleProductsForLocation(locationId);
    fromCatalog += result.fromCatalog;
    fromPosts += result.fromPosts;
    for (const err of result.errors) {
      errors.push(`${locationId}: ${err}`);
    }
  }

  return {
    synced: fromCatalog + fromPosts,
    fromCatalog,
    fromPosts,
    locationsProcessed: scopedIds.length,
    errors,
  };
}
