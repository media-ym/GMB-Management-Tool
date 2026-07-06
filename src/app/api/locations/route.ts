import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import type { LocationWithStats } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.view")) return forbidden();

  const scoped = scopeLocationIds(user);
  const where = scoped ? { id: { in: scoped } } : {};
  const locations = await db.location.findMany({ where, orderBy: { city: "asc" } });

  const data: LocationWithStats[] = locations.map((l) => ({
    id: l.id,
    name: l.name,
    city: l.city,
    region: l.region,
    address: l.address,
    phone: l.phone,
    website: l.website,
    status: l.status as any,
    syncStatus: l.syncStatus as any,
    lastSyncedAt: l.lastSyncedAt?.toISOString() ?? null,
    avgRating: l.avgRating,
    reviewCount: l.reviewCount,
    healthScore: l.healthScore,
    visibilityScore: l.visibilityScore,
    latitude: l.latitude,
    longitude: l.longitude,
  }));

  return ok(data);
}

// POST /api/locations — Create a new location (doc 07 §23)
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.manage")) return forbidden("Only Super Admin and Marketing Manager can add locations.");

  const body = await req.json().catch(() => ({}));
  const { name, locationCode, city, address, phone, email, website, latitude, longitude, pincode } = body;

  // Validation (doc 07 §24)
  if (!name || !name.trim()) return fail("Location name is required");
  if (!city || !city.trim()) return fail("City is required");
  if (!address || !address.trim()) return fail("Address is required");

  // Check duplicate location code
  if (locationCode) {
    const existing = await db.location.findFirst({ where: { locationCode: locationCode.trim() } });
    if (existing) return fail("Location code already exists. Use a unique code.");
  }

  // Create the location
  const location = await db.location.create({
    data: {
      name: name.trim(),
      locationCode: locationCode?.trim() || null,
      city: city.trim(),
      region: "Maharashtra",
      state: "Maharashtra",
      pincode: pincode?.trim() || null,
      address: address.trim(),
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      website: website?.trim() || "https://myfng.in",
      timezone: "Asia/Kolkata",
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      status: "active",
      syncStatus: "pending",
      avgRating: 0,
      reviewCount: 0,
      healthScore: 0,
      visibilityScore: 0,
      categoriesJson: JSON.stringify(["Interior Designer"]),
      servicesJson: JSON.stringify(["Modular Kitchen", "Wardrobe Design", "Full Home Interiors"]),
      hoursJson: JSON.stringify([
        { day: 1, open: "10:00", close: "20:00", closed: false },
        { day: 2, open: "10:00", close: "20:00", closed: false },
        { day: 3, open: "10:00", close: "20:00", closed: false },
        { day: 4, open: "10:00", close: "20:00", closed: false },
        { day: 5, open: "10:00", close: "20:00", closed: false },
        { day: 6, open: "10:00", close: "21:00", closed: false },
        { day: 0, open: "11:00", close: "18:00", closed: false },
      ]),
      attributesJson: JSON.stringify({ wheelchairAccessible: true, appointments: true, onsiteServices: true, parking: true }),
    },
  });

  // Create default business hours entries
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

  // Create default categories
  await db.businessCategory.create({ data: { locationId: location.id, categoryName: "Interior Designer", isPrimary: true } });
  await db.businessCategory.create({ data: { locationId: location.id, categoryName: "Home Improvement Store", isPrimary: false } });
  await db.businessCategory.create({ data: { locationId: location.id, categoryName: "Furniture Store", isPrimary: false } });

  // Create default services
  const defaultServices = [
    { serviceName: "Modular Kitchen", description: "Custom modular kitchens with premium hardware and finishes.", category: "Kitchen" },
    { serviceName: "Wardrobe Design", description: "Sliding and hinged wardrobes with smart storage solutions.", category: "Bedroom" },
    { serviceName: "Full Home Interiors", description: "End-to-end interior design and execution for your home.", category: "Complete" },
    { serviceName: "False Ceiling", description: "POP and gypsum false ceiling with integrated lighting.", category: "Living Room" },
  ];
  for (const s of defaultServices) {
    await db.service.create({ data: { locationId: location.id, ...s, status: "active" } });
  }

  // Create default attributes
  const defaultAttrs = [
    { attributeName: "Wheelchair Accessible", attributeValue: "true" },
    { attributeName: "Appointments Required", attributeValue: "true" },
    { attributeName: "Onsite Services", attributeValue: "true" },
    { attributeName: "Parking Available", attributeValue: "true" },
  ];
  for (const a of defaultAttrs) {
    await db.businessAttribute.create({ data: { locationId: location.id, ...a } });
  }

  // Log the action
  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "location.create",
    entity: "location",
    entityId: location.id,
    newValue: { name, city, address, locationCode },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok({
    id: location.id,
    name: location.name,
    city: location.city,
    locationCode: location.locationCode,
  }, `Location "${name}" created successfully. Default business hours, categories, services, and attributes have been added.`);
}
