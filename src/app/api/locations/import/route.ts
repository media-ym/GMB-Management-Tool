import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { extractLocationFromName, resolveLocationAddress, parseGoogleAddress, inferCityFromAddress } from "@/lib/location-utils";
import { resolveGbpMapUrl } from "@/lib/gbp-profile-utils";
import { refreshLocationScores } from "@/lib/location-scores";
import { syncGoogleProductsForLocation } from "@/lib/google-product-sync";

export const dynamic = "force-dynamic";

interface GmbLocation {
  googleLocationId: string;
  name: string;
  storeCode?: string | null;
  address: string;
  city: string;
  state: string;
  pincode?: string | null;
  phone?: string | null;
  website?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  primaryCategory?: string | null;
  additionalCategories?: string[];
  averageRating?: number;
  totalReviews?: number;
  verificationState?: string;
  mapUrl?: string | null;
  placeId?: string | null;
}

// POST /api/locations/import — import selected GMB locations with real data
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.manage")) return forbidden("Only Super Admin and Marketing Manager can import locations.");

  const body = await req.json().catch(() => ({}));
  const { locations }: { locations: GmbLocation[] } = body;

  if (!locations || !Array.isArray(locations) || locations.length === 0) {
    return fail("No locations selected for import");
  }

  const imported: { id: string; name: string; city: string }[] = [];
  const errors: { name: string; error: string }[] = [];

  // Portal imports bind locations to the end-client; staff imports stay unscoped (or body.clientId)
  const bindClientId =
    user.role === "client_portal"
      ? user.clientId
      : body.clientId
        ? String(body.clientId)
        : null;

  const googleAccount = bindClientId
    ? await db.googleAccount.findFirst({
        where: { status: "active", clientId: bindClientId },
        orderBy: { updatedAt: "desc" },
      })
    : (await db.googleAccount.findFirst({
        where: { status: "active", clientId: null },
        orderBy: { updatedAt: "desc" },
      })) ||
      (await db.googleAccount.findFirst({ where: { status: "active" } }));

  for (const gmb of locations) {
    try {
      // Check if already exists
      const existing = await db.googleBusinessProfile.findFirst({
        where: { googleLocationId: gmb.googleLocationId },
      });
      if (existing) {
        errors.push({ name: gmb.name, error: "Already imported" });
        continue;
      }

      const extracted = extractLocationFromName(gmb.name);
      const parsed = gmb.address
        ? parseGoogleAddress({ addressLines: gmb.address.split(", ").length > 1 ? gmb.address.split(", ") : [gmb.address] })
        : parseGoogleAddress(null);
      const city = gmb.city
        || parsed.city
        || extracted.city
        || inferCityFromAddress(gmb.address || "")
        || "Unknown";
      const address = gmb.address?.trim()
        || resolveLocationAddress({ address: "", name: gmb.name });
      const resolvedAddress = address === "Sync to load address" ? "" : address;

      // Create Location record
      const location = await db.location.create({
        data: {
          name: gmb.name,
          locationCode: gmb.storeCode || null,
          city,
          region: gmb.state || "Maharashtra",
          state: gmb.state || "Maharashtra",
          pincode: gmb.pincode || null,
          address: resolvedAddress,
          phone: gmb.phone || null,
          email: null,
          website: gmb.website || "https://myfng.in",
          timezone: "Asia/Kolkata",
          latitude: gmb.latitude || null,
          longitude: gmb.longitude || null,
          status: "active",
          syncStatus: "synced",
          lastSyncedAt: new Date(),
          avgRating: gmb.averageRating || 0,
          reviewCount: gmb.totalReviews || 0,
          healthScore: 0,
          visibilityScore: 0,
          clientId: bindClientId,
          categoriesJson: JSON.stringify([gmb.primaryCategory, ...(gmb.additionalCategories || [])].filter(Boolean)),
          servicesJson: JSON.stringify([]),
          hoursJson: JSON.stringify([]),
          attributesJson: JSON.stringify({}),
        },
      });

      const mapUrl = gmb.mapUrl || resolveGbpMapUrl({
        metadata: gmb.placeId ? { placeId: gmb.placeId } : null,
        googleLocationId: gmb.googleLocationId,
        name: gmb.name,
        latitude: gmb.latitude,
        longitude: gmb.longitude,
      });

      // Create GoogleBusinessProfile record (links Location to GMB)
      await db.googleBusinessProfile.create({
        data: {
          googleLocationId: gmb.googleLocationId,
          locationId: location.id,
          googleAccountId: googleAccount?.id || null,
          profileName: gmb.name,
          primaryCategory: gmb.primaryCategory || "Auto Repair Shop",
          additionalCategoriesJson: JSON.stringify(gmb.additionalCategories || []),
          averageRating: gmb.averageRating || 0,
          totalReviews: gmb.totalReviews || 0,
          verificationState: gmb.verificationState === "verified" ? "verified" : "unverified",
          profileStatus: "active",
          mapUrl,
        },
      });

      // Create default business hours (if not provided by GMB)
      const defaultHours = [
        { dayOfWeek: 1, openTime: "10:00", closeTime: "20:00", isClosed: false },
        { dayOfWeek: 2, openTime: "10:00", closeTime: "20:00", isClosed: false },
        { dayOfWeek: 3, openTime: "10:00", closeTime: "20:00", isClosed: false },
        { dayOfWeek: 4, openTime: "10:00", closeTime: "20:00", isClosed: false },
        { dayOfWeek: 5, openTime: "10:00", closeTime: "20:00", isClosed: false },
        { dayOfWeek: 6, openTime: "10:00", closeTime: "21:00", isClosed: false },
        { dayOfWeek: 0, openTime: "11:00", closeTime: "18:00", isClosed: false },
      ];
      for (const h of defaultHours) {
        await db.businessHour.create({ data: { locationId: location.id, ...h } });
      }

      // Create categories from GMB data
      if (gmb.primaryCategory) {
        await db.businessCategory.create({
          data: { locationId: location.id, categoryName: gmb.primaryCategory, isPrimary: true },
        });
      }
      for (const cat of gmb.additionalCategories || []) {
        await db.businessCategory.create({
          data: { locationId: location.id, categoryName: cat, isPrimary: false },
        });
      }

      // Create default attributes
      const defaultAttrs = [
        { attributeName: "Wheelchair Accessible", attributeValue: "true" },
        { attributeName: "Appointments Required", attributeValue: "true" },
        { attributeName: "Onsite Services", attributeValue: "true" },
      ];
      for (const a of defaultAttrs) {
        await db.businessAttribute.create({ data: { locationId: location.id, ...a } });
      }

      await refreshLocationScores(location.id, { writeAudit: true });

      // RightChoice-style: pull existing GMB product catalog into MyFNG DB
      try {
        await syncGoogleProductsForLocation(location.id);
      } catch {
        // Product import is best-effort — location import should still succeed
      }

      imported.push({ id: location.id, name: gmb.name, city });
    } catch (e: any) {
      errors.push({ name: gmb.name, error: e.message });
    }
  }

  // Audit log
  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "location.import",
    entity: "location",
    newValue: { imported: imported.length, errors: errors.length, names: imported.map((i) => i.name) },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  const message = imported.length > 0
    ? `${imported.length} location(s) imported successfully from Google Business Profile.`
    : "No locations were imported.";

  return ok({ imported, errors, count: imported.length }, message);
}
