import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import {
  getValidAccessToken,
  googleServiceStatus,
  updateGoogleBusinessProfile,
} from "@/lib/google-service";
import { requireClientAuth } from "@/lib/client-auth";
import { listActiveBusinessPhotos } from "@/lib/business-photo-db";
import {
  hasChatLink,
  hasMenuLink,
  hasSocialLinks,
  parseLocationAttributes,
} from "@/lib/location-attributes";
import { merchantProductWhere } from "@/lib/content-completeness";

export const dynamic = "force-dynamic";

function isLogoCategory(category: string | null | undefined): boolean {
  return category === "PROFILE" || category === "LOGO";
}

function isCoverCategory(category: string | null | undefined): boolean {
  return category === "COVER" || category === "COVER_PHOTO";
}

interface FieldCheck {
  field: string;
  label: string;
  missing: number;
  total: number;
  missingLocationIds: string[];
  avgCount?: number;
  avgWords?: number;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.view")) return forbidden();

  const url = new URL(req.url);
  const locationIds = url.searchParams.get("locationIds")?.split(",").filter(Boolean) || undefined;

  const scoped = scopeLocationIds(user, undefined);
  const where: any = { status: "active" };
  if (scoped) where.id = { in: scoped };
  if (locationIds) {
    where.id = scoped
      ? { in: scoped.filter((id) => locationIds.includes(id)) }
      : { in: locationIds };
  }

  const locations = await db.location.findMany({
    where,
    select: {
      id: true,
      phone: true,
      website: true,
      hoursJson: true,
      attributesJson: true,
    },
  });

  const total = locations.length;
  const locIds = locations.map((l) => l.id);

  const [
    businessInfos,
    categories,
    products,
    services,
    posts,
    businessHours,
    gbpAttributes,
    googleProfiles,
  ] = await Promise.all([
    db.businessInformation.findMany({
      where: { locationId: { in: locIds } },
      select: { locationId: true, description: true, openingHoursJson: true, website: true, appointmentUrl: true },
    }),
    db.businessCategory.findMany({
      where: { locationId: { in: locIds } },
      select: { locationId: true, isPrimary: true, categoryName: true },
    }),
    db.product.findMany({
      where: merchantProductWhere(locIds),
      select: { locationId: true },
    }),
    db.service.findMany({
      where: { locationId: { in: locIds }, status: "active" },
      select: { locationId: true },
    }),
    db.post.findMany({
      where: { locationId: { in: locIds }, status: "published" },
      select: { locationId: true },
    }),
    db.businessHour.findMany({
      where: { locationId: { in: locIds } },
      select: { locationId: true },
    }),
    db.businessAttribute.findMany({
      where: { locationId: { in: locIds } },
      select: { locationId: true },
    }),
    db.googleBusinessProfile.findMany({
      where: { locationId: { in: locIds } },
      select: { locationId: true, primaryCategory: true },
    }),
  ]);

  const photos = await listActiveBusinessPhotos(locIds);

  const bizInfoMap = new Map(businessInfos.map((b) => [b.locationId, b]));

  const photosByLoc = groupItems(photos, "locationId");
  const productsByLoc = groupCount(products, "locationId");
  const servicesByLoc = groupCount(services, "locationId");
  const postsByLoc = groupCount(posts, "locationId");
  const hoursByLoc = groupCount(businessHours, "locationId");
  const gbpAttrsByLoc = groupCount(gbpAttributes, "locationId");
  const primaryCategoryByLoc = new Map(
    googleProfiles
      .filter((g) => g.primaryCategory?.trim())
      .map((g) => [g.locationId, g.primaryCategory!.trim()]),
  );
  const primaryCatRows = categories.filter((c) => c.isPrimary);
  const primaryCatByLocFromTable = new Map(primaryCatRows.map((c) => [c.locationId, c.categoryName]));

  // ─── Core Info checks ───────────────────────────────────────────────

  const phoneMissing: string[] = [];
  const websiteMissing: string[] = [];
  const appointmentMissing: string[] = [];
  const hoursMissing: string[] = [];
  const attributesMissing: string[] = [];
  const socialLinksMissing: string[] = [];
  const chatLinkMissing: string[] = [];
  const menuLinkMissing: string[] = [];
  const photosMissing: string[] = [];
  const coverPhotoMissing: string[] = [];
  const logoMissing: string[] = [];
  const videosMissing: string[] = [];
  const categoriesMissing: string[] = [];
  const primaryCategoryMissing: string[] = [];

