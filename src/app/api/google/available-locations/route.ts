import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { getValidAccessToken, listGoogleAccounts, listGoogleLocations, googleServiceStatus } from "@/lib/google-service";

export const dynamic = "force-dynamic";

// GET /api/google/available-locations — fetch real GMB locations from Google,
// filter out ones already imported into our DB
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.manage")) return forbidden();

  // Check if Google OAuth is configured
  if (!googleServiceStatus.isConfigured) {
    return ok({
      mode: "mock",
      connected: true, // mock mode shows demo locations
      locations: getMockAvailableLocations(),
      message: "Google OAuth not configured. Showing demo locations. Set GOOGLE_CLIENT_ID in .env to fetch real GMB profiles.",
    });
  }

  // Real mode — fetch from Google API
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return ok({
      mode: "production",
      connected: false,
      locations: [],
      message: "Google account not connected. Click 'Connect Google' to authorize and fetch your GMB locations.",
    });
  }

  try {
    // Get all Google accounts
    const accounts = await listGoogleAccounts(accessToken);
    const allGmbLocations: any[] = [];

    for (const account of accounts) {
      try {
        const locations = await listGoogleLocations(accessToken, account.name);
        allGmbLocations.push(...locations);
      } catch (e) {
        console.error(`Failed to fetch locations for account ${account.name}:`, e);
      }
    }

    // Get already-imported Google Location IDs
    const existingProfiles = await db.googleBusinessProfile.findMany({
      select: { googleLocationId: true },
    });
    const existingIds = new Set(existingProfiles.map((p) => p.googleLocationId));

    // Filter out already-imported locations
    const available = allGmbLocations
      .filter((loc) => !existingIds.has(loc.name))
      .map((loc) => ({
        googleLocationId: loc.name, // e.g. "locations/12345"
        name: loc.title || "Unknown",
        storeCode: loc.storeCode || null,
        address: formatAddress(loc.address),
        city: loc.address?.locality || loc.address?.administrativeArea || "",
        state: loc.address?.administrativeArea || "Maharashtra",
        pincode: loc.address?.postalCode || null,
        phone: loc.phoneNumbers?.primaryPhone || null,
        website: loc.websiteUri || null,
        latitude: loc.latlng?.latitude || null,
        longitude: loc.latlng?.longitude || null,
        primaryCategory: loc.categories?.primaryCategory?.displayName || null,
        additionalCategories: loc.categories?.additionalCategories?.map((c: any) => c.displayName) || [],
        averageRating: loc.metadata?.averageRating || 0,
        totalReviews: loc.metadata?.reviewCount || 0,
        verificationState: loc.metadata?.isVerified ? "verified" : "unverified",
        openInfo: loc.openInfo?.status || "OPEN",
      }));

    return ok({
      mode: "production",
      connected: true,
      total: allGmbLocations.length,
      available: available.length,
      alreadyImported: allGmbLocations.length - available.length,
      locations: available,
      message: available.length > 0
        ? `Found ${available.length} GMB location(s) available to import.`
        : "All your GMB locations are already imported.",
    });
  } catch (e: any) {
    return fail(`Failed to fetch GMB locations: ${e.message}`, 500);
  }
}

function formatAddress(addr: any): string {
  if (!addr) return "";
  const parts = [
    addr.addressLines?.join(", "),
    addr.locality,
    addr.administrativeArea,
    addr.postalCode,
  ].filter(Boolean);
  return parts.join(", ");
}

// Mock locations for demo mode (when Google OAuth is not configured)
function getMockAvailableLocations() {
  return [
    {
      googleLocationId: "locations/mock_nagpur_001",
      name: "MyFNG Nagpur",
      storeCode: "MYFNG-NGP",
      address: "Sitabuldi Road, Nagpur, Maharashtra 440001",
      city: "Nagpur",
      state: "Maharashtra",
      pincode: "440001",
      phone: "+91 712 4000 1016",
      website: "https://myfng.in",
      latitude: 21.1458,
      longitude: 79.0882,
      primaryCategory: "Interior Designer",
      additionalCategories: ["Home Improvement Store", "Furniture Store"],
      averageRating: 4.3,
      totalReviews: 67,
      verificationState: "verified",
      openInfo: "OPEN",
    },
    {
      googleLocationId: "locations/mock_aurangabad_001",
      name: "MyFNG Aurangabad",
      storeCode: "MYFNG-AUR",
      address: "Station Road, Aurangabad, Maharashtra 431001",
      city: "Aurangabad",
      state: "Maharashtra",
      pincode: "431001",
      phone: "+91 240 4000 1017",
      website: "https://myfng.in",
      latitude: 19.8762,
      longitude: 75.3433,
      primaryCategory: "Interior Designer",
      additionalCategories: ["Kitchen Furniture Store"],
      averageRating: 4.1,
      totalReviews: 34,
      verificationState: "verified",
      openInfo: "OPEN",
    },
    {
      googleLocationId: "locations/mock_kolhapur_001",
      name: "MyFNG Kolhapur",
      storeCode: "MYFNG-KOL",
      address: "Rajarampuri, Kolhapur, Maharashtra 416008",
      city: "Kolhapur",
      state: "Maharashtra",
      pincode: "416008",
      phone: "+91 231 4000 1018",
      website: "https://myfng.in",
      latitude: 16.7050,
      longitude: 74.2433,
      primaryCategory: "Interior Designer",
      additionalCategories: ["Home Improvement Store"],
      averageRating: 4.5,
      totalReviews: 52,
      verificationState: "unverified",
      openInfo: "OPEN",
    },
  ];
}
