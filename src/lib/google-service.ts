// ═══════════════════════════════════════════════════════════════════════════
// Google Business Profile Service Layer — Production Only
// All Google API calls are real. Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.
// ═══════════════════════════════════════════════════════════════════════════

import { db } from "./db";
import { encryptToken, decryptToken } from "./token-crypto";
import { withRetry, sanitizeGoogleError } from "./google-rate-limit";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/google/callback`;
export const IS_CONFIGURED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

// ─── Error Persistence ────────────────────────────────────────────────────
// Persist sync errors to the ErrorLog table for audit + monitoring. The sync
// engine continues to return `errors[]` to its callers (callers depend on the
// existing return shape), but ALSO writes each error to ErrorLog so it shows
// up in the System view's error log panel and can trigger alerts.
//
// Failures inside logError itself are swallowed (best-effort) — we must never
// let audit logging break a sync flow.
async function logError(module: string, errorCode: string | null, message: string, payload?: unknown): Promise<void> {
  try {
    await db.errorLog.create({
      data: {
        module,
        errorCode,
        errorMessage: message.slice(0, 2000),
        stackTrace: null,
        payloadJson: payload ? JSON.stringify(payload).slice(0, 8000) : null,
        resolved: false,
      },
    });
  } catch (e) {
    console.error("Failed to log error to ErrorLog:", e);
  }
}

const GBP_SCOPES = [
  "https://www.googleapis.com/auth/business.manage",
  "openid",
  "email",
  "profile",
].join(" ");

// ─── OAuth Flow ───────────────────────────────────────────────────────────

export function getGoogleAuthUrl(state?: string): { url: string; state: string } {
  // Generate a high-entropy CSRF state if none provided.
  // The caller is responsible for storing this value (typically in a cookie)
  // and validating it on the OAuth callback.
  const finalState = state || crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: GBP_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state: finalState,
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, state: finalState };
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  scope?: string;
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
    throw new Error(sanitizeGoogleError(`Google token exchange failed: ${res.status} ${err}`));
  }

  const tokens = await res.json();
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    scope: typeof tokens.scope === "string" ? tokens.scope : undefined,
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

  if (!res.ok) throw new Error(sanitizeGoogleError(`Token refresh failed: ${res.status}`));
  const tokens = await res.json();
  return {
    accessToken: tokens.access_token,
    expiryDate: Date.now() + (tokens.expires_in ?? 3600) * 1000,
  };
}

export async function getValidAccessToken(): Promise<string | null> {
  const account = await db.googleAccount.findFirst();
  if (!account) return null;

  // Defensive: reject legacy "no_token" placeholder. This guard is in addition
  // to the deletion of the no_token fake-account path in P0-FIX-1 — any rows
  // that pre-date the cleanup (or were created by older seed scripts) will
  // short-circuit here instead of producing `Bearer no_token` 401s downstream.
  if (account.accessToken === "no_token") {
    return null;
  }

  // Decrypt the stored access token (no-op if not encrypted / legacy plaintext).
  // We must ALWAYS decrypt before returning so callers receive a raw bearer
  // token, not the encrypted blob (which would produce `Bearer enc:...` and
  // fail with 401 on Google's side).
  const decryptedAccess = decryptToken(account.accessToken);
  if (!decryptedAccess) {
    // Decryption failed — mark expired so the UI surfaces a reconnect prompt.
    await db.googleAccount.update({ where: { id: account.id }, data: { status: "expired" } });
    return null;
  }

  // Check if token is still valid (5 min buffer)
  if (account.tokenExpiry && new Date(account.tokenExpiry) > new Date(Date.now() + 5 * 60 * 1000)) {
    return decryptedAccess;
  }

  // Try to refresh — decrypt the refresh token first
  if (account.refreshToken) {
    const decryptedRefresh = decryptToken(account.refreshToken);
    // Defensive: a legacy "no_token" refresh token can never produce a fresh
    // access token — bail out and mark the account as expired.
    if (!decryptedRefresh || decryptedRefresh === "no_token") {
      await db.googleAccount.update({ where: { id: account.id }, data: { status: "expired" } });
      return null;
    }
    try {
      const { accessToken, expiryDate } = await refreshAccessToken(decryptedRefresh);
      await db.googleAccount.update({
        where: { id: account.id },
        data: {
          accessToken: encryptToken(accessToken), // ENCRYPT before saving
          tokenExpiry: new Date(expiryDate),
          status: "active",
        },
      });
      return accessToken; // return decrypted
    } catch (e) {
      console.error("Token refresh failed:", e);
      await db.googleAccount.update({ where: { id: account.id }, data: { status: "expired" } });
      return null;
    }
  }

  return null;
}

/** Revoke a Google OAuth token (access or refresh) — called on disconnect. */
export async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Google Business Profile API Calls ────────────────────────────────────

const GBP_API_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
const GBP_PERF_BASE = "https://businessprofileperformance.googleapis.com/v1";
const GBP_ACCOUNTS_BASE = "https://mybusinessaccountmanagement.googleapis.com/v1";
// v4 API — kept alive ONLY for reviews and localPosts (per Google's supported-apis matrix)
const GBP_V4_BASE = "https://mybusiness.googleapis.com/v4";

export async function listGoogleAccounts(accessToken: string): Promise<any[]> {
  const data = await withRetry<{ accounts?: any[] }>(() =>
    fetch(`${GBP_ACCOUNTS_BASE}/accounts`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
  );
  return data.accounts ?? [];
}

export async function listGoogleLocations(accessToken: string, accountName: string): Promise<any[]> {
  const all: any[] = [];
  let pageToken: string | undefined;
  const maxPages = 20; // safety limit (2000 locations max)

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${GBP_API_BASE}/${accountName}/locations`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("readMask", "name,title,storeCode,latlng,metadata,profile,regularHours,specialHours,serviceItems,categories,phoneNumbers,websiteUri,openInfo");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const data = await withRetry<any>(() =>
      fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
        .then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
    );
    if (Array.isArray(data.locations)) all.push(...data.locations);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return all;
}

