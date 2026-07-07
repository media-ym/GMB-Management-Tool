// ═══════════════════════════════════════════════════════════════════════════
// Google Business Profile Service Layer — Production Only
// All Google API calls are real. Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.
// ═══════════════════════════════════════════════════════════════════════════

import { db } from "./db";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/google/callback`;
export const IS_CONFIGURED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

const GBP_SCOPES = [
  "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/business.info",
  "openid",
  "email",
  "profile",
].join(" ");

// ─── OAuth Flow ───────────────────────────────────────────────────────────

export function getGoogleAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: GBP_SCOPES,
    access_type: "offline",
    prompt: "consent",
    ...(state ? { state } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
}> {
  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${err}`);
  }

  const tokens = await res.json();
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: Date.now() + (tokens.expires_in ?? 3600) * 1000,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiryDate: number;
}> {
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const tokens = await res.json();
  return {
    accessToken: tokens.access_token,
    expiryDate: Date.now() + (tokens.expires_in ?? 3600) * 1000,
  };
}

export async function getValidAccessToken(): Promise<string | null> {
  const account = await db.googleAccount.findFirst();
  if (!account) return null;

  // Check if token is still valid (5 min buffer)
  if (account.tokenExpiry && new Date(account.tokenExpiry) > new Date(Date.now() + 5 * 60 * 1000)) {
    return account.accessToken;
  }

  // Try to refresh
  if (account.refreshToken) {
    try {
      const { accessToken, expiryDate } = await refreshAccessToken(account.refreshToken);
      await db.googleAccount.update({
        where: { id: account.id },
        data: { accessToken, tokenExpiry: new Date(expiryDate), status: "active" },
      });
      return accessToken;
    } catch (e) {
      console.error("Token refresh failed:", e);
      await db.googleAccount.update({ where: { id: account.id }, data: { status: "expired" } });
      return null;
    }
  }

  return null;
}

// ─── Google Business Profile API Calls ────────────────────────────────────

const GBP_API_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
const GBP_PERF_BASE = "https://businessprofileperformance.googleapis.com/v1";
const GBP_ACCOUNTS_BASE = "https://mybusinessaccountmanagement.googleapis.com/v1";

export async function listGoogleAccounts(accessToken: string): Promise<any[]> {
  const res = await fetch(`${GBP_ACCOUNTS_BASE}/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to list accounts: ${res.status}`);
  const data = await res.json();
  return data.accounts ?? [];
}

export async function listGoogleLocations(accessToken: string, accountName: string): Promise<any[]> {
  const res = await fetch(`${GBP_API_BASE}/${accountName}/locations?readMask=name,title,storeCode,latlng,metadata,profile,regularHours,specialHours,serviceItems,categories,phoneNumbers,websiteUri,openInfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to list locations: ${res.status}`);
  const data = await res.json();
  return data.locations ?? [];
}

export async function getBusinessProfile(accessToken: string, locationName: string): Promise<any> {
  const res = await fetch(`${GBP_API_BASE}/${locationName}?readMask=title,storeCode,latlng,metadata,profile,regularHours,categories,phoneNumbers,websiteUri,openInfo,serviceItems,attributes`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to get profile: ${res.status}`);
  return res.json();
}

export async function listReviews(accessToken: string, locationName: string, pageSize = 50): Promise<any[]> {
  const res = await fetch(`${GBP_API_BASE}/${locationName}/reviews?pageSize=${pageSize}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to list reviews: ${res.status}`);
  const data = await res.json();
  return data.reviews ?? [];
}

export async function replyToReview(accessToken: string, reviewName: string, replyText: string): Promise<any> {
  const res = await fetch(`https://mybusiness.googleapis.com/v4/${reviewName}/reply`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ comment: replyText }),
  });
  if (!res.ok) throw new Error(`Failed to publish reply: ${res.status}`);
  return res.json();
}

