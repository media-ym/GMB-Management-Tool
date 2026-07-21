import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/api-response";
import { toGoogleWriteReviewUrl } from "@/lib/google-write-review-url";

export const dynamic = "force-dynamic";

/** Public — resolve location for the customer review landing page */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId")?.trim();
  const branch = url.searchParams.get("branch")?.trim();

  if (!locationId && !branch) {
    return fail("locationId or branch is required");
  }

  let location = locationId
    ? await db.location.findUnique({
        where: { id: locationId },
        include: {
          googleProfiles: {
            take: 1,
            select: {
              mapUrl: true,
              placeId: true,
              reviewUrl: true,
              profileName: true,
              googleLocationId: true,
            },
          },
        },
      })
    : null;

  if (!location && branch) {
    location = await db.location.findFirst({
      where: {
        OR: [
          { city: { contains: branch } },
          { name: { contains: branch } },
          { address: { contains: branch } },
        ],
      },
      include: {
        googleProfiles: {
          take: 1,
          select: {
            mapUrl: true,
            placeId: true,
            reviewUrl: true,
            profileName: true,
            googleLocationId: true,
          },
        },
      },
    });
  }

  if (!location) return fail("Location not found", 404);

  const gbp = location.googleProfiles[0];
  const googleReviewUrl = toGoogleWriteReviewUrl({
    reviewUrl: gbp?.reviewUrl,
    placeId: gbp?.placeId,
    mapUrl: gbp?.mapUrl,
  });

  return ok({
    locationId: location.id,
    businessName: "My FNG",
    branchName: location.city || location.name,
    locationName: location.name,
    address: location.address,
    mapUrl: gbp?.mapUrl ?? null,
    placeId: gbp?.placeId ?? null,
    reviewUrl: gbp?.reviewUrl ?? null,
    googleReviewUrl,
    canPostToGoogle: !!googleReviewUrl,
  });
}
