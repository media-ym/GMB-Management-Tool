import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { getValidAccessToken, listGoogleAccounts, listGoogleLocations, googleServiceStatus, getVoiceOfMerchantState } from "@/lib/google-service";
import { extractLocationFromName, parseGoogleAddress, inferCityFromAddress } from "@/lib/location-utils";
import { resolveVerificationFromVoiceOfMerchant, resolveGbpMapUrl } from "@/lib/gbp-profile-utils";

export const dynamic = "force-dynamic";

// GET /api/google/available-locations — fetch REAL GMB locations from Google API
// Returns 3 states:
//   1. Google OAuth not configured (no GOOGLE_CLIENT_ID) → status: "not_configured"
//   2. Google OAuth configured but account not connected → status: "not_connected"
//   3. Connected → fetches real GMB locations, filters out already-imported → status: "connected"
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.manage")) return forbidden();

  // ─── State 1: Google OAuth not configured ──────────────────────────────
  if (!googleServiceStatus.isConfigured) {
    return ok({
      status: "not_configured",
      connected: false,
      locations: [],
      message: "Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file, then restart the server.",
      setupSteps: [
        "Go to Google Cloud Console (console.cloud.google.com)",
        "Create a project and enable Google Business Profile API",
        "Create OAuth 2.0 credentials (Web Application)",
        "Add redirect URI: " + googleServiceStatus.redirectUri,
        "Copy Client ID and Client Secret to your .env file",
      ],
    });
  }

  // ─── State 2: Configured but not connected ─────────────────────────────
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return ok({
      status: "not_connected",
      connected: false,
      locations: [],
      message: "Google account is not connected. Click 'Connect Google' to authenticate with your Google Business Profile account.",
    });
  }

  // ─── State 3: Connected — fetch real GMB locations ─────────────────────
  try {
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

    // Filter out already-imported locations; check real verification via VoiceOfMerchant API
    const filtered = allGmbLocations.filter((loc) => !existingIds.has(loc.name));
    const available: Array<Record<string, unknown>> = [];
    for (const loc of filtered) {
      let verificationState: "verified" | "unverified" = "unverified";
      try {
        const vom = await getVoiceOfMerchantState(accessToken, loc.name);
        verificationState = resolveVerificationFromVoiceOfMerchant(vom);
      } catch {
        // Default unverified if check fails
      }
      available.push({
        googleLocationId: loc.name,
        name: loc.title || "Unknown",
        storeCode: loc.storeCode || null,
        ...(() => {
          const parsed = parseGoogleAddress(loc.storefrontAddress);
          const city = parsed.city
            || extractLocationFromName(loc.title || "").city
            || inferCityFromAddress(parsed.address)
            || "";
          return {
            address: parsed.address || formatAddress(loc.storefrontAddress),
            city,
            state: parsed.state || "Maharashtra",
            pincode: parsed.pincode,
          };
        })(),
        phone: loc.phoneNumbers?.primaryPhone || null,
        website: loc.websiteUri || null,
        latitude: loc.latlng?.latitude || null,
        longitude: loc.latlng?.longitude || null,
        primaryCategory: loc.categories?.primaryCategory?.displayName || null,
        additionalCategories: loc.categories?.additionalCategories?.map((c: any) => c.displayName) || [],
        averageRating: loc.metadata?.averageRating || 0,
        totalReviews: loc.metadata?.reviewCount || 0,
        verificationState,
        placeId: loc.metadata?.placeId || null,
        mapUrl: resolveGbpMapUrl({
          metadata: loc.metadata,
          googleLocationId: loc.name,
          name: loc.title,
          latitude: loc.latlng?.latitude,
          longitude: loc.latlng?.longitude,
        }),
        openInfo: loc.openInfo?.status || "OPEN",
      });
    }

    return ok({
      status: "connected",
      connected: true,
      totalFound: allGmbLocations.length,
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