export async function createGooglePost(accessToken: string, locationName: string, post: any): Promise<any> {
  const res = await fetch(`${GBP_API_BASE}/${locationName}/localPosts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(post),
  });
  if (!res.ok) throw new Error(`Failed to create post: ${res.status}`);
  return res.json();
}

// ─── Performance Metrics (real Google Business Performance API) ───────────

export async function getPerformanceMetrics(
  accessToken: string,
  locationName: string,
  startDate: { year: number; month: number; day: number },
  endDate: { year: number; month: number; day: number },
  metricType: string = "BUSINESS_IMPRESSIONS_DESKTOP_MAPS"
): Promise<any[]> {
  const url = new URL(`${GBP_PERF_BASE}/locations/${locationName}:getDailyMetricsTimeSeries`);
  url.searchParams.set("dailyRange.startDate.date.year", String(startDate.year));
  url.searchParams.set("dailyRange.startDate.date.month", String(startDate.month));
  url.searchParams.set("dailyRange.startDate.date.day", String(startDate.day));
  url.searchParams.set("dailyRange.endDate.date.year", String(endDate.year));
  url.searchParams.set("dailyRange.endDate.date.month", String(endDate.month));
  url.searchParams.set("dailyRange.endDate.date.day", String(endDate.day));
  url.searchParams.set("dailyMetrics", metricType);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to get performance metrics: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.timeSeries?.datedValues ?? [];
}

// Fetch ALL 5 metric types for a date range and return as daily aggregates
export async function getFullPerformanceMetrics(
  accessToken: string,
  locationName: string,
  daysBack: number = 30
): Promise<{ date: Date; searchViews: number; mapsViews: number; websiteClicks: number; phoneCalls: number; directionRequests: number }[]> {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - daysBack);

  const startDate = { year: start.getFullYear(), month: start.getMonth() + 1, day: start.getDate() };
  const endDate = { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() };

  // Google API returns one metric type per call, so fetch all 5 in parallel
  const metricTypes = {
    searchViews: "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
    mapsViews: "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
    websiteClicks: "WEBSITE_CLICKS",
    phoneCalls: "CALL_CLICKS",
    directionRequests: "BUSINESS_DIRECTION_REQUESTS",
  };

  const [searchRes, mapsRes, websiteRes, callRes, directionRes] = await Promise.allSettled([
    getPerformanceMetrics(accessToken, locationName, startDate, endDate, metricTypes.searchViews),
    getPerformanceMetrics(accessToken, locationName, startDate, endDate, metricTypes.mapsViews),
    getPerformanceMetrics(accessToken, locationName, startDate, endDate, metricTypes.websiteClicks),
    getPerformanceMetrics(accessToken, locationName, startDate, endDate, metricTypes.phoneCalls),
    getPerformanceMetrics(accessToken, locationName, startDate, endDate, metricTypes.directionRequests),
  ]);

  // Build a map of date → metrics
  const dailyMap = new Map<string, { date: Date; searchViews: number; mapsViews: number; websiteClicks: number; phoneCalls: number; directionRequests: number }>();

  function populate(result: PromiseSettledResult<any[]>, key: keyof typeof metricTypes) {
    if (result.status !== "fulfilled") return;
    for (const entry of result.value) {
      const dateStr = entry.date?.year
        ? `${entry.date.year}-${String(entry.date.month).padStart(2, "0")}-${String(entry.date.day).padStart(2, "0")}`
        : null;
      if (!dateStr) continue;
      if (!dailyMap.has(dateStr)) {
        dailyMap.set(dateStr, {
          date: new Date(dateStr),
          searchViews: 0, mapsViews: 0, websiteClicks: 0, phoneCalls: 0, directionRequests: 0,
        });
      }
      const day = dailyMap.get(dateStr)!;
      const value = entry.value ?? 0;
      (day as any)[key] += value;
    }
  }

  populate(searchRes, "searchViews");
  populate(mapsRes, "mapsViews");
  populate(websiteRes, "websiteClicks");
  populate(callRes, "phoneCalls");
  populate(directionRes, "directionRequests");

  return Array.from(dailyMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ─── Sync real analytics data into DB ─────────────────────────────────────

export async function syncLocationAnalytics(locationId: string, daysBack: number = 30): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  const accessToken = await getValidAccessToken();
  if (!accessToken) return { synced: 0, errors: ["No valid Google access token"] };

  const gbp = await db.googleBusinessProfile.findFirst({ where: { locationId } });
  if (!gbp) return { synced: 0, errors: ["No Google Business Profile linked"] };

  try {
    const dailyMetrics = await getFullPerformanceMetrics(accessToken, gbp.googleLocationId, daysBack);
    let synced = 0;

    for (const day of dailyMetrics) {
      const dateKey = day.date;
      dateKey.setHours(0, 0, 0, 0);

      // Upsert — if record exists for this location+date, update; otherwise create
      await db.analyticDaily.upsert({
        where: { locationId_date: { locationId, date: dateKey } },
        create: {
          locationId,
          date: dateKey,
          searchViews: day.searchViews,
          mapsViews: day.mapsViews,
          websiteClicks: day.websiteClicks,
          phoneCalls: day.phoneCalls,
          directionRequests: day.directionRequests,
          bookings: 0,
        },
        update: {
          searchViews: day.searchViews,
          mapsViews: day.mapsViews,
          websiteClicks: day.websiteClicks,
          phoneCalls: day.phoneCalls,
          directionRequests: day.directionRequests,
        },
      });
      synced++;
    }

    return { synced, errors };
  } catch (e: any) {
    return { synced: 0, errors: [e.message] };
  }
}

// ─── Sync Engine ──────────────────────────────────────────────────────────

export async function syncGoogleProfiles(): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return { synced: 0, errors: ["No valid Google access token. Please reconnect Google OAuth."] };
  }

  try {
    const accounts = await listGoogleAccounts(accessToken);
    let synced = 0;

    for (const account of accounts) {
      const locations = await listGoogleLocations(accessToken, account.name);
      for (const loc of locations) {
        try {
          const existing = await db.googleBusinessProfile.findFirst({
            where: { googleLocationId: loc.name },
          });

          const locData = {
            googleLocationId: loc.name,
            profileName: loc.title || "Unknown",
            primaryCategory: loc.categories?.primaryCategory?.displayName || null,
            additionalCategoriesJson: JSON.stringify(loc.categories?.additionalCategories?.map((c: any) => c.displayName) || []),
            averageRating: loc.metadata?.averageRating || 0,
            totalReviews: loc.metadata?.reviewCount || 0,
            verificationState: loc.metadata?.isVerified ? "verified" : "unverified",
            profileStatus: loc.metadata?.canManage ? "active" : "disabled",
            mapUrl: loc.metadata?.mapsUri || null,
          };

          if (existing) {
            await db.googleBusinessProfile.update({ where: { id: existing.id }, data: locData });
          } else {
            await db.googleBusinessProfile.create({ data: { ...locData, locationId: "" } });
          }
          synced++;
        } catch (e: any) {
          errors.push(`Location ${loc.name}: ${e.message}`);
        }
      }
    }

    return { synced, errors };
  } catch (e: any) {
    return { synced: 0, errors: [e.message] };
  }
}

export async function syncGoogleReviews(locationId: string, googleLocationId: string): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  const accessToken = await getValidAccessToken();
  if (!accessToken) return { synced: 0, errors: ["No valid access token"] };

  try {
    const reviews = await listReviews(accessToken, googleLocationId);
    let synced = 0;

    for (const review of reviews) {
      const googleReviewId = review.name;
      const existing = await db.review.findUnique({ where: { googleReviewId } });

      if (!existing) {
        await db.review.create({
          data: {
            locationId,
            googleReviewId,
            authorName: review.reviewer?.displayName || "Anonymous",
            authorPhoto: review.reviewer?.profilePhotoUrl || null,
            rating: review.starRating === "FIVE" ? 5 : review.starRating === "FOUR" ? 4 : review.starRating === "THREE" ? 3 : review.starRating === "TWO" ? 2 : 1,
            text: review.comment || "",
            sentiment: "neutral",
            replyText: review.reviewReply?.comment || null,
            replySource: review.reviewReply ? "manual" : null,
            replyStatus: review.reviewReply ? "replied" : "pending",
            repliedAt: review.reviewReply ? new Date(review.reviewReply.updateTime) : null,
            createdAt: new Date(review.createTime),
          },
        });
        synced++;
      }
    }

    return { synced, errors };
  } catch (e: any) {
    return { synced: 0, errors: [e.message] };
  }
}

// ─── Full Location Sync — fetches ALL real GMB data for one location ──────

export async function syncLocationFull(locationId: string): Promise<{
  success: boolean;
  synced: { reviews: number; photos: number; hours: number; services: number; categories: number };
  errors: string[];
}> {
  const errors: string[] = [];
  const result = { reviews: 0, photos: 0, hours: 0, services: 0, categories: 0 };
  const accessToken = await getValidAccessToken();

  if (!accessToken) {
    return { success: false, synced: result, errors: ["No valid Google access token. Please reconnect Google OAuth."] };
  }

  // Get the GoogleBusinessProfile linked to this location
  const gbp = await db.googleBusinessProfile.findFirst({ where: { locationId } });
  if (!gbp) {
    return { success: false, synced: result, errors: ["No Google Business Profile linked to this location. Import this location from Google first."] };
  }

  const locationName = gbp.googleLocationId; // e.g. "locations/12345"

  try {
    // ─── 1. Fetch full business profile from Google ─────────────────────
    const profile = await getBusinessProfile(accessToken, locationName);

    // Update Location record with real data
    await db.location.update({
      where: { id: locationId },
      data: {
        name: profile.title || gbp.profileName,
        address: formatAddress(profile.address),
        phone: profile.phoneNumbers?.primaryPhone || null,
        website: profile.websiteUri || null,
        latitude: profile.latlng?.latitude || null,
        longitude: profile.latlng?.longitude || null,
        avgRating: profile.metadata?.averageRating || 0,
        reviewCount: profile.metadata?.reviewCount || 0,
        syncStatus: "synced",
        lastSyncedAt: new Date(),
        categoriesJson: JSON.stringify([
          profile.categories?.primaryCategory?.displayName,
          ...(profile.categories?.additionalCategories?.map((c: any) => c.displayName) || []),
        ].filter(Boolean)),
      },
    });

    // Update GoogleBusinessProfile record
    await db.googleBusinessProfile.update({
      where: { id: gbp.id },
      data: {
        profileName: profile.title || gbp.profileName,
        primaryCategory: profile.categories?.primaryCategory?.displayName || gbp.primaryCategory,
        additionalCategoriesJson: JSON.stringify(profile.categories?.additionalCategories?.map((c: any) => c.displayName) || []),
        averageRating: profile.metadata?.averageRating || 0,
        totalReviews: profile.metadata?.reviewCount || 0,
        verificationState: profile.metadata?.isVerified ? "verified" : "unverified",
        profileStatus: profile.metadata?.canManage ? "active" : "disabled",
        mapUrl: profile.metadata?.mapsUri || gbp.mapUrl,
      },
    });

    // ─── 2. Sync Business Hours ─────────────────────────────────────────
    if (profile.regularHours?.periods?.length > 0) {
      // Clear existing hours
      await db.businessHour.deleteMany({ where: { locationId } });
      // Map Google's day codes (0=Sun..6=Sat) to our dayOfWeek
      const dayMap: Record<string, number> = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 };
      for (const period of profile.regularHours.periods) {
        const day = dayMap[period.openDay] ?? 0;
        await db.businessHour.create({
          data: {
            locationId,
            dayOfWeek: day,
            openTime: `${period.openTime?.hours?.toString().padStart(2, "0") || "10"}:${period.openTime?.minutes?.toString().padStart(2, "0") || "00"}`,
            closeTime: `${period.closeTime?.hours?.toString().padStart(2, "0") || "20"}:${period.closeTime?.minutes?.toString().padStart(2, "0") || "00"}`,
            isClosed: false,
          },
        });
        result.hours++;
      }
    }

    // ─── 3. Sync Categories ─────────────────────────────────────────────
    if (profile.categories) {
      await db.businessCategory.deleteMany({ where: { locationId } });
      if (profile.categories.primaryCategory) {
        await db.businessCategory.create({
          data: { locationId, categoryName: profile.categories.primaryCategory.displayName || "Interior Designer", isPrimary: true },
        });
        result.categories++;
      }
      for (const cat of profile.categories.additionalCategories || []) {
        await db.businessCategory.create({
          data: { locationId, categoryName: cat.displayName || "", isPrimary: false },
        });
        result.categories++;
      }
    }

    // ─── 4. Sync Services ───────────────────────────────────────────────
    if (profile.serviceItems?.length > 0) {
      await db.service.deleteMany({ where: { locationId } });
      for (const service of profile.serviceItems) {
        await db.service.create({
          data: {
            locationId,
            serviceName: service.displayName || service.name || "Service",
            description: service.description || null,
            category: service.category || null,
            status: "active",
          },
        });
        result.services++;
      }
    }

    // ─── 5. Sync Reviews ────────────────────────────────────────────────
    try {
      const reviews = await listReviews(accessToken, locationName);
      for (const review of reviews) {
        const googleReviewId = review.name;
        const existing = await db.review.findUnique({ where: { googleReviewId } });
        if (!existing) {
          await db.review.create({
            data: {
              locationId,
              googleReviewId,
              authorName: review.reviewer?.displayName || "Anonymous",
              authorPhoto: review.reviewer?.profilePhotoUrl || null,
              rating: review.starRating === "FIVE" ? 5 : review.starRating === "FOUR" ? 4 : review.starRating === "THREE" ? 3 : review.starRating === "TWO" ? 2 : 1,
              text: review.comment || "",
              sentiment: "neutral",
              replyText: review.reviewReply?.comment || null,
              replySource: review.reviewReply ? "manual" : null,
              replyStatus: review.reviewReply ? "replied" : "pending",
              repliedAt: review.reviewReply ? new Date(review.reviewReply.updateTime) : null,
              createdAt: new Date(review.createTime),
            },
          });
          result.reviews++;
        }
      }
    } catch (e: any) {
      errors.push(`Reviews sync: ${e.message}`);
    }

    // ─── 6. Sync Photos (metadata only — URLs from Google) ──────────────
    try {
      const mediaRes = await fetch(`${GBP_API_BASE}/${locationName}/media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (mediaRes.ok) {
        const mediaData = await mediaRes.json();
        for (const photo of mediaData.media || []) {
          const existing = await db.businessPhoto.findFirst({ where: { googlePhotoId: photo.name } });
          if (!existing) {
            await db.businessPhoto.create({
              data: {
                locationId,
                googlePhotoId: photo.name,
                imageUrl: photo.googleUrl || photo.locationUri || "",
                thumbnailUrl: null,
                source: "google",
                status: "active",
              },
            });
            result.photos++;
          }
        }
      }
    } catch (e: any) {
      errors.push(`Photos sync: ${e.message}`);
    }

    // ─── 7. Sync Analytics (real Google Business Performance API) ────────
    try {
      const analyticsResult = await syncLocationAnalytics(locationId, 30);
      if (analyticsResult.errors.length > 0) {
        errors.push(`Analytics sync: ${analyticsResult.errors.join("; ")}`);
      }
    } catch (e: any) {
      errors.push(`Analytics sync: ${e.message}`);
    }

    return { success: true, synced: result, errors };
  } catch (e: any) {
    return { success: false, synced: result, errors: [e.message] };
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

export const googleServiceStatus = {
  isConfigured: IS_CONFIGURED,
  hasClientSecret: !!GOOGLE_CLIENT_SECRET,
  redirectUri: GOOGLE_REDIRECT_URI,
  mode: IS_CONFIGURED ? "production" : "not_configured",
};