export async function getBusinessProfile(accessToken: string, locationName: string): Promise<any> {
  const data = await withRetry<any>(() =>
    fetch(`${GBP_API_BASE}/${locationName}?readMask=title,storeCode,latlng,metadata,profile,regularHours,categories,phoneNumbers,websiteUri,openInfo,serviceItems,attributes`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
  );
  return data;
}

/**
 * Fetch the Google-updated version of a location. Google may auto-update
 * listings (e.g., user-submitted address changes, Google's own data-quality
 * edits). This endpoint is the only way to detect drift between our DB and
 * Google's canonical version.
 *
 * Returns the Google-updated Location resource, or `null` when:
 *   - Google responds with 404 (no pending Google updates — the location is
 *     in sync with our DB, which is the common case), OR
 *   - any other transient error occurs (we treat the absence of drift info
 *     as "no drift" rather than failing the entire drift-detection sweep).
 *
 * `locationName` is the Google-side location name like
 * "accounts/{aid}/locations/{lid}".
 */
export async function getGoogleUpdated(accessToken: string, locationName: string): Promise<any | null> {
  try {
    const data = await withRetry<any>(() =>
      fetch(`${GBP_API_BASE}/${locationName}:getGoogleUpdated`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(async (r) => {
        // 404 is the expected "no drift" response — Google only returns a body
        // when there ARE pending updates. Normalize to a JSON null so withRetry
        // returns `null` cleanly to the caller.
        if (r.status === 404) return { ok: true, status: 200, body: () => Promise.resolve("null") };
        return { ok: r.ok, status: r.status, body: () => r.text() };
      })
    );
    // withRetry parses "null" as JSON null — pass it through.
    return data ?? null;
  } catch {
    // Don't propagate — a transient fetch failure on one location must not
    // abort the entire drift-detection sweep.
    return null;
  }
}

/**
 * Check a single location for drift between our DB and Google's canonical
 * (Google-updated) version. Compares the high-churn fields: name, phone,
 * website. (Address comparison is intentionally omitted — Google's address
 * shape is structured and noisy to diff; the audit log would fill up with
 * false positives from formatting differences.)
 *
 * When drift is detected:
 *   - Writes an ErrorLog row (module "google.drift", errorCode "DRIFT_DETECTED")
 *     so it appears in the System view's error panel and can trigger alerts.
 *   - Writes an AuditLog row (action "google.drift_detected") attributed to
 *     "System (drift detector)" so it shows up alongside other location
 *     mutations in the per-location audit trail.
 *
 * @returns `{ drift: true, differences: [...] }` if drift detected, otherwise
 *          `{ drift: false, differences: [] }`.
 */
export async function detectLocationDrift(locationId: string): Promise<{ drift: boolean; differences: string[] }> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return { drift: false, differences: [] };

  const gbp = await db.googleBusinessProfile.findFirst({ where: { locationId } });
  if (!gbp) return { drift: false, differences: [] };

  const googleUpdated = await getGoogleUpdated(accessToken, gbp.googleLocationId);
  if (!googleUpdated) return { drift: false, differences: [] };

  const location = await db.location.findUnique({ where: { id: locationId } });
  if (!location) return { drift: false, differences: [] };

  const differences: string[] = [];
  if (googleUpdated.title && googleUpdated.title !== location.name) {
    differences.push(`name: DB="${location.name}" vs Google="${googleUpdated.title}"`);
  }
  if (googleUpdated.phoneNumbers?.primaryPhone && googleUpdated.phoneNumbers.primaryPhone !== location.phone) {
    differences.push(`phone: DB="${location.phone}" vs Google="${googleUpdated.phoneNumbers.primaryPhone}"`);
  }
  if (googleUpdated.websiteUri && googleUpdated.websiteUri !== location.website) {
    differences.push(`website: DB="${location.website}" vs Google="${googleUpdated.websiteUri}"`);
  }

  if (differences.length > 0) {
    await logError(
      "google.drift",
      "DRIFT_DETECTED",
      `Location ${location.name} (${locationId}) has drift: ${differences.join("; ")}`,
      { locationId, differences },
    );
    try {
      await db.auditLog.create({
        data: {
          action: "google.drift_detected",
          entity: "location",
          entityId: locationId,
          userName: "System (drift detector)",
          status: "success",
          newValue: JSON.stringify({ differences }),
        },
      });
    } catch {
      // AuditLog write is best-effort — the ErrorLog entry above is the
      // primary signal. Don't let an audit-write failure abort the sweep.
    }
  }

  return { drift: differences.length > 0, differences };
}

/**
 * Search Google's category database by name. Returns matching categories
 * with their gcid IDs (e.g. "gcid:interior_designer"). Used to resolve a
 * human-readable category display name into the stable categoryId required
 * by the Location patch endpoint.
 */
export async function searchGoogleCategories(
  accessToken: string,
  searchTerm: string,
  regionCode: string = "IN",
  languageCode: string = "en"
): Promise<{ categoryId: string; displayName: string }[]> {
  const url = new URL(`${GBP_API_BASE}/categories:search`);
  url.searchParams.set("searchTerm", searchTerm);
  url.searchParams.set("regionCode", regionCode);
  url.searchParams.set("languageCode", languageCode);

  const data = await withRetry<any>(() =>
    fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
  );
  return (data.categories || []).map((c: any) => ({
    categoryId: c.name, // e.g. "gcid:interior_designer"
    displayName: c.displayName,
  }));
}

/**
 * Resolve a category display name to its stable gcid by searching Google's
 * category DB. Prefers an exact (case-insensitive) display-name match and
 * falls back to the first search hit. Returns null if no match is found so
 * the caller can decide whether to skip that category entirely (Google
 * rejects null/empty categoryId values, so we must not send one).
 */
export async function resolveCategoryId(
  accessToken: string,
  displayName: string,
  regionCode: string = "IN"
): Promise<string | null> {
  const results = await searchGoogleCategories(accessToken, displayName, regionCode);
  // Exact match first (case-insensitive)
  const exact = results.find(r => r.displayName.toLowerCase() === displayName.toLowerCase());
  if (exact) return exact.categoryId;
  // Fall back to first result, if any
  return results[0]?.categoryId ?? null;
}

export async function listReviews(accessToken: string, locationName: string, pageSize = 50): Promise<any[]> {
  // v4 reviews endpoint with full pagination — Google returns up to 50/page.
  // Loop on nextPageToken until exhausted, with a 10-page safety limit (500 reviews max).
  const allReviews: any[] = [];
  let pageToken: string | undefined;
  const maxPages = 10;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${GBP_V4_BASE}/${locationName}/reviews`);
    url.searchParams.set("pageSize", String(pageSize));
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const data = await withRetry<any>(() =>
      fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
    );
    if (Array.isArray(data.reviews)) allReviews.push(...data.reviews);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return allReviews;
}

export async function replyToReview(accessToken: string, reviewName: string, replyText: string): Promise<any> {
  const data = await withRetry<any>(() =>
    fetch(`https://mybusiness.googleapis.com/v4/${reviewName}/reply`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ comment: replyText }),
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
  );
  return data;
}