  let totalPhotoCount = 0;
  let totalVideoCount = 0;

  for (const loc of locations) {
    const info = bizInfoMap.get(loc.id);

    if (!loc.phone?.trim()) phoneMissing.push(loc.id);

    const hasWebsite = loc.website?.trim() || info?.website?.trim();
    if (!hasWebsite) websiteMissing.push(loc.id);

    if (!info?.appointmentUrl?.trim()) appointmentMissing.push(loc.id);

    const hasHours = loc.hoursJson?.trim() || info?.openingHoursJson?.trim() || (hoursByLoc.get(loc.id) ?? 0) > 0;
    if (!hasHours) hoursMissing.push(loc.id);

    if ((gbpAttrsByLoc.get(loc.id) ?? 0) === 0) {
      attributesMissing.push(loc.id);
    }

    const attrs = parseLocationAttributes(loc.attributesJson);
    if (!hasSocialLinks(attrs)) socialLinksMissing.push(loc.id);
    if (!hasChatLink(attrs)) chatLinkMissing.push(loc.id);
    if (!hasMenuLink(attrs)) menuLinkMissing.push(loc.id);

    const additionalCats = categories.filter((c) => c.locationId === loc.id && !c.isPrimary).length;
    if (additionalCats < 1) categoriesMissing.push(loc.id);

    const hasPrimary =
      !!primaryCategoryByLoc.get(loc.id) ||
      !!primaryCatByLocFromTable.get(loc.id);
    if (!hasPrimary) primaryCategoryMissing.push(loc.id);

    const locPhotos = photosByLoc.get(loc.id) ?? [];
    const photoCount = locPhotos.length;
    totalPhotoCount += photoCount;
    if (photoCount === 0) photosMissing.push(loc.id);

    const hasCover = locPhotos.some((p) => isCoverCategory(p.category));
    if (!hasCover) coverPhotoMissing.push(loc.id);

    const hasLogo = locPhotos.some((p) =>
      isLogoCategory(p.category) ||
      p.imageUrl?.toLowerCase().includes("logo"),
    );
    if (!hasLogo) logoMissing.push(loc.id);

    const videoCount = locPhotos.filter((p) =>
      p.imageUrl?.toLowerCase().match(/\.(mp4|mov|avi|webm|video)/) ||
      p.source === "manual",
    ).length;
    totalVideoCount += videoCount;
    if (videoCount === 0) videosMissing.push(loc.id);
  }

  // ─── Content checks ─────────────────────────────────────────────────

  const descriptionMissing: string[] = [];
  let totalWords = 0;
  let descCount = 0;

  for (const loc of locations) {
    const info = bizInfoMap.get(loc.id);
    const desc = info?.description?.trim();
    if (!desc || desc.length < 10) {
      descriptionMissing.push(loc.id);
    } else {
      totalWords += desc.split(/\s+/).length;
      descCount++;
    }
  }

  const servicesMissing: string[] = [];
  const productsMissing: string[] = [];
  const postsMissing: string[] = [];
  let totalServiceCount = 0;
  let totalProductCount = 0;
  let totalPostCount = 0;

  for (const id of locIds) {
    const sc = servicesByLoc.get(id) ?? 0;
    totalServiceCount += sc;
    if (sc === 0) servicesMissing.push(id);

    const pc = productsByLoc.get(id) ?? 0;
    totalProductCount += pc;
    if (pc === 0) productsMissing.push(id);

    const postCount = postsByLoc.get(id) ?? 0;
    totalPostCount += postCount;
    if (postCount === 0) postsMissing.push(id);
  }

  // ─── Build response ─────────────────────────────────────────────────

