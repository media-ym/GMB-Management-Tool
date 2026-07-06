// ═══════════════════════════════════════════════════════════════════════════
// Google Business Profile Service Layer
// Production-ready Google OAuth + GBP API integration.
// In development: falls back to mock data when GOOGLE_CLIENT_ID is not set.
// In production: makes real Google API calls with OAuth token exchange.
// ═══════════════════════════════════════════════════════════════════════════

import { db } from "./db";

// ─── Configuration ────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/google/callback`;
const IS_CONFIGURED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

const GBP_SCOPES = [
  "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/business.info",
  "openid",
  "email",
  "profile",
].join(" ");

// ─── OAuth Flow ───────────────────────────────────────────────────────────

export function getGoogleAuthUrl(state?: string): string {
  if (!IS_CONFIGURED) {
    // Mock mode — return a placeholder URL that the UI handles
    return `/api/google/callback?mock=true&state=${state || ""}`;
  }
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
  email?: string;
  googleUserId?: string;
}> {
  if (!IS_CONFIGURED) {
    // Mock mode — return fake tokens
    return {
      accessToken: "mock_access_token_" + Date.now(),
      refreshToken: "mock_refresh_token_" + Date.now(),
      expiryDate: Date.now() + 3600 * 1000,
      email: "gmb@myfng.in",
      googleUserId: "mock_user_" + Date.now(),
    };
  }

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
  if (!IS_CONFIGURED || !refreshToken || refreshToken.startsWith("mock_")) {
    return {
      accessToken: "mock_access_token_refreshed_" + Date.now(),
      expiryDate: Date.now() + 3600 * 1000,
    };
  }

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

async function getValidAccessToken(): Promise<string | null> {
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
  if (!IS_CONFIGURED) return []; // Mock mode
  const res = await fetch(`${GBP_ACCOUNTS_BASE}/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to list accounts: ${res.status}`);
  const data = await res.json();
  return data.accounts ?? [];
}

export async function listGoogleLocations(accessToken: string, accountName: string): Promise<any[]> {
  if (!IS_CONFIGURED) return []; // Mock mode
  const res = await fetch(`${GBP_API_BASE}/${accountName}/locations?readMask=name,title,storeCode,latlng,metadata,profile,regularHours,specialHours,serviceItems,categories,phoneNumbers,websiteUri,openInfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to list locations: ${res.status}`);
  const data = await res.json();
  return data.locations ?? [];
}

export async function getBusinessProfile(accessToken: string, locationName: string): Promise<any> {
  if (!IS_CONFIGURED) return null;
  const res = await fetch(`${GBP_API_BASE}/${locationName}?readMask=title,storeCode,latlng,metadata,profile,regularHours,categories,phoneNumbers,websiteUri,openInfo,serviceItems,attributes`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to get profile: ${res.status}`);
  return res.json();
}

export async function listReviews(accessToken: string, locationName: string, pageSize = 50): Promise<any[]> {
  if (!IS_CONFIGURED) return [];
  const res = await fetch(`${GBP_API_BASE}/${locationName}/reviews?pageSize=${pageSize}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to list reviews: ${res.status}`);
  const data = await res.json();
  return data.reviews ?? [];
}

export async function replyToReview(accessToken: string, reviewName: string, replyText: string): Promise<any> {
  if (!IS_CONFIGURED) return { reply: { comment: replyText } };
  const res = await fetch(`https://mybusiness.googleapis.com/v4/${reviewName}/reply`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ comment: replyText }),
  });
  if (!res.ok) throw new Error(`Failed to publish reply: ${res.status}`);
  return res.json();
}

export async function createGooglePost(accessToken: string, locationName: string, post: any): Promise<any> {
  if (!IS_CONFIGURED) return { name: "mock_post_" + Date.now() };
  const res = await fetch(`${GBP_API_BASE}/${locationName}/localPosts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(post),
  });
  if (!res.ok) throw new Error(`Failed to create post: ${res.status}`);
  return res.json();
}

export async function getPerformanceMetrics(accessToken: string, locationName: string, startDate: string, endDate: string): Promise<any> {
  if (!IS_CONFIGURED) return {};
  const res = await fetch(`${GBP_PERF_BASE}/locations/${locationName}:getDailyMetricsTimeSeries?dailyRange.startDate.date.year=${startDate}&dailyRange.endDate.date.year=${endDate}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to get metrics: ${res.status}`);
  return res.json();
}

// ─── Sync Engine — fetches real data from Google and updates DB ───────────

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
          // Find existing location by googleLocationId or create
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

export const googleServiceStatus = {
  isConfigured: IS_CONFIGURED,
  hasClientSecret: !!GOOGLE_CLIENT_SECRET,
  redirectUri: GOOGLE_REDIRECT_URI,
  mode: IS_CONFIGURED ? "production" : "mock",
};
