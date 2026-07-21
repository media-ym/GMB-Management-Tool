import type { Metadata } from "next";
import { ReviewPage } from "@/components/review-landing/review-page";
import { db } from "@/lib/db";
import { toGoogleWriteReviewUrl } from "@/lib/google-write-review-url";

export const metadata: Metadata = {
  title: "Share Your Experience — My FNG",
  description: "Rate your My FNG service experience in a few seconds.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined, fallback = "") {
  if (Array.isArray(v)) return v[0]?.trim() || fallback;
  return v?.trim() || fallback;
}

async function resolveLocation(locationId: string, branch: string) {
  if (locationId) {
    return db.location.findUnique({
      where: { id: locationId },
      include: {
        googleProfiles: {
          take: 1,
          select: { mapUrl: true, placeId: true, reviewUrl: true, profileName: true },
        },
      },
    });
  }
  if (branch) {
    return db.location.findFirst({
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
          select: { mapUrl: true, placeId: true, reviewUrl: true, profileName: true },
        },
      },
    });
  }
  return null;
}

export default async function ReviewLandingRoute({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const locationId = first(sp.locationId);
  const branchParam = first(sp.branch, "Vartak Nagar, Thane West");
  const businessParam = first(sp.business, "My FNG");
  const gmbOverride = first(sp.gmb);

  const location = await resolveLocation(locationId, branchParam);
  const gbp = location?.googleProfiles[0];
  const googleReviewUrl =
    gmbOverride ||
    toGoogleWriteReviewUrl({
      reviewUrl: gbp?.reviewUrl,
      placeId: gbp?.placeId,
      mapUrl: gbp?.mapUrl,
    }) ||
    null;

  return (
    <ReviewPage
      businessName={businessParam || "My FNG"}
      branchName={location?.city || branchParam}
      locationId={location?.id ?? null}
      logoSrc="/myfng-logo.png"
      googleReviewUrl={googleReviewUrl}
    />
  );
}