  const coreInfo: FieldCheck[] = [
    { field: "phone", label: "Phone Number", missing: phoneMissing.length, total, missingLocationIds: phoneMissing },
    { field: "primaryCategory", label: "Primary Category", missing: primaryCategoryMissing.length, total, missingLocationIds: primaryCategoryMissing },
    { field: "categories", label: "Add. Categories", missing: categoriesMissing.length, total, missingLocationIds: categoriesMissing },
    { field: "website", label: "Website Link", missing: websiteMissing.length, total, missingLocationIds: websiteMissing },
    { field: "appointment", label: "Appointment Link", missing: appointmentMissing.length, total, missingLocationIds: appointmentMissing },
    { field: "menu", label: "Menu Link", missing: menuLinkMissing.length, total, missingLocationIds: menuLinkMissing },
    { field: "attributes", label: "Attributes", missing: attributesMissing.length, total, missingLocationIds: attributesMissing },
    { field: "openingDate", label: "Opening Date", missing: 0, total, missingLocationIds: [] },
    { field: "hours", label: "Opening Hours", missing: hoursMissing.length, total, missingLocationIds: hoursMissing },
    { field: "photos", label: "Photos", missing: photosMissing.length, total, missingLocationIds: photosMissing, avgCount: total > 0 ? Math.round(totalPhotoCount / total) : 0 },
    { field: "coverPhoto", label: "Cover Photo", missing: coverPhotoMissing.length, total, missingLocationIds: coverPhotoMissing },
    { field: "videos", label: "Videos", missing: videosMissing.length, total, missingLocationIds: videosMissing, avgCount: total > 0 ? Math.round(totalVideoCount / total) : 0 },
    { field: "logo", label: "Business Logo", missing: logoMissing.length, total, missingLocationIds: logoMissing },
    { field: "chatLink", label: "Chat Link", missing: chatLinkMissing.length, total, missingLocationIds: chatLinkMissing },
    { field: "socialLinks", label: "Social Links", missing: socialLinksMissing.length, total, missingLocationIds: socialLinksMissing },
  ];

  const content: FieldCheck[] = [
    { field: "services", label: "Services", missing: servicesMissing.length, total, missingLocationIds: servicesMissing, avgCount: total > 0 ? Math.round(totalServiceCount / total) : 0 },
    { field: "products", label: "Products", missing: productsMissing.length, total, missingLocationIds: productsMissing, avgCount: total > 0 ? Math.round(totalProductCount / total) : 0 },
    { field: "description", label: "Description", missing: descriptionMissing.length, total, missingLocationIds: descriptionMissing, avgWords: descCount > 0 ? Math.round(totalWords / descCount) : 0 },
    { field: "qna", label: "Q&A", missing: total, total, missingLocationIds: locIds, avgCount: 0 },
    { field: "posts", label: "Posts", missing: postsMissing.length, total, missingLocationIds: postsMissing, avgCount: total > 0 ? Math.round(totalPostCount / total) : 0 },
  ];

  const automation: FieldCheck[] = [
    { field: "autoReply", label: "Auto Reply", missing: 0, total, missingLocationIds: [] },
    { field: "profileProtection", label: "Profile Protection", missing: 0, total, missingLocationIds: [] },
  ];

  return ok({ totalLocations: total, coreInfo, content, automation });
}

// POST /api/content-updates — bulk update one field across selected listings
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const field = body.field as string;
  const locationIds = (body.locationIds as string[])?.filter(Boolean) ?? [];
  const payload = (body.payload as Record<string, unknown>) ?? {};

  if (!field || locationIds.length === 0) {
    return fail("field and locationIds are required");
  }

  const scoped = scopeLocationIds(user, undefined);
  const allowedIds = scoped
    ? locationIds.filter((id) => scoped.includes(id))
    : locationIds;

  if (allowedIds.length === 0) return forbidden("No locations in scope");

  let updated = 0;
  let failed = 0;

  for (const id of allowedIds) {
    try {
      await applyContentFieldUpdate(id, field, payload);
      updated++;
    } catch {
      failed++;
    }
  }

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "content.bulk_update",
    entity: "content_update",
    entityId: field,
    newValue: { field, locationIds: allowedIds, payload, updated, failed },
    status: failed > 0 && updated === 0 ? "failed" : "success",
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok({ updated, failed, field });
}

