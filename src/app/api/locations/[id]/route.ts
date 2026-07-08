import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, notFound, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { updateGoogleBusinessProfile, getValidAccessToken, googleServiceStatus } from "@/lib/google-service";

export const dynamic = "force-dynamic";

// GET /api/locations/[id] — full location detail with business info, hours, services, categories, attributes, photos, timeline, health breakdown
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.view")) return forbidden();

  const { id } = await params;
  // Scope check for branch managers
  const scoped = scopeLocationIds(user, id);
  if (scoped && !scoped.includes(id)) return forbidden("Location out of scope");

  const location = await db.location.findUnique({
    where: { id },
    include: {
      googleProfiles: { include: { businessInfo: true } },
      categories: true,
      services: true,
      products: true,
      attributes: true,
      hours: { orderBy: { dayOfWeek: "asc" } },
      specialHours: { orderBy: { date: "asc" } },
      photos: { where: { status: "active" }, orderBy: { createdAt: "desc" } },
      seoAudits: { orderBy: { auditedAt: "desc" }, take: 1 },
    },
  });
  if (!location) return notFound("Location not found");

  // Profile completeness checklist (doc 07 §14)
  const gbp = location.googleProfiles[0];
  const completeness = {
    businessName: !!location.name,
    phone: !!location.phone,
    website: !!location.website,
    description: !!gbp?.businessInfo?.description,
    categories: location.categories.length > 0,
    services: location.services.length > 0,
    photos: location.photos.length > 0,
    businessHours: location.hours.length > 0,
    attributes: location.attributes.length > 0,
    verified: gbp?.verificationState === "verified",
  };
  const completenessScore = Math.round((Object.values(completeness).filter(Boolean).length / Object.keys(completeness).length) * 100);

  // Health score breakdown (doc 07 §13)
  const reviewResponseRate = location.reviewCount > 0
    ? Math.round((await db.review.count({ where: { locationId: id, replyStatus: "replied" } })) / location.reviewCount * 100)
    : 0;
  const recentPosts = await db.post.count({ where: { locationId: id, status: "published", publishedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } });
  const healthBreakdown = {
    googleRating: Math.min(100, Math.round((location.avgRating / 5) * 100)),
    reviewResponseRate,
    profileCompleteness: completenessScore,
    photos: Math.min(100, location.photos.length * 10),
    businessHoursAccuracy: location.hours.length === 7 ? 100 : Math.round((location.hours.length / 7) * 100),
    servicesAdded: Math.min(100, location.services.length * 15),
    recentPosts: Math.min(100, recentPosts * 20),
    seoScore: location.visibilityScore,
  };

  // Timeline (recent activity for this location) — from audit logs + sync logs
  const [recentReviews, recentPostsData, recentSyncLogs] = await Promise.all([
    db.review.findMany({ where: { locationId: id }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, authorName: true, rating: true, createdAt: true, replyStatus: true } }),
    db.post.findMany({ where: { locationId: id }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, title: true, status: true, createdAt: true, publishedAt: true } }),
    db.syncLog.findMany({ where: { locationId: id }, orderBy: { startedAt: "desc" }, take: 5 }),
  ]);

  const timeline = [
    ...recentReviews.map(r => ({ type: "review", title: `Review from ${r.authorName}`, subtitle: `${r.rating}★ · ${r.replyStatus}`, timestamp: r.createdAt.toISOString() })),
    ...recentPostsData.map(p => ({ type: "post", title: p.title, subtitle: p.status, timestamp: (p.publishedAt ?? p.createdAt).toISOString() })),
    ...recentSyncLogs.map(s => ({ type: "sync", title: `Sync: ${s.module}`, subtitle: s.status, timestamp: s.startedAt.toISOString() })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 15);

  // Analytics summary (last 30 days)
  const analyticsAgg = await db.analyticDaily.aggregate({
    where: { locationId: id, date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    _sum: { searchViews: true, mapsViews: true, websiteClicks: true, phoneCalls: true, directionRequests: true },
  });

  return ok({
    location: {
      id: location.id,
      locationCode: location.locationCode,
      name: location.name,
      city: location.city,
      region: location.region,
      state: location.state,
      pincode: location.pincode,
      address: location.address,
      phone: location.phone,
      email: location.email,
      website: location.website,
      timezone: location.timezone,
      latitude: location.latitude,
      longitude: location.longitude,
      status: location.status,
      syncStatus: location.syncStatus,
      lastSyncedAt: location.lastSyncedAt?.toISOString() ?? null,
      avgRating: location.avgRating,
      reviewCount: location.reviewCount,
      healthScore: location.healthScore,
      visibilityScore: location.visibilityScore,
      createdAt: location.createdAt.toISOString(),
      updatedAt: location.updatedAt.toISOString(),
    },
    googleProfile: gbp ? {
      id: gbp.id,
      googleLocationId: gbp.googleLocationId,
      profileName: gbp.profileName,
      primaryCategory: gbp.primaryCategory,
      additionalCategories: gbp.additionalCategoriesJson ? JSON.parse(gbp.additionalCategoriesJson) : [],
      averageRating: gbp.averageRating,
      totalReviews: gbp.totalReviews,
      verificationState: gbp.verificationState,
      profileStatus: gbp.profileStatus,
      mapUrl: gbp.mapUrl,
      businessInfo: gbp.businessInfo ? {
        description: gbp.businessInfo.description,
        website: gbp.businessInfo.website,
        appointmentUrl: gbp.businessInfo.appointmentUrl,
      } : null,
    } : null,
    categories: location.categories.map(c => ({ id: c.id, name: c.categoryName, isPrimary: c.isPrimary })),
    services: location.services.map(s => ({ id: s.id, name: s.serviceName, description: s.description, category: s.category, status: s.status })),
    products: location.products.map(p => ({ id: p.id, name: p.productName, description: p.description, category: p.category, price: p.price, currency: p.currency, imageUrl: p.imageUrl, status: p.status })),
    attributes: location.attributes.map(a => ({ id: a.id, name: a.attributeName, value: a.attributeValue })),
    hours: location.hours.map(h => ({ id: h.id, dayOfWeek: h.dayOfWeek, openTime: h.openTime, closeTime: h.closeTime, isClosed: h.isClosed })),
    specialHours: location.specialHours.map(s => ({ id: s.id, date: s.date.toISOString(), openTime: s.openTime, closeTime: s.closeTime, isClosed: s.isClosed })),
    photos: location.photos.map(p => ({ id: p.id, imageUrl: p.imageUrl, thumbnailUrl: p.thumbnailUrl, source: p.source, createdAt: p.createdAt.toISOString() })),
    completeness: { score: completenessScore, checklist: completeness },
    healthBreakdown,
    timeline,
    analytics30d: analyticsAgg._sum,
    seoAudit: location.seoAudits[0] ? {
      auditScore: location.seoAudits[0].auditScore,
      profileStrength: location.seoAudits[0].profileStrength,
      missingPhotos: location.seoAudits[0].missingPhotos,
      missingServices: location.seoAudits[0].missingServices,
      recommendations: location.seoAudits[0].recommendationsJson ? JSON.parse(location.seoAudits[0].recommendationsJson) : [],
      auditedAt: location.seoAudits[0].auditedAt.toISOString(),
    } : null,
  });
}

// PUT /api/locations/[id] — update location + business info (doc 07 §8)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.manage")) return forbidden();

  const { id } = await params;
  const scoped = scopeLocationIds(user, id);
  if (scoped && !scoped.includes(id)) return forbidden("Location out of scope");

  const body = await req.json().catch(() => ({}));
  const location = await db.location.findUnique({ where: { id }, include: { googleProfiles: { include: { businessInfo: true } } } });
  if (!location) return notFound("Location not found");

  const prev = { name: location.name, phone: location.phone, website: location.website, address: location.address };
  const data: any = {};
  if (body.name) data.name = body.name;
  if (body.phone !== undefined) data.phone = body.phone;
  if (body.email !== undefined) data.email = body.email;
  if (body.website !== undefined) data.website = body.website;
  if (body.address !== undefined) data.address = body.address;
  if (body.status !== undefined) data.status = body.status;
  if (body.latitude !== undefined) data.latitude = body.latitude;
  if (body.longitude !== undefined) data.longitude = body.longitude;

  await db.location.update({ where: { id }, data });

  // Update business info if provided
  const gbp = location.googleProfiles[0];
  if (gbp && body.businessInfo) {
    const bi = body.businessInfo;
    if (gbp.businessInfo) {
      await db.businessInformation.update({
        where: { profileId: gbp.id },
        data: {
          description: bi.description !== undefined ? bi.description : gbp.businessInfo.description,
          website: bi.website !== undefined ? bi.website : gbp.businessInfo.website,
          appointmentUrl: bi.appointmentUrl !== undefined ? bi.appointmentUrl : gbp.businessInfo.appointmentUrl,
        },
      });
    } else {
      await db.businessInformation.create({
        data: {
          profileId: gbp.id,
          locationId: id,
          description: bi.description ?? null,
          website: bi.website ?? null,
          appointmentUrl: bi.appointmentUrl ?? null,
        },
      });
    }
  }

  // Update hours if provided (doc 07 §9)
  if (body.hours && Array.isArray(body.hours)) {
    await db.businessHour.deleteMany({ where: { locationId: id } });
    for (const h of body.hours) {
      await db.businessHour.create({
        data: { locationId: id, dayOfWeek: h.dayOfWeek, openTime: h.openTime ?? null, closeTime: h.closeTime ?? null, isClosed: h.isClosed ?? false },
      });
    }
  }

  // ─── Push changes to REAL Google Business Profile ──────────────────────
  const googleErrors: string[] = [];
  if (gbp && googleServiceStatus.isConfigured) {
    const accessToken = await getValidAccessToken();
    if (accessToken) {
      try {
        // Build Google update payload from what changed
        const googleUpdates: any = {};

        if (body.name) googleUpdates.title = body.name;
        if (body.phone !== undefined) googleUpdates.phone = body.phone;
        if (body.website !== undefined) googleUpdates.website = body.website;
        if (body.businessInfo?.description !== undefined) googleUpdates.description = body.businessInfo.description;
        if (body.businessInfo?.appointmentUrl !== undefined) googleUpdates.appointmentUrl = body.businessInfo.appointmentUrl;

        // Convert hours to Google format
        if (body.hours && Array.isArray(body.hours)) {
          const dayNames = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
          googleUpdates.hours = body.hours
            .filter((h: any) => !h.isClosed && h.openTime && h.closeTime)
            .map((h: any) => {
              const [oh, om] = h.openTime.split(":").map(Number);
              const [ch, cm] = h.closeTime.split(":").map(Number);
              return {
                dayOfWeek: dayNames[h.dayOfWeek] || "MONDAY",
                openTime: { hours: oh, minutes: om },
                closeTime: { hours: ch, minutes: cm },
              };
            });
        }

        // Only call Google API if there are fields to update
        if (Object.keys(googleUpdates).length > 0) {
          await updateGoogleBusinessProfile(accessToken, gbp.googleLocationId, googleUpdates);
        }
      } catch (e: any) {
        googleErrors.push(e.message);
      }
    }
  }

  await logAudit({
    userId: user.id, userName: user.name, action: "location.update", entity: "location", entityId: id,
    previousValue: prev, newValue: data,
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  const message = googleErrors.length > 0
    ? `Location updated locally. Failed to sync to Google: ${googleErrors.join("; ")}`
    : (gbp && googleServiceStatus.isConfigured
      ? "Location updated and synced to Google Business Profile."
      : "Location updated locally. Connect Google to sync changes to GMB.");

  return ok({ id, googleSynced: googleErrors.length === 0, googleErrors }, message);
}
