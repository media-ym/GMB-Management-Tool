import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";

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

  // Get the connected Google account
  const googleAccount = await db.googleAccount.findFirst();

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

      // Create Location record
      const location = await db.location.create({
        data: {
          name: gmb.name,
          locationCode: gmb.storeCode || null,
          city: gmb.city || "Unknown",
          region: gmb.state || "Maharashtra",
          state: gmb.state || "Maharashtra",
          pincode: gmb.pincode || null,
          address: gmb.address || "",
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
          healthScore: 50, // initial score, will be computed on first audit
          visibilityScore: 40, // initial score
          categoriesJson: JSON.stringify([gmb.primaryCategory, ...(gmb.additionalCategories || [])].filter(Boolean)),
          servicesJson: JSON.stringify([]),
          hoursJson: JSON.stringify([]),
          attributesJson: JSON.stringify({}),
        },
      });

      // Create GoogleBusinessProfile record (links Location to GMB)
      await db.googleBusinessProfile.create({
        data: {
          googleLocationId: gmb.googleLocationId,
          locationId: location.id,
          googleAccountId: googleAccount?.id || null,
          profileName: gmb.name,
          primaryCategory: gmb.primaryCategory || "Interior Designer",
          additionalCategoriesJson: JSON.stringify(gmb.additionalCategories || []),
          averageRating: gmb.averageRating || 0,
          totalReviews: gmb.totalReviews || 0,
          verificationState: gmb.verificationState || "unverified",
          profileStatus: "active",
          mapUrl: `https://maps.google.com/?cid=${gmb.googleLocationId}`,
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

      imported.push({ id: location.id, name: gmb.name, city: gmb.city });
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