async function applyContentFieldUpdate(
  locationId: string,
  field: string,
  payload: Record<string, unknown>,
) {
  const location = await db.location.findUnique({
    where: { id: locationId },
    include: { googleProfiles: { include: { businessInfo: true } } },
  });
  if (!location) throw new Error("Location not found");

  const gbp = location.googleProfiles[0];
  const value = typeof payload.value === "string" ? payload.value : "";
  const locData: Record<string, string> = {};
  const bizData: Record<string, string> = {};
  const googleUpdates: Record<string, unknown> = {};

  switch (field) {
    case "phone":
      locData.phone = value;
      googleUpdates.phone = value;
      break;
    case "websiteLink":
      locData.website = value;
      bizData.website = value;
      googleUpdates.website = value;
      break;
    case "appointmentLink":
      bizData.appointmentUrl = value;
      googleUpdates.appointmentUrl = value;
      break;
    case "description":
      bizData.description = value;
      googleUpdates.description = value;
      break;
    case "menuLink":
    case "chatLink":
      await mergeAttributesJson(location, { [field]: value });
      break;
    case "attributes":
      await mergeAttributesJson(location, {
        amenities: value.split(",").map((s) => s.trim()).filter(Boolean),
      });
      break;
    case "socialLinks": {
      const social = payload.social as Record<string, string> | undefined;
      if (social) await mergeAttributesJson(location, { socialLinks: social });
      break;
    }
    case "additionalCategories": {
      const names = value.split(",").map((s) => s.trim()).filter(Boolean);
      if (names.length > 0) {
        googleUpdates.categories = {
          primaryDisplayName: names[0],
          additionalDisplayNames: names.slice(1),
        };
      }
      break;
    }
    case "primaryCategory": {
      googleUpdates.categories = { primaryDisplayName: value };
      await db.businessCategory.deleteMany({ where: { locationId, isPrimary: true } });
      await db.businessCategory.create({
        data: { locationId, categoryName: value, isPrimary: true },
      });
      if (gbp) {
        await db.googleBusinessProfile.update({
          where: { id: gbp.id },
          data: { primaryCategory: value },
        });
      }
      break;
    }
    case "businessStatus":
      googleUpdates.status = value;
      break;
    case "openingDate":
      bizData.openingDate = value;
      break;
    case "openingHours":
      locData.hoursJson = JSON.stringify({ text: value });
      bizData.openingHoursJson = JSON.stringify({ text: value });
      break;
    case "specialHours":
      await mergeAttributesJson(location, { specialHours: value });
      break;
    case "foodOrdering":
      await mergeAttributesJson(location, { foodOrderingLink: value });
      break;
    case "services": {
      const names = value.split(",").map((s) => s.trim()).filter(Boolean);
      for (const name of names) {
        await db.service.create({
          data: { locationId, serviceName: name, status: "active" },
        });
      }
      break;
    }
    default:
      throw new Error(`Unsupported field: ${field}`);
  }

  if (Object.keys(locData).length > 0) {
    await db.location.update({ where: { id: locationId }, data: locData });
  }

  if (gbp && Object.keys(bizData).length > 0) {
    if (gbp.businessInfo) {
      await db.businessInformation.update({
        where: { profileId: gbp.id },
        data: bizData,
      });
    } else {
      await db.businessInformation.create({
        data: { profileId: gbp.id, locationId, ...bizData },
      });
    }
  }

  if (gbp && googleServiceStatus.isConfigured && Object.keys(googleUpdates).length > 0) {
    const authCheck = await requireClientAuth(locationId, "profile.update");
    if (authCheck.ok) {
      const accessToken = await getValidAccessToken();
      if (accessToken) {
        await updateGoogleBusinessProfile(accessToken, gbp.googleLocationId, googleUpdates);
      }
    }
  }
}

function mergeAttributesJson(
  location: { id: string; attributesJson: string | null },
  patch: Record<string, unknown>,
) {
  let current: Record<string, unknown> = {};
  try {
    if (location.attributesJson) current = JSON.parse(location.attributesJson);
  } catch {
    current = {};
  }
  const merged = { ...current, ...patch };
  return db.location.update({
    where: { id: location.id },
    data: { attributesJson: JSON.stringify(merged) },
  });
}

function groupCount<T extends Record<string, any>>(items: T[], key: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = item[key] as string;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

function groupItems<T extends Record<string, any>>(items: T[], key: string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = item[key] as string;
    const arr = map.get(k) ?? [];
    arr.push(item);
    map.set(k, arr);
  }
  return map;
}