export async function deleteReviewReply(accessToken: string, reviewName: string): Promise<boolean> {
  // Deletes the owner reply from a Google review. reviewName is the full Google
  // review name like "accounts/{aid}/locations/{lid}/reviews/{rid}".
  await withRetry<any>(() =>
    fetch(`${GBP_V4_BASE}/${reviewName}/reply`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
  );
  return true;
}

export async function createGooglePost(accessToken: string, locationName: string, post: any): Promise<any> {
  // Local posts remain exclusively on v4 — Business Information API v1 has no /localPosts endpoint.
  const data = await withRetry<any>(() =>
    fetch(`${GBP_V4_BASE}/${locationName}/localPosts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(post),
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
  );
  return data;
}

export async function deleteGooglePost(accessToken: string, postName: string): Promise<boolean> {
  // postName is the full Google post name like "accounts/{aid}/locations/{lid}/localPosts/{pid}"
  await withRetry<any>(() =>
    fetch(`${GBP_V4_BASE}/${postName}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
  );
  return true;
}

export async function patchGooglePost(
  accessToken: string,
  postName: string,
  updates: { title?: string; summary?: string; callToAction?: any; topicType?: string },
  fieldMask: string = "summary,title,callToAction"
): Promise<any> {
  // PATCH existing local post on Google. topicType is immutable and is NOT included
  // in the updateMask (only sent via fieldMask=topicType per Google docs, but ignored on update).
  const data = await withRetry<any>(() =>
    fetch(`${GBP_V4_BASE}/${postName}?updateMask=${fieldMask}&fieldMask=topicType`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
  );
  return data;
}

// ─── Media / Photos (push TO Google + delete FROM Google) ──────────────────
//
// Google's Business Information API supports two upload flows for photos:
//   (1) 2-step byte upload: startUpload → PUT raw bytes to media upload endpoint
//       → POST {parent}/media with the resulting dataRef. Required when the
//       image only exists locally as a binary blob.
//   (2) sourceUrl method (single step): POST {parent}/media with body
//       `{ mediaFormat: { photo: { sourceUrl } }, locationAssociation: { category } }`.
//       Google fetches the image from the public URL itself. Simpler and
//       sufficient when the asset is already hosted at a publicly reachable URL.
//
// We use method (2) — every upload is first persisted to /public/uploads/media
// and exposed via NEXTAUTH_URL, then handed to Google as a sourceUrl. This
// keeps our upload path single-step and avoids the fragile media-upload
// endpoint, while still satisfying Google's requirement that the photo be
// reachable at the time of indexing.

export type GooglePhotoCategory =
  | "COVER"
  | "PROFILE"
  | "INTERIOR"
  | "EXTERIOR"
  | "PRODUCT"
  | "TEAM"
  | "FOOD_AND_DRINK"
  | "MENU"
  | "AT_WORK"
  | "COMMON_AREA"
  | "ROOMS"
  | "LANDSCAPE";

export interface UploadGooglePhotoInput {
  /** Publicly reachable URL Google can fetch the image bytes from. */
  sourceUrl: string;
  /** Optional caption / description shown on the Business Profile. */
  description?: string;
  /** Association category — controls where on the profile the photo appears. */
  category?: GooglePhotoCategory;
}

export interface UploadGooglePhotoResult {
  /** Full Google media item name, e.g. "accounts/{aid}/locations/{lid}/media/{mid}". */
  name: string;
  /** Google-hosted URL of the published photo (may be null until Google finishes processing). */
  googleUrl?: string;
}

/**
 * Upload a photo to a Google Business Profile location using the sourceUrl
 * method. `locationName` is the Google-side location name like
 * "accounts/{aid}/locations/{lid}". Throws on any non-2xx response (sanitized
 * by withRetry). Callers should wrap in try/catch and treat failures as
 * best-effort — the local MediaLibrary record remains the source of truth.
 */
export async function uploadGooglePhoto(
  accessToken: string,
  locationName: string,
  photo: UploadGooglePhotoInput,
): Promise<UploadGooglePhotoResult> {
  const body: any = {
    mediaFormat: {
      photo: {
        sourceUrl: photo.sourceUrl,
      },
    },
  };
  if (photo.description) {
    body.mediaFormat.photo.description = photo.description;
  }
  if (photo.category) {
    body.locationAssociation = { category: photo.category };
  }

  const data = await withRetry<any>(() =>
    fetch(`${GBP_API_BASE}/${locationName}/media`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
  );

  return {
    name: data.name,
    googleUrl: data.googleUrl ?? undefined,
  };
}

/**
 * Delete a media item from a Google Business Profile location. `mediaName` is
 * the full Google media name like "accounts/{aid}/locations/{lid}/media/{mid}".
 *
 * A 404 response is treated as success (the photo was already deleted on
 * Google's side — common during sync drift). All other non-2xx responses throw
 * via withRetry. Callers should treat the throw as best-effort and still
 * remove the local record so the operator sees a consistent state.
 */
export async function deleteGooglePhoto(
  accessToken: string,
  mediaName: string,
): Promise<boolean> {
  await withRetry<any>(() =>
    fetch(`${GBP_API_BASE}/${mediaName}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(async (r) => {
      // Idempotent: 404 means the photo is already gone on Google's side.
      // Normalize to a success-shape so withRetry doesn't throw.
      if (r.status === 404) {
        return { ok: true, status: 200, body: () => Promise.resolve("{}") };
      }
      return { ok: r.ok, status: r.status, body: () => r.text() };
    })
  );
  return true;
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

  const data = await withRetry<any>(() =>
    fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
  );
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
  if (!accessToken) {
    await logError("google.sync.analytics", null, "No valid Google access token", { locationId, step: "auth" });
    return { synced: 0, errors: ["No valid Google access token"] };
  }

  const gbp = await db.googleBusinessProfile.findFirst({ where: { locationId } });
  if (!gbp) {
    await logError("google.sync.analytics", null, "No Google Business Profile linked", { locationId, step: "lookup" });
    return { synced: 0, errors: ["No Google Business Profile linked"] };
  }

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
    await logError("google.sync.analytics", null, e.message, { locationId, step: "fetch", daysBack });
    return { synced: 0, errors: [e.message] };
  }
}

// ─── Update Google Business Profile (push changes TO Google) ───────────────

export async function updateGoogleBusinessProfile(
  accessToken: string,
  locationName: string,
  updates: {
    title?: string;
    phone?: string;
    website?: string;
    description?: string;
    appointmentUrl?: string;
    hours?: { dayOfWeek: string; openTime?: { hours: number; minutes: number }; closeTime?: { hours: number; minutes: number }; isClosed?: boolean }[];
    /**
     * Categories to push to Google. Callers may supply either the stable
     * gcid (preferred — e.g. "gcid:interior_designer") OR a display name
     * (fallback — will be resolved to a gcid via searchGoogleCategories).
     * Display-name resolution is best-effort: if a name cannot be resolved
     * to a gcid, that category is silently dropped from the patch (Google
     * rejects null/empty categoryId values).
     */
    categories?: {
      primaryCategoryId?: string;
      primaryDisplayName?: string;
      additionalCategoryIds?: string[];
      additionalDisplayNames?: string[];
    };
  }
): Promise<any> {
  const body: any = {};
  const fieldMask: string[] = [];

  if (updates.title !== undefined) { body.title = updates.title; fieldMask.push("title"); }
  if (updates.phone !== undefined) { body.phoneNumbers = { primaryPhone: updates.phone }; fieldMask.push("phoneNumbers"); }
  if (updates.website !== undefined) { body.websiteUri = updates.website; fieldMask.push("websiteUri"); }
  if (updates.description !== undefined) {
    body.profile = { ...(body.profile || {}), description: updates.description };
    fieldMask.push("profile.description");
  }
  if (updates.appointmentUrl !== undefined) {
    body.profile = { ...(body.profile || {}), appointmentUrl: updates.appointmentUrl };
    fieldMask.push("profile.appointmentUrl");
  }
  // Hours — Google's `regularHours.periods` only lists OPEN periods; a day with
  // no entry is implicitly closed. Callers that want to mark a day as closed
  // should simply omit it from the array (the route handlers in
  // /api/locations/[id]/route.ts already filter out `isClosed=true` rows before
  // calling this function — that filtering is correct and intentional).
  //
  // Edge case: if ALL 7 days are `isClosed=true` (business is permanently
  // closed), the filtered `hours` array will be EMPTY. We must NOT push an
  // empty `regularHours.periods` to Google — Google rejects `periods: []` with
  // a 400 ("periods must not be empty"). Skipping the field entirely leaves
  // Google's existing hours untouched, which is the safest behavior for a
  // permanently-closed business (Google recommends setting `openInfo.openNow`
  // and `openInfo.status` instead of clearing hours for permanently-closed
  // locations).
  if (updates.hours && updates.hours.length > 0) {
    body.regularHours = {
      periods: updates.hours.map(h => ({
        openDay: h.dayOfWeek,
        openTime: h.openTime,
        closeDay: h.dayOfWeek,
        closeTime: h.closeTime,
      })),
    };
    fieldMask.push("regularHours");
  }
  if (updates.categories) {
    const cat = updates.categories;
    // Resolve primary category — prefer an explicit gcid, else resolve the
    // display name via Google's category search.
    let primaryId: string | null | undefined = cat.primaryCategoryId ?? null;
    if (!primaryId && cat.primaryDisplayName) {
      primaryId = await resolveCategoryId(accessToken, cat.primaryDisplayName);
    }
    // Resolve additional categories — explicit gcids first, then resolve
    // display names. Skip any that can't be resolved (Google rejects null
    // categoryId values, so dropping is safer than sending one).
    const additionalIds: string[] = [];
    if (cat.additionalCategoryIds) {
      additionalIds.push(...cat.additionalCategoryIds.filter(Boolean));
    }
    if (cat.additionalDisplayNames) {
      for (const name of cat.additionalDisplayNames) {
        if (!name) continue;
        const id = await resolveCategoryId(accessToken, name);
        if (id) additionalIds.push(id);
      }
    }

    body.categories = {
      ...(primaryId ? { primaryCategory: { categoryId: primaryId } } : {}),
      additionalCategories: additionalIds.map(id => ({ categoryId: id })),
    };
    fieldMask.push("categories");
  }

  const data = await withRetry<any>(() =>
    fetch(`${GBP_API_BASE}/${locationName}?updateMask=${fieldMask.join(",")}&validateOnly=false`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
  );
  return data;
}

// ─── Google Business Profile Verifications API ─────────────────────────────
// Uses a separate base URL from the rest of the GBP APIs. See:
// https://developers.google.com/my-business/reference/verifications/v1/rest
const GBP_VERIFY_BASE = "https://mybusinessverifications.googleapis.com/v1";

/**
 * Fetch the verification options available for a location.
 * The optional `dispatchMethod` lets the caller pre-select the channel they
 * intend to use (ADDRESS | EMAIL | PHONE_CALL | SMS) so Google can return
 * channel-specific metadata (e.g. the masked phone number for SMS).
 */
export async function fetchVerificationOptions(
  accessToken: string,
  locationName: string,
  dispatchMethod?: string,
): Promise<any> {
  const body: any = {};
  if (dispatchMethod) {
    body.context = { dispatchMethod };
  }
  const data = await withRetry<any>(() =>
    fetch(`${GBP_VERIFY_BASE}/${locationName}:fetchVerificationOptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() })),
  );
  return data;
}

/**
 * Initiate a verification flow for a location. Google will dispatch the PIN
 * (postcard for ADDRESS, SMS for SMS, automated call for PHONE_CALL, email
 * for EMAIL) and return a `verification` resource the client must later
 * complete via {@link completeVerification}.
 *
 * `input` shape depends on `method`:
 *   - ADDRESS → { mailerContactName: string }
 *   - PHONE_CALL | SMS → { phoneNumber: string }
 *   - EMAIL → { emailAddress: string }
 */
export async function initiateVerification(
  accessToken: string,
  locationName: string,
  method: string,
  input: any,
): Promise<any> {
  const body: any = { method };
  if (method === "ADDRESS") {
    body.addressInput = input;
  } else if (method === "PHONE_CALL" || method === "SMS") {
    body.phoneInput = input;
  } else if (method === "EMAIL") {
    body.emailInput = input;
  }
  const data = await withRetry<any>(() =>
    fetch(`${GBP_VERIFY_BASE}/${locationName}:verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() })),
  );
  return data;
}

/**
 * List the verification history for a location. Paginates through all
 * available pages (capped at 5 pages = 250 records) and returns the merged
 * `verifications` array.
 */
export async function listVerifications(
  accessToken: string,
  locationName: string,
  pageSize = 50,
): Promise<any[]> {
  const all: any[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 5; page++) {
    const url = new URL(`${GBP_VERIFY_BASE}/${locationName}/verifications`);
    url.searchParams.set("pageSize", String(pageSize));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await withRetry<any>(() =>
      fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() })),
    );
    if (Array.isArray(data.verifications)) all.push(...data.verifications);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return all;
}

/**
 * Complete a PIN-based verification by submitting the PIN the user received
 * (postcard in the mail, SMS code, etc.). Returns true on success.
 * A 404 response is treated as success — the verification may have already
 * been completed or expired, and the user-facing outcome is the same.
 */
export async function completeVerification(
  accessToken: string,
  verificationName: string,
  pin: string,
): Promise<boolean> {
  await withRetry<any>(() =>
    fetch(`${GBP_VERIFY_BASE}/${verificationName}:complete`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    }).then(async (r) => {
      if (r.status === 404) return { ok: true, status: 200, body: async () => "{}" };
      return { ok: r.ok, status: r.status, body: () => r.text() };
    }),
  );
  return true;
}

// ─── Sync Engine ──────────────────────────────────────────────────────────

export async function syncGoogleProfiles(): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    await logError("google.sync.profiles", null, "No valid Google access token. Please reconnect Google OAuth.", { step: "auth" });
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
          await logError("google.sync.profiles", null, e.message, { step: "per_location", googleLocationId: loc.name, accountName: account.name });
        }
      }
    }

    return { synced, errors };
  } catch (e: any) {
    await logError("google.sync.profiles", null, e.message, { step: "outer" });
    return { synced: 0, errors: [e.message] };
  }
}

export async function syncGoogleReviews(locationId: string, googleLocationId: string): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    await logError("google.sync.reviews", null, "No valid access token", { locationId, googleLocationId, step: "auth" });
    return { synced: 0, errors: ["No valid access token"] };
  }

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
    await logError("google.sync.reviews", null, e.message, { locationId, googleLocationId, step: "fetch" });
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
    await logError("google.sync.full", null, "No valid Google access token. Please reconnect Google OAuth.", { locationId, step: "auth" });
    return { success: false, synced: result, errors: ["No valid Google access token. Please reconnect Google OAuth."] };
  }

  // Get the GoogleBusinessProfile linked to this location
  const gbp = await db.googleBusinessProfile.findFirst({ where: { locationId } });
  if (!gbp) {
    await logError("google.sync.full", null, "No Google Business Profile linked to this location. Import this location from Google first.", { locationId, step: "lookup" });
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
          data: { locationId, categoryName: profile.categories.primaryCategory.displayName || "Auto Repair Shop", isPrimary: true },
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
      await logError("google.sync.full", null, e.message, { locationId, step: "reviews" });
    }

    // ─── 6. Sync Photos (metadata only — URLs from Google) ──────────────
    try {
      const mediaData = await withRetry<{ media?: any[] }>(() =>
        fetch(`${GBP_API_BASE}/${locationName}/media`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
      );
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
    } catch (e: any) {
      errors.push(`Photos sync: ${e.message}`);
      await logError("google.sync.full", null, e.message, { locationId, step: "photos" });
    }

    // ─── 7. Sync Business Information (description, website, appointment URL) ──
    try {
      const description = profile.profile?.description || profile.metadata?.description || null;
      const website = profile.websiteUri || null;
      const appointmentUrl = profile.profile?.appointmentUrl || null;

      if (gbp) {
        const existingInfo = await db.businessInformation.findFirst({ where: { profileId: gbp.id } });
        if (existingInfo) {
          await db.businessInformation.update({
            where: { id: existingInfo.id },
            data: { description, website, appointmentUrl },
          });
        } else {
          await db.businessInformation.create({
            data: { profileId: gbp.id, locationId, description, website, appointmentUrl },
          });
        }
      }
    } catch (e: any) {
      errors.push(`Business info sync: ${e.message}`);
      await logError("google.sync.full", null, e.message, { locationId, step: "business_info" });
    }

    // ─── 8. Sync Attributes (wheelchair accessible, appointments, etc.) ────
    try {
      if (profile.attributes?.length > 0) {
        await db.businessAttribute.deleteMany({ where: { locationId } });
        for (const attr of profile.attributes) {
          await db.businessAttribute.create({
            data: {
              locationId,
              attributeName: attr.name || attr.displayName || "Attribute",
              attributeValue: Array.isArray(attr.value) ? attr.value.join(", ") : String(attr.value ?? "true"),
            },
          });
        }
      }
    } catch (e: any) {
      errors.push(`Attributes sync: ${e.message}`);
      await logError("google.sync.full", null, e.message, { locationId, step: "attributes" });
    }

    // ─── 9. Sync Special Hours (holidays) ─────────────────────────────────
    try {
      if (profile.specialHours?.specialHourRanges?.length > 0) {
        await db.specialHour.deleteMany({ where: { locationId } });
        for (const range of profile.specialHours.specialHourRanges) {
          const startDate = range.startDate ? new Date(`${range.startDate.year}-${String(range.startDate.month).padStart(2, "0")}-${String(range.startDate.day).padStart(2, "0")}`) : new Date();
          await db.specialHour.create({
            data: {
              locationId,
              date: startDate,
              openTime: range.openTime ? `${String(range.openTime.hours).padStart(2, "0")}:${String(range.openTime.minutes).padStart(2, "0")}` : null,
              closeTime: range.closeTime ? `${String(range.closeTime.hours).padStart(2, "0")}:${String(range.closeTime.minutes).padStart(2, "0")}` : null,
              isClosed: !range.openTime,
            },
          });
        }
      }
    } catch (e: any) {
      errors.push(`Special hours sync: ${e.message}`);
      await logError("google.sync.full", null, e.message, { locationId, step: "special_hours" });
    }

    // ─── 10. Sync Analytics (real Google Business Performance API) ────────
    try {
      const analyticsResult = await syncLocationAnalytics(locationId, 30);
      if (analyticsResult.errors.length > 0) {
        errors.push(`Analytics sync: ${analyticsResult.errors.join("; ")}`);
        await logError("google.sync.full", null, analyticsResult.errors.join("; "), { locationId, step: "analytics" });
      }
    } catch (e: any) {
      errors.push(`Analytics sync: ${e.message}`);
      await logError("google.sync.full", null, e.message, { locationId, step: "analytics" });
    }

    return { success: true, synced: result, errors };
  } catch (e: any) {
    await logError("google.sync.full", null, e.message, { locationId, step: "outer" });
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
