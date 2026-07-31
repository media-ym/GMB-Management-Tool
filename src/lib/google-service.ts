// ═══════════════════════════════════════════════════════════════════════════
// Google Business Profile Service Layer — Production Only
// All Google API calls are real. Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.
// ═══════════════════════════════════════════════════════════════════════════

import { db } from "./db";
import { encryptToken, decryptToken } from "./token-crypto";
import { withRetry, sanitizeGoogleError } from "./google-rate-limit";
import { parseGoogleAddress, extractLocationFromName, inferCityFromAddress } from "./location-utils";
import { refreshLocationScores } from "./location-scores";
import {
  resolveVerificationFromVoiceOfMerchant,
  resolveProfileStatus,
  resolveGbpMapUrl,
  hasPendingVerification,
  type VoiceOfMerchantStateLike,
} from "./gbp-profile-utils";
import { syncLocationReviewsFromGoogle } from "./review-sync";
import { createBusinessPhotoRecord } from "./business-photo-db";
import {
  extractChatLinkFromGoogleAttributes,
  extractMenuLinkFromGoogleAttributes,
  extractSocialFromGoogleAttributes,
  mergeLocationAttributes,
  parseLocationAttributes,
} from "./location-attributes";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_CALLBACK_PATH = "/api/google/callback";
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  `${(process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "")}${GOOGLE_CALLBACK_PATH}`;
export const IS_CONFIGURED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

/** All redirect URIs this app may use — must also be registered in Google Cloud Console. */
export function getAllowedGoogleRedirectUris(): string[] {
  const uris = new Set<string>();
  uris.add(GOOGLE_REDIRECT_URI);
  const nextAuth = process.env.NEXTAUTH_URL?.replace(/\/$/, "");
  if (nextAuth) uris.add(`${nextAuth}${GOOGLE_CALLBACK_PATH}`);
  uris.add(`http://localhost:3000${GOOGLE_CALLBACK_PATH}`);
  uris.add(`http://127.0.0.1:3000${GOOGLE_CALLBACK_PATH}`);
  return [...uris];
}

function isLocalDevCallback(uri: string): boolean {
  try {
    const u = new URL(uri);
    return (
      u.pathname === GOOGLE_CALLBACK_PATH &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "0.0.0.0") &&
      u.protocol === "http:"
    );
  } catch {
    return false;
  }
}

/** Map 0.0.0.0 → localhost so OAuth cookies + Google redirect stay on one host. */
function normalizeLocalCallbackUri(uri: string): string {
  try {
    const u = new URL(uri);
    if (u.hostname === "0.0.0.0") {
      u.hostname = "localhost";
      return u.toString();
    }
  } catch {
    // ignore
  }
  return uri;
}

/** Pick redirect URI from the current browser session (localhost vs ngrok vs production). */
export function resolveGoogleRedirectUri(fromRequest?: {
  origin?: string | null;
  referer?: string | null;
  host?: string | null;
  forwardedProto?: string | null;
}): string {
  const candidates: string[] = [];
  if (fromRequest?.origin) {
    try {
      candidates.push(normalizeLocalCallbackUri(`${new URL(fromRequest.origin).origin}${GOOGLE_CALLBACK_PATH}`));
    } catch {
      // ignore
    }
  }
  if (fromRequest?.referer) {
    try {
      const r = new URL(fromRequest.referer);
      candidates.push(normalizeLocalCallbackUri(`${r.origin}${GOOGLE_CALLBACK_PATH}`));
    } catch {
      // ignore
    }
  }
  if (fromRequest?.host) {
    const proto = fromRequest.forwardedProto || "http";
    const host = fromRequest.host.replace(/^0\.0\.0\.0/, "localhost");
    candidates.push(`${proto}://${host}${GOOGLE_CALLBACK_PATH}`);
  }

  const allowed = new Set(getAllowedGoogleRedirectUris());
  for (const candidate of candidates) {
    const normalized = normalizeLocalCallbackUri(candidate);
    if (allowed.has(normalized)) return normalized;
    if (isLocalDevCallback(normalized)) return normalizeLocalCallbackUri(normalized);
  }

  return normalizeLocalCallbackUri(GOOGLE_REDIRECT_URI);
}

/** Short-lived OAuth state (cookie fallback when host switches 0.0.0.0 ↔ localhost). */
type OAuthPending = {
  redirectUri: string;
  expiresAt: number;
  /** When set, tokens are stored on GoogleAccount for this end-client */
  portalClientId?: string | null;
  /** Where to send the browser after OAuth (default /google) */
  returnPath?: string;
};

const oauthPendingStates = new Map<string, OAuthPending>();

export function rememberOAuthState(
  state: string,
  redirectUri: string,
  ttlMs = 60 * 60 * 1000,
  meta?: { portalClientId?: string | null; returnPath?: string },
): void {
  const now = Date.now();
  for (const [k, v] of oauthPendingStates) {
    if (v.expiresAt <= now) oauthPendingStates.delete(k);
  }
  oauthPendingStates.set(state, {
    redirectUri,
    expiresAt: now + ttlMs,
    portalClientId: meta?.portalClientId ?? null,
    returnPath: meta?.returnPath,
  });
}

export function consumeOAuthState(state: string): {
  redirectUri: string;
  portalClientId?: string | null;
  returnPath?: string;
} | null {
  const row = oauthPendingStates.get(state);
  if (!row) return null;
  oauthPendingStates.delete(state);
  if (row.expiresAt <= Date.now()) return null;
  return {
    redirectUri: row.redirectUri,
    portalClientId: row.portalClientId,
    returnPath: row.returnPath,
  };
}

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
  "https://www.googleapis.com/auth/adwords",
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

export const REQUIRED_GBP_SCOPE = "https://www.googleapis.com/auth/business.manage";
export const REQUIRED_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";

export function parseAccountScopes(scopesJson: string | null | undefined): string[] {
  if (!scopesJson) return [];
  try {
    const parsed = JSON.parse(scopesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function scopesIncludeBusinessManage(scopes: string[]): boolean {
  return scopes.some((s) => s.includes("business.manage"));
}

export function scopesIncludeAdwords(scopes: string[]): boolean {
  return scopes.some((s) => s.includes("adwords"));
}

// ─── OAuth Flow ───────────────────────────────────────────────────────────

export function getGoogleAuthUrl(state?: string, redirectUri = GOOGLE_REDIRECT_URI): { url: string; state: string; redirectUri: string } {
  // Generate a high-entropy CSRF state if none provided.
  // The caller is responsible for storing this value (typically in a cookie)
  // and validating it on the OAuth callback.
  const finalState = state || crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GBP_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state: finalState,
  });
  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    state: finalState,
    redirectUri,
  };
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri = GOOGLE_REDIRECT_URI,
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  scope?: string;
}> {
  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
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

export async function isGoogleOAuthConnected(clientId?: string | null): Promise<boolean> {
  const account = await db.googleAccount.findFirst({
    where: clientId
      ? { status: "active", accessToken: { not: null }, clientId }
      : { status: "active", accessToken: { not: null } },
    select: { id: true, scopesJson: true },
  });
  if (!account) return false;
  return scopesIncludeBusinessManage(parseAccountScopes(account.scopesJson));
}

export async function getGoogleOAuthScopeStatus(clientId?: string | null): Promise<{
  connected: boolean;
  hasBusinessScope: boolean;
  hasAdwordsScope: boolean;
  scopes: string[];
}> {
  const account = await db.googleAccount.findFirst({
    where: clientId
      ? { status: "active", accessToken: { not: null }, clientId }
      : { status: "active", accessToken: { not: null } },
    select: { scopesJson: true },
  });
  const scopes = parseAccountScopes(account?.scopesJson);
  const hasBusinessScope = scopesIncludeBusinessManage(scopes);
  const hasAdwordsScope = scopesIncludeAdwords(scopes);
  return {
    connected: !!account,
    hasBusinessScope,
    hasAdwordsScope,
    scopes,
  };
}

export async function getValidAccessToken(opts?: {
  clientId?: string | null;
  locationId?: string | null;
}): Promise<string | null> {
  let clientId = opts?.clientId ?? null;
  if (!clientId && opts?.locationId) {
    const loc = await db.location.findUnique({
      where: { id: opts.locationId },
      select: { clientId: true },
    });
    clientId = loc?.clientId ?? null;
  }

  // Prefer end-client OAuth when scoped; else platform account only (never cross into portal tenants).
  const account = clientId
    ? await db.googleAccount.findFirst({
        where: { status: "active", clientId },
        orderBy: { updatedAt: "desc" },
      })
    : await db.googleAccount.findFirst({
        where: { status: "active", clientId: null },
        orderBy: { updatedAt: "desc" },
      });

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
    url.searchParams.set("readMask", "name,title,storeCode,latlng,profile,regularHours,specialHours,serviceItems,categories,phoneNumbers,websiteUri,openInfo,metadata,storefrontAddress");
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
    fetch(`${GBP_API_BASE}/${locationName}?readMask=title,storeCode,latlng,profile,regularHours,specialHours,categories,phoneNumbers,websiteUri,openInfo,metadata,serviceItems,storefrontAddress`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
  );
  return data;
}

/** Fetch set attributes (social URLs, menu, etc.) for a location. */
export async function getLocationAttributes(accessToken: string, locationName: string): Promise<any[]> {
  const clean = locationName.startsWith("locations/") ? locationName : `locations/${locationName}`;
  const data = await withRetry<any>(() =>
    fetch(`${GBP_API_BASE}/${clean}/attributes`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
  );
  return (data.attributes ?? []) as any[];
}

// Fetch products/services using the v4 serviceList endpoint
export async function getLocationProducts(accessToken: string, v4LocationName: string): Promise<any[]> {
  try {
    const data = await withRetry<any>(() =>
      fetch(`${GBP_V4_BASE}/${v4LocationName}/serviceList`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
    );
    const services = data?.serviceItems || [];
    console.log("[getLocationProducts] found", services.length, "service items");
    return services;
  } catch (e: any) {
    console.error("[getLocationProducts] error:", e.message);
    return [];
  }
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
  const accessToken = await getValidAccessToken({ locationId });
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

/** List all media (photos/videos) for a location via v4 API (requires accounts/…/locations/… path). */
export async function listGooglePhotos(accessToken: string, locationName: string, pageSize = 100): Promise<any[]> {
  const items: any[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${GBP_V4_BASE}/${locationName}/media`);
    url.searchParams.set("pageSize", String(pageSize));
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const data = await withRetry<{ mediaItems?: any[]; nextPageToken?: string }>(() =>
      fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() })),
    );

    items.push(...(data.mediaItems ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}

/** Normalize Google's media item category (PROFILE, LOGO, COVER, …). */
export function extractGooglePhotoCategory(photo: Record<string, unknown>): string | undefined {
  const assoc = photo.locationAssociation as Record<string, unknown> | undefined;
  const raw =
    (assoc?.category as string | undefined) ??
    (assoc?.categoryEnum as string | undefined) ??
    (photo.category as string | undefined);
  if (!raw || typeof raw !== "string") return undefined;
  return raw.toUpperCase().replace(/\s+/g, "_");
}

function isLogoCategory(category: string | null | undefined): boolean {
  return category === "PROFILE" || category === "LOGO";
}

function isCoverCategory(category: string | null | undefined): boolean {
  return category === "COVER" || category === "COVER_PHOTO";
}

/** Pull GBP media from Google and upsert BusinessPhoto rows (incl. logo/cover categories). */
export async function syncLocationPhotosFromGoogle(locationId: string): Promise<{
  created: number;
  updated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let created = 0;
  let updated = 0;

  const accessToken = await getValidAccessToken({ locationId });
  if (!accessToken) {
    return { created: 0, updated: 0, errors: ["No valid Google access token"] };
  }

  const gbp = await db.googleBusinessProfile.findFirst({ where: { locationId } });
  if (!gbp) {
    return { created: 0, updated: 0, errors: ["No Google Business Profile linked"] };
  }

  let v4LocationName: string;
  try {
    v4LocationName = await resolveV4LocationName(accessToken, gbp.googleLocationId);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { created: 0, updated: 0, errors: [msg] };
  }

  try {
    const mediaItems = await listGooglePhotos(accessToken, v4LocationName);
    for (const photo of mediaItems) {
      if (!photo.name) continue;
      const imageUrl = photo.googleUrl || photo.thumbnailUrl || photo.sourceUrl || "";
      if (!imageUrl) continue;

      const photoCategory = extractGooglePhotoCategory(photo as Record<string, unknown>) ?? null;
      const existing = await db.businessPhoto.findFirst({ where: { googlePhotoId: photo.name } });

      if (existing) {
        const nextCategory = photoCategory ?? existing.category;
        const nextThumb = photo.thumbnailUrl || existing.thumbnailUrl;
        if (
          existing.category !== nextCategory ||
          existing.imageUrl !== imageUrl ||
          existing.thumbnailUrl !== nextThumb
        ) {
          await db.businessPhoto.update({
            where: { id: existing.id },
            data: {
              category: nextCategory,
              imageUrl,
              thumbnailUrl: nextThumb,
            },
          });
          updated++;
        }
      } else {
        await createBusinessPhotoRecord({
          locationId,
          googlePhotoId: photo.name,
          imageUrl,
          thumbnailUrl: photo.thumbnailUrl || null,
          category: photoCategory,
          uploadedBy: null,
          source: "google",
          status: "active",
        });
        created++;
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(msg);
    await logError("google.sync.photos", null, msg, { locationId });
  }

  return { created, updated, errors };
}

/** Sync social links, chat & related profile fields from Google into location.attributesJson. */
export async function syncLocationProfileExtrasFromGoogle(locationId: string): Promise<{
  updated: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  const accessToken = await getValidAccessToken({ locationId });
  if (!accessToken) return { updated: false, errors: ["No valid Google access token"] };

  const gbp = await db.googleBusinessProfile.findFirst({ where: { locationId } });
  if (!gbp) return { updated: false, errors: ["No Google Business Profile linked"] };

  try {
    const profile = await getBusinessProfile(accessToken, gbp.googleLocationId);
    const googleAttrs = await getLocationAttributes(accessToken, gbp.googleLocationId);
    const location = await db.location.findUnique({
      where: { id: locationId },
      select: { attributesJson: true },
    });
    if (!location) return { updated: false, errors: ["Location not found"] };

    const current = parseLocationAttributes(location.attributesJson);
    const patch: Record<string, unknown> = {};

    const googleAttrsList = googleAttrs as unknown[];
    const social = extractSocialFromGoogleAttributes(googleAttrsList);
    if (Object.keys(social).length > 0) {
      patch.socialLinks = social;
    }

    const chatLink = extractChatLinkFromGoogleAttributes(googleAttrsList);
    if (chatLink && !hasChatLinkInAttrs(current)) {
      patch.chatLink = chatLink;
    }

    const menuUrl =
      extractMenuLinkFromGoogleAttributes(googleAttrsList) ??
      profile.profile?.menuUrl ??
      profile.profile?.menuUri ??
      null;
    if (typeof menuUrl === "string" && menuUrl.trim()) {
      patch.menuLink = menuUrl.trim();
    }

    if (Object.keys(patch).length === 0) {
      return { updated: false, errors: [] };
    }

    const merged = mergeLocationAttributes(current, patch);
    await db.location.update({
      where: { id: locationId },
      data: { attributesJson: JSON.stringify(merged) },
    });
    return { updated: true, errors: [] };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(msg);
    await logError("google.sync.profile_extras", null, msg, { locationId });
    return { updated: false, errors };
  }
}

function hasChatLinkInAttrs(attrs: Record<string, unknown>): boolean {
  const chat = attrs.chatLink;
  return typeof chat === "string" && chat.trim().length > 0;
}

export async function listGooglePosts(accessToken: string, locationName: string, pageSize = 100): Promise<any[]> {
  const allPosts: any[] = [];
  let pageToken: string | undefined;
  const maxPages = 10;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${GBP_V4_BASE}/${locationName}/localPosts`);
    url.searchParams.set("pageSize", String(pageSize));
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const data = await withRetry<any>(() =>
      fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
    );
    if (Array.isArray(data.localPosts)) allPosts.push(...data.localPosts);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return allPosts;
}

export async function createGooglePost(accessToken: string, locationName: string, post: any): Promise<any> {
  const url = `${GBP_V4_BASE}/${locationName}/localPosts`;
  console.log("[createGooglePost] URL:", url);
  console.log("[createGooglePost] Body:", JSON.stringify(post, null, 2));
  const data = await withRetry<any>(() =>
    fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(post),
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
  );
  return data;
}

/** Google localPosts media.sourceUrl must be a public HTTPS URL Google can crawl. */
export function isGoogleFetchablePublicUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local")) return false;
    if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
    // Bare IPv4 hosts (incl. self-hosted Supabase on http IP) are usually rejected
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Google localPosts only accept media.sourceUrl that is publicly crawlable HTTPS.
 * Self-hosted Supabase on http://IP is rejected — rewrite via an HTTPS image proxy
 * so Google can fetch the bytes. Prefer putting Storage behind real HTTPS long-term.
 */
export function toGoogleFetchableImageUrl(imageUrl: string): string {
  if (isGoogleFetchablePublicUrl(imageUrl)) return imageUrl;
  try {
    const u = new URL(imageUrl);
    // weserv expects host/path (optional protocol); output=jpg keeps size reasonable
    const target = `${u.host}${u.pathname}${u.search}`;
    return `https://images.weserv.nl/?url=${encodeURIComponent(target)}&output=jpg`;
  } catch {
    return imageUrl;
  }
}

/**
 * Ensure a post image URL is usable as localPosts media.sourceUrl.
 */
export async function resolveLocalPostMediaSourceUrl(
  _accessToken: string,
  _v4LocationName: string,
  imageUrl: string,
): Promise<string> {
  const resolved = toGoogleFetchableImageUrl(imageUrl);
  if (!isGoogleFetchablePublicUrl(resolved) && resolved === imageUrl) {
    throw new Error(
      "Post image URL is not public HTTPS. Google cannot fetch http:// IP or private storage links. Put Storage behind HTTPS, then retry.",
    );
  }
  return resolved;
}

/** Attach media to a localPosts payload, rewriting non-public URLs via Google upload. */
export async function attachLocalPostMedia(
  accessToken: string,
  v4LocationName: string,
  googlePostData: Record<string, unknown>,
  imageUrl: string | null | undefined,
): Promise<void> {
  if (!imageUrl || imageUrl.includes("localhost") || imageUrl.includes("127.0.0.1")) return;
  const sourceUrl = await resolveLocalPostMediaSourceUrl(accessToken, v4LocationName, imageUrl);
  googlePostData.media = [{ mediaFormat: "PHOTO", sourceUrl }];
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
  updates: { title?: string; summary?: string; callToAction?: any },
  updateMask: string = "summary"
): Promise<any> {
  const masks: string[] = [];
  if (updates.summary !== undefined) masks.push("summary");
  if (updates.callToAction !== undefined) masks.push("callToAction");
  const finalMask = masks.length > 0 ? masks.join(",") : updateMask;

  const data = await withRetry<any>(() =>
    fetch(`${GBP_V4_BASE}/${postName}?updateMask=${encodeURIComponent(finalMask)}`, {
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
  // v4 API: flat MediaItem shape — mediaFormat is enum "PHOTO", not nested object.
  const body: Record<string, unknown> = {
    mediaFormat: "PHOTO",
    sourceUrl: photo.sourceUrl,
  };
  if (photo.description) {
    body.description = photo.description;
  }
  if (photo.category) {
    body.locationAssociation = { category: photo.category };
  }

  const data = await withRetry<any>(() =>
    fetch(`${GBP_V4_BASE}/${locationName}/media`, {
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
    googleUrl: data.googleUrl ?? data.sourceUrl ?? undefined,
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
  const cleanName = locationName.startsWith("locations/") ? locationName : `locations/${locationName}`;
  const url = new URL(`${GBP_PERF_BASE}/${cleanName}:getDailyMetricsTimeSeries`);
  url.searchParams.set("dailyRange.start_date.year", String(startDate.year));
  url.searchParams.set("dailyRange.start_date.month", String(startDate.month));
  url.searchParams.set("dailyRange.start_date.day", String(startDate.day));
  url.searchParams.set("dailyRange.end_date.year", String(endDate.year));
  url.searchParams.set("dailyRange.end_date.month", String(endDate.month));
  url.searchParams.set("dailyRange.end_date.day", String(endDate.day));
  url.searchParams.set("dailyMetric", metricType);

  console.log("[getPerformanceMetrics] URL:", url.toString());
  const data = await withRetry<any>(() =>
    fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
  );
  console.log("[getPerformanceMetrics]", metricType, "→", JSON.stringify(data).slice(0, 300));
  return data.timeSeries?.datedValues ?? [];
}

export type DailyPerformanceRow = {
  date: Date;
  searchViews: number;
  mapsViews: number;
  searchDesktop: number;
  searchMobile: number;
  mapsDesktop: number;
  mapsMobile: number;
  websiteClicks: number;
  phoneCalls: number;
  directionRequests: number;
  conversations: number;
  bookings: number;
};

/** Calendar date at UTC midnight — avoids IST shifting the stored day. */
function utcDateFromParts(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

const PERF_METRIC_MAP: { key: keyof DailyPerformanceRow; metric: string }[] = [
  { key: "searchDesktop", metric: "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH" },
  { key: "searchMobile", metric: "BUSINESS_IMPRESSIONS_MOBILE_SEARCH" },
  { key: "mapsDesktop", metric: "BUSINESS_IMPRESSIONS_DESKTOP_MAPS" },
  { key: "mapsMobile", metric: "BUSINESS_IMPRESSIONS_MOBILE_MAPS" },
  { key: "websiteClicks", metric: "WEBSITE_CLICKS" },
  { key: "phoneCalls", metric: "CALL_CLICKS" },
  { key: "directionRequests", metric: "BUSINESS_DIRECTION_REQUESTS" },
  { key: "conversations", metric: "BUSINESS_CONVERSATIONS" },
  { key: "bookings", metric: "BUSINESS_BOOKINGS" },
];

function emptyDay(year: number, month: number, day: number): DailyPerformanceRow {
  return {
    date: utcDateFromParts(year, month, day),
    searchViews: 0,
    mapsViews: 0,
    searchDesktop: 0,
    searchMobile: 0,
    mapsDesktop: 0,
    mapsMobile: 0,
    websiteClicks: 0,
    phoneCalls: 0,
    directionRequests: 0,
    conversations: 0,
    bookings: 0,
  };
}

function metricValue(entry: any): number {
  if (entry?.value == null || entry?.value === "") return 0;
  return parseInt(String(entry.value), 10) || 0;
}

/** Prefer multi-metric endpoint (matches GBP Performance UI better / fewer calls). */
async function fetchMultiDailyMetrics(
  accessToken: string,
  locationName: string,
  startDate: { year: number; month: number; day: number },
  endDate: { year: number; month: number; day: number },
): Promise<DailyPerformanceRow[] | null> {
  const cleanName = locationName.startsWith("locations/") ? locationName : `locations/${locationName}`;
  const url = new URL(`${GBP_PERF_BASE}/${cleanName}:fetchMultiDailyMetricsTimeSeries`);
  for (const m of PERF_METRIC_MAP) url.searchParams.append("dailyMetrics", m.metric);
  url.searchParams.set("dailyRange.start_date.year", String(startDate.year));
  url.searchParams.set("dailyRange.start_date.month", String(startDate.month));
  url.searchParams.set("dailyRange.start_date.day", String(startDate.day));
  url.searchParams.set("dailyRange.end_date.year", String(endDate.year));
  url.searchParams.set("dailyRange.end_date.month", String(endDate.month));
  url.searchParams.set("dailyRange.end_date.day", String(endDate.day));

  console.log("[fetchMultiDailyMetrics] URL:", url.toString().slice(0, 220) + "…");
  try {
    const data = await withRetry<any>(() =>
      fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() })),
    );

    const dailyMap = new Map<string, DailyPerformanceRow>();
    const seriesGroups = data.multiDailyMetricTimeSeries ?? [];
    for (const group of seriesGroups) {
      for (const series of group.dailyMetricTimeSeries ?? []) {
        const metricName = String(series.dailyMetric ?? "");
        const job = PERF_METRIC_MAP.find((m) => m.metric === metricName);
        if (!job) continue;
        for (const entry of series.timeSeries?.datedValues ?? []) {
          if (!entry.date?.year) continue;
          const y = entry.date.year as number;
          const m = entry.date.month as number;
          const d = entry.date.day as number;
          const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          if (!dailyMap.has(dateStr)) dailyMap.set(dateStr, emptyDay(y, m, d));
          const day = dailyMap.get(dateStr)!;
          (day as any)[job.key] += metricValue(entry);
        }
      }
    }

    if (dailyMap.size === 0) {
      console.warn("[fetchMultiDailyMetrics] empty series — falling back to per-metric calls");
      return null;
    }

    // Multi endpoint sometimes omits sparse metrics (chat/bookings) — fill from single calls
    for (const job of PERF_METRIC_MAP.filter((j) => j.key === "conversations" || j.key === "bookings")) {
      const already = Array.from(dailyMap.values()).reduce((a, d) => a + ((d as any)[job.key] as number), 0);
      if (already > 0) continue;
      try {
        const rows = await getPerformanceMetrics(accessToken, locationName, startDate, endDate, job.metric);
        for (const entry of rows) {
          if (!entry.date?.year) continue;
          const y = entry.date.year as number;
          const m = entry.date.month as number;
          const d = entry.date.day as number;
          const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          if (!dailyMap.has(dateStr)) dailyMap.set(dateStr, emptyDay(y, m, d));
          (dailyMap.get(dateStr) as any)[job.key] += metricValue(entry);
        }
      } catch (err: any) {
        console.warn(`[fetchMultiDailyMetrics] ${job.metric} fill failed:`, err.message);
      }
    }

    for (const day of dailyMap.values()) {
      day.searchViews = day.searchDesktop + day.searchMobile;
      day.mapsViews = day.mapsDesktop + day.mapsMobile;
    }
    console.log("[fetchMultiDailyMetrics] days:", dailyMap.size);
    return Array.from(dailyMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  } catch (e: any) {
    console.error("[fetchMultiDailyMetrics] failed:", e.message);
    return null;
  }
}

/** Fetch full GBP Performance metrics (desktop+mobile impressions, actions, chat, bookings). */
export async function getFullPerformanceMetrics(
  accessToken: string,
  locationName: string,
  daysBack: number = 180,
): Promise<DailyPerformanceRow[]> {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - Math.min(Math.max(daysBack, 1), 540));

  const startDate = { year: start.getFullYear(), month: start.getMonth() + 1, day: start.getDate() };
  const endDate = { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() };

  const multi = await fetchMultiDailyMetrics(accessToken, locationName, startDate, endDate);
  if (multi && multi.length > 0) return multi;

  // Fallback: one request per metric
  const results = await Promise.allSettled(
    PERF_METRIC_MAP.map((j) =>
      getPerformanceMetrics(accessToken, locationName, startDate, endDate, j.metric),
    ),
  );

  const rejectedMsgs: string[] = [];
  results.forEach((r, i) => {
    const name = PERF_METRIC_MAP[i]!.metric;
    if (r.status === "rejected") {
      const msg = (r as PromiseRejectedResult).reason?.message ?? String(r.reason);
      rejectedMsgs.push(`${name}: ${msg}`);
      console.error("[getFullPerformanceMetrics] REJECTED", name, msg);
    } else {
      console.log("[getFullPerformanceMetrics] FULFILLED", name, "entries:", r.value?.length ?? 0);
    }
  });

  const dailyMap = new Map<string, DailyPerformanceRow>();

  results.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    const key = PERF_METRIC_MAP[i]!.key;
    for (const entry of result.value) {
      if (!entry.date?.year) continue;
      const y = entry.date.year as number;
      const m = entry.date.month as number;
      const d = entry.date.day as number;
      const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (!dailyMap.has(dateStr)) dailyMap.set(dateStr, emptyDay(y, m, d));
      const day = dailyMap.get(dateStr)!;
      (day as any)[key] += metricValue(entry);
    }
  });

  if (dailyMap.size === 0 && rejectedMsgs.length > 0) {
    throw new Error(
      rejectedMsgs.some((m) => /403|access denied|permission/i.test(m))
        ? "Google Performance API access denied (403). More → Google → reconnect, and enable Business Profile Performance API."
        : `Google Performance API returned no data. ${rejectedMsgs[0]}`,
    );
  }

  for (const day of dailyMap.values()) {
    day.searchViews = day.searchDesktop + day.searchMobile;
    day.mapsViews = day.mapsDesktop + day.mapsMobile;
  }

  return Array.from(dailyMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

// Fetch search keywords impressions (monthly) from Google Performance API
export async function getSearchKeywords(
  accessToken: string,
  locationName: string,
  monthsBack: number = 6
): Promise<{ keyword: string; impressions: number }[]> {
  const cleanName = locationName.startsWith("locations/") ? locationName : `locations/${locationName}`;

  const now = new Date();
  const startMonth = new Date(now);
  startMonth.setMonth(now.getMonth() - monthsBack);

  const url = new URL(`${GBP_PERF_BASE}/${cleanName}/searchkeywords/impressions/monthly`);
  url.searchParams.set("monthlyRange.start_month.year", String(startMonth.getFullYear()));
  url.searchParams.set("monthlyRange.start_month.month", String(startMonth.getMonth() + 1));
  url.searchParams.set("monthlyRange.end_month.year", String(now.getFullYear()));
  url.searchParams.set("monthlyRange.end_month.month", String(now.getMonth() + 1));
  url.searchParams.set("pageSize", "20");

  try {
    const data = await withRetry<any>(() =>
      fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() }))
    );

    const keywords = (data.searchKeywordsCounts ?? []).map((item: any) => ({
      keyword: item.searchKeyword ?? "",
      impressions: parseInt(String(item.insightsValue?.value ?? item.insightsValue?.threshold ?? "0"), 10),
    }));

    return keywords.sort((a: any, b: any) => b.impressions - a.impressions);
  } catch (e: any) {
    console.error("[getSearchKeywords] error:", e.message);
    return [];
  }
}

// ─── Sync real analytics data into DB ─────────────────────────────────────

export async function syncLocationAnalytics(locationId: string, daysBack: number = 180): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  const accessToken = await getValidAccessToken({ locationId });
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
    console.log("[syncLocationAnalytics] Fetching metrics for:", gbp.googleLocationId, "daysBack:", daysBack);
    const dailyMetrics = await getFullPerformanceMetrics(accessToken, gbp.googleLocationId, daysBack);
    console.log("[syncLocationAnalytics] Got", dailyMetrics.length, "daily metric entries");

    if (dailyMetrics.length === 0) {
      return {
        synced: 0,
        errors: [
          "Google returned 0 analytics days for this location. Reconnect Google or check Performance API access.",
        ],
      };
    }

    // Only replace after a successful non-empty fetch (never wipe on failure)
    await db.analyticDaily.deleteMany({ where: { locationId } });
    await db.analyticDaily.createMany({
      data: dailyMetrics.map((day) => ({
        locationId,
        date: day.date,
        searchViews: day.searchViews,
        mapsViews: day.mapsViews,
        searchDesktop: day.searchDesktop,
        searchMobile: day.searchMobile,
        mapsDesktop: day.mapsDesktop,
        mapsMobile: day.mapsMobile,
        websiteClicks: day.websiteClicks,
        phoneCalls: day.phoneCalls,
        directionRequests: day.directionRequests,
        conversations: day.conversations,
        bookings: day.bookings,
      })),
    });
    const synced = dailyMetrics.length;

    console.log("[syncLocationAnalytics] Wrote", synced, "days for", locationId);
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

/** Authoritative verification status from Google Voice of Merchant API. */
export async function getVoiceOfMerchantState(
  accessToken: string,
  locationName: string,
): Promise<VoiceOfMerchantStateLike> {
  const data = await withRetry<VoiceOfMerchantStateLike>(() =>
    fetch(`${GBP_VERIFY_BASE}/${locationName}/VoiceOfMerchantState`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() })),
  );
  return data ?? {};
}

/**
 * Fetch the verification options available for a location.
 * `languageCode` is required by Google. Do not send `context` unless this is a
 * CUSTOMER_LOCATION_ONLY service-area business (invalid for storefront locs).
 */
export async function fetchVerificationOptions(
  accessToken: string,
  locationName: string,
  languageCode = "en",
): Promise<any> {
  const cleanName = locationName.startsWith("locations/") ? locationName : `locations/${locationName}`;
  const body = { languageCode: languageCode || "en" };
  const data = await withRetry<any>(() =>
    fetch(`${GBP_VERIFY_BASE}/${cleanName}:fetchVerificationOptions`, {
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
 * REST `locations.verify` expects flat RequestData fields (not nested *Input
 * objects from older guides):
 *   - ADDRESS → mailerContact
 *   - PHONE_CALL | SMS → phoneNumber
 *   - EMAIL → emailAddress
 *
 * `input` from our API still uses:
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
  const body: Record<string, string> = { method, languageCode: "en" };
  if (method === "ADDRESS") {
    const contact =
      (typeof input?.mailerContact === "string" && input.mailerContact) ||
      (typeof input?.mailerContactName === "string" && input.mailerContactName) ||
      "";
    if (contact) body.mailerContact = contact.trim();
  } else if (method === "PHONE_CALL" || method === "SMS") {
    const raw = typeof input?.phoneNumber === "string" ? input.phoneNumber.trim() : "";
    if (raw) body.phoneNumber = normalizeVerificationPhone(raw);
  } else if (method === "EMAIL") {
    const email = typeof input?.emailAddress === "string" ? input.emailAddress.trim() : "";
    if (email) body.emailAddress = email;
  }

  const cleanName = locationName.startsWith("locations/") ? locationName : `locations/${locationName}`;
  const data = await withRetry<any>(() =>
    fetch(`${GBP_VERIFY_BASE}/${cleanName}:verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: () => r.text() })),
  );
  // API returns { verification: {...} } — unwrap for callers that expect the resource.
  return data?.verification ?? data;
}

/** Prefer E.164 for PHONE_CALL/SMS; treat bare 10-digit Indian mobiles as +91. */
function normalizeVerificationPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) {
    return `+${trimmed.slice(1).replace(/\D/g, "")}`;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return digits ? `+${digits}` : trimmed;
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

/** Resolve verification, profile status, and Maps URL from Google profile metadata. */
export async function reconcileGoogleProfileFields(
  accessToken: string,
  googleLocationId: string,
  profile: {
    metadata?: {
      placeId?: string | null;
      mapsUri?: string | null;
      newReviewUri?: string | null;
      hasVoiceOfMerchant?: boolean | null;
    } | null;
    openInfo?: { status?: string | null } | null;
    title?: string | null;
    latlng?: { latitude?: number | null; longitude?: number | null } | null;
  },
  opts?: {
    existingMapUrl?: string | null;
    existingReviewUrl?: string | null;
    name?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    checkVerifications?: boolean;
  },
): Promise<{
  verificationState: "verified" | "unverified";
  verificationPending: boolean;
  profileStatus: "active" | "disabled";
  mapUrl: string | null;
  placeId: string | null;
  reviewUrl: string | null;
}> {
  let vom: VoiceOfMerchantStateLike = {};
  try {
    vom = await getVoiceOfMerchantState(accessToken, googleLocationId);
  } catch {
    // If VOM check fails, default to unverified — never falsely mark verified.
  }
  const verificationState = resolveVerificationFromVoiceOfMerchant(vom);
  const verificationPending = hasPendingVerification(vom);

  const latitude = opts?.latitude ?? profile.latlng?.latitude ?? null;
  const longitude = opts?.longitude ?? profile.latlng?.longitude ?? null;
  const name = opts?.name ?? profile.title ?? null;

  return {
    verificationState,
    verificationPending,
    profileStatus: resolveProfileStatus(profile.openInfo),
    mapUrl: resolveGbpMapUrl({
      metadata: profile.metadata,
      googleLocationId,
      name,
      latitude,
      longitude,
      existingUrl: opts?.existingMapUrl,
    }),
    placeId: profile.metadata?.placeId?.trim() || null,
    reviewUrl:
      profile.metadata?.newReviewUri?.trim() ||
      opts?.existingReviewUrl?.trim() ||
      null,
  };
}

// ─── v4 Path Resolution ──────────────────────────────────────────────────
// Google v4 API requires "accounts/{aid}/locations/{lid}" format, but v1
// Business Information API uses just "locations/{lid}". This helper resolves
// the full v4 path by looking up the account that owns the location.

/** Cache account name per token — never share across portal vs platform OAuth. */
const _accountNameByToken = new Map<string, string>();

export async function resolveV4LocationName(accessToken: string, v1LocationName: string): Promise<string> {
  if (v1LocationName.startsWith("accounts/")) return v1LocationName;
  const cacheKey = accessToken.slice(-32);
  let accountName = _accountNameByToken.get(cacheKey) ?? null;
  if (!accountName) {
    const accounts = await listGoogleAccounts(accessToken);
    accountName = accounts[0]?.name ?? null;
    if (accountName) _accountNameByToken.set(cacheKey, accountName);
  }
  if (!accountName) throw new Error("No Google account found");
  const locationId = v1LocationName.replace("locations/", "");
  return `${accountName}/locations/${locationId}`;
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

          const profileFields: {
            verificationState: "verified" | "unverified";
            profileStatus: ReturnType<typeof resolveProfileStatus>;
            mapUrl: string | null;
            placeId: string | null;
            reviewUrl: string | null;
          } = {
            verificationState: "unverified",
            profileStatus: resolveProfileStatus(loc.openInfo),
            mapUrl: resolveGbpMapUrl({
              metadata: loc.metadata,
              googleLocationId: loc.name,
              name: loc.title,
              latitude: loc.latlng?.latitude,
              longitude: loc.latlng?.longitude,
            }),
            placeId: loc.metadata?.placeId?.trim() || null,
            reviewUrl: loc.metadata?.newReviewUri?.trim() || null,
          };

          // Accurate verification requires VoiceOfMerchantState per location.
          try {
            const vom = await getVoiceOfMerchantState(accessToken, loc.name);
            profileFields.verificationState = resolveVerificationFromVoiceOfMerchant(vom);
          } catch {
            // Keep unverified if VOM check fails.
          }

          const locData = {
            googleLocationId: loc.name,
            profileName: loc.title || "Unknown",
            primaryCategory: loc.categories?.primaryCategory?.displayName || null,
            additionalCategoriesJson: JSON.stringify(loc.categories?.additionalCategories?.map((c: any) => c.displayName) || []),
            averageRating: loc.metadata?.averageRating || 0,
            totalReviews: loc.metadata?.reviewCount || 0,
            ...profileFields,
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

export async function syncGoogleReviews(locationId: string, googleLocationId: string): Promise<{ synced: number; autoReplied: number; errors: string[] }> {
  const errors: string[] = [];
  const accessToken = await getValidAccessToken({ locationId });
  if (!accessToken) {
    await logError("google.sync.reviews", null, "No valid access token", { locationId, googleLocationId, step: "auth" });
    return { synced: 0, autoReplied: 0, errors: ["No valid access token"] };
  }

  try {
    const v4Name = await resolveV4LocationName(accessToken, googleLocationId);
    const reviews = await listReviews(accessToken, v4Name);
    const result = await syncLocationReviewsFromGoogle(locationId, reviews);
    return { synced: result.created, autoReplied: result.autoReplied, errors };
  } catch (e: any) {
    await logError("google.sync.reviews", null, e.message, { locationId, googleLocationId, step: "fetch" });
    return { synced: 0, autoReplied: 0, errors: [e.message] };
  }
}

// ─── Full Location Sync — fetches ALL real GMB data for one location ──────

export async function syncLocationFull(locationId: string): Promise<{
  success: boolean;
  synced: {
    reviews: number;
    photos: number;
    hours: number;
    services: number;
    categories: number;
    posts: number;
    analytics: number;
  };
  errors: string[];
}> {
  const errors: string[] = [];
  const result = { reviews: 0, photos: 0, hours: 0, services: 0, categories: 0, posts: 0, analytics: 0 };
  const accessToken = await getValidAccessToken({ locationId });

  if (!accessToken) {
    await logError("google.sync.full", null, "No valid Google access token. Please reconnect Google OAuth.", { locationId, step: "auth" });
    return { success: false, synced: result, errors: ["No valid Google access token. Please reconnect Google OAuth."] };
  }

  const locClient = await db.location.findUnique({ where: { id: locationId }, select: { clientId: true } });
  const account = locClient?.clientId
    ? await db.googleAccount.findFirst({ where: { status: "active", clientId: locClient.clientId }, select: { scopesJson: true } })
    : await db.googleAccount.findFirst({ where: { status: "active", clientId: null }, select: { scopesJson: true } })
      || await db.googleAccount.findFirst({ where: { status: "active" }, select: { scopesJson: true } });
  if (!scopesIncludeBusinessManage(parseAccountScopes(account?.scopesJson))) {
    return {
      success: false,
      synced: result,
      errors: [
        "Google Business Profile permission missing. More → Google → Disconnect → Connect again and allow all permissions.",
      ],
    };
  }

  // Get the GoogleBusinessProfile linked to this location
  const gbp = await db.googleBusinessProfile.findFirst({ where: { locationId } });
  if (!gbp) {
    await logError("google.sync.full", null, "No Google Business Profile linked to this location. Import this location from Google first.", { locationId, step: "lookup" });
    return { success: false, synced: result, errors: ["No Google Business Profile linked to this location. Import this location from Google first."] };
  }

  const locationName = gbp.googleLocationId; // e.g. "locations/12345" (v1 format)
  // v4 API (reviews, posts, media) needs "accounts/{aid}/locations/{lid}" format
  let v4LocationName: string;
  try {
    v4LocationName = await resolveV4LocationName(accessToken, locationName);
  } catch {
    v4LocationName = locationName; // fallback
  }

  try {
    // ─── 1. Fetch full business profile from Google ─────────────────────
    const profile = await getBusinessProfile(accessToken, locationName);
    const parsed = parseGoogleAddress(profile.storefrontAddress ?? profile.address);
    const fallbackCity = parsed.city
      || extractLocationFromName(profile.title || gbp.profileName).city
      || inferCityFromAddress(parsed.address)
      || undefined;

    const existingLoc = await db.location.findUnique({ where: { id: locationId }, select: { city: true } });

    // Update Location record with real data
    await db.location.update({
      where: { id: locationId },
      data: {
        name: profile.title || gbp.profileName,
        address: parsed.address || formatAddress(profile.storefrontAddress ?? profile.address),
        city: fallbackCity || (existingLoc?.city !== "Unknown" ? existingLoc?.city : undefined) || "Unknown",
        region: parsed.region,
        state: parsed.state,
        pincode: parsed.pincode,
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
    const profileFields = await reconcileGoogleProfileFields(accessToken, locationName, profile, {
      existingMapUrl: gbp.mapUrl,
      existingReviewUrl: gbp.reviewUrl,
      name: profile.title || gbp.profileName,
      latitude: profile.latlng?.latitude ?? null,
      longitude: profile.latlng?.longitude ?? null,
    });

    await db.googleBusinessProfile.update({
      where: { id: gbp.id },
      data: {
        profileName: profile.title || gbp.profileName,
        primaryCategory: profile.categories?.primaryCategory?.displayName || gbp.primaryCategory,
        additionalCategoriesJson: JSON.stringify(profile.categories?.additionalCategories?.map((c: any) => c.displayName) || []),
        averageRating: profile.metadata?.averageRating || 0,
        totalReviews: profile.metadata?.reviewCount || 0,
        verificationState: profileFields.verificationState,
        profileStatus: profileFields.profileStatus,
        mapUrl: profileFields.mapUrl,
        placeId: profileFields.placeId || undefined,
        reviewUrl: profileFields.reviewUrl || undefined,
      },
    });

    // ─── 2. Sync Business Hours ─────────────────────────────────────────
    if (profile.regularHours?.periods?.length > 0) {
      await db.businessHour.deleteMany({ where: { locationId } });
      const dayMap: Record<string, number> = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 };
      const hourRows = profile.regularHours.periods.map((period: any) => ({
        locationId,
        dayOfWeek: dayMap[period.openDay] ?? 0,
        openTime: `${period.openTime?.hours?.toString().padStart(2, "0") || "10"}:${period.openTime?.minutes?.toString().padStart(2, "0") || "00"}`,
        closeTime: `${period.closeTime?.hours?.toString().padStart(2, "0") || "20"}:${period.closeTime?.minutes?.toString().padStart(2, "0") || "00"}`,
        isClosed: false,
      }));
      await db.businessHour.createMany({ data: hourRows });
      result.hours = hourRows.length;
    }

    // ─── 3. Sync Categories ─────────────────────────────────────────────
    if (profile.categories) {
      await db.businessCategory.deleteMany({ where: { locationId } });
      const catRows: { locationId: string; categoryName: string; isPrimary: boolean }[] = [];
      if (profile.categories.primaryCategory) {
        catRows.push({
          locationId,
          categoryName: profile.categories.primaryCategory.displayName || "Auto Repair Shop",
          isPrimary: true,
        });
      }
      for (const cat of profile.categories.additionalCategories || []) {
        catRows.push({ locationId, categoryName: cat.displayName || "", isPrimary: false });
      }
      if (catRows.length) await db.businessCategory.createMany({ data: catRows });
      result.categories = catRows.length;
    }

    // ─── 4. Sync Services ───────────────────────────────────────────────
    if (profile.serviceItems?.length > 0) {
      await db.service.deleteMany({ where: { locationId } });
      const serviceRows = profile.serviceItems.map((service: any) => ({
        locationId,
        serviceName:
          service.freeFormServiceItem?.label?.displayName
          || service.structuredServiceItem?.description
          || service.displayName
          || service.name
          || "Service",
        description: service.description || null,
        category:
          service.freeFormServiceItem?.categoryId
          || service.structuredServiceItem?.serviceTypeId
          || service.category
          || null,
        status: "active",
      }));
      await db.service.createMany({ data: serviceRows });
      result.services = serviceRows.length;
    }

    // ─── 5–8. Local profile extras (fast DB writes; no Google round-trips) ─
    try {
      const description = profile.profile?.description || profile.metadata?.description || null;
      const website = profile.websiteUri || null;
      const appointmentUrl = profile.profile?.appointmentUrl || null;
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
    } catch (e: any) {
      errors.push(`Business info sync: ${e.message}`);
      await logError("google.sync.full", null, e.message, { locationId, step: "business_info" });
    }

    try {
      if (profile.attributes?.length > 0) {
        await db.businessAttribute.deleteMany({ where: { locationId } });
        await db.businessAttribute.createMany({
          data: profile.attributes.map((attr: any) => ({
            locationId,
            attributeName: attr.name || attr.displayName || "Attribute",
            attributeValue: Array.isArray(attr.value) ? attr.value.join(", ") : String(attr.value ?? "true"),
          })),
        });
      }
    } catch (e: any) {
      errors.push(`Attributes sync: ${e.message}`);
      await logError("google.sync.full", null, e.message, { locationId, step: "attributes" });
    }

    try {
      if (profile.specialHours?.specialHourRanges?.length > 0) {
        await db.specialHour.deleteMany({ where: { locationId } });
        await db.specialHour.createMany({
          data: profile.specialHours.specialHourRanges.map((range: any) => {
            const startDate = range.startDate
              ? new Date(`${range.startDate.year}-${String(range.startDate.month).padStart(2, "0")}-${String(range.startDate.day).padStart(2, "0")}`)
              : new Date();
            return {
              locationId,
              date: startDate,
              openTime: range.openTime ? `${String(range.openTime.hours).padStart(2, "0")}:${String(range.openTime.minutes).padStart(2, "0")}` : null,
              closeTime: range.closeTime ? `${String(range.closeTime.hours).padStart(2, "0")}:${String(range.closeTime.minutes).padStart(2, "0")}` : null,
              isClosed: !range.openTime,
            };
          }),
        });
      }
    } catch (e: any) {
      errors.push(`Special hours sync: ${e.message}`);
      await logError("google.sync.full", null, e.message, { locationId, step: "special_hours" });
    }

    // ─── 9. Parallel Google pulls: reviews + photos + posts + analytics ──
    // Product catalog scrape is slow/unreliable — skip in full sync (use Products → Import).
    const [reviewOutcome, photoOutcome, postsOutcome, analyticsOutcome, extrasOutcome] = await Promise.all([
      (async () => {
        try {
          const reviews = await listReviews(accessToken, v4LocationName);
          const reviewResult = await syncLocationReviewsFromGoogle(locationId, reviews);
          return { created: reviewResult.created, error: null as string | null };
        } catch (e: any) {
          await logError("google.sync.full", null, e.message, { locationId, step: "reviews" });
          return { created: 0, error: `Reviews sync: ${e.message}` };
        }
      })(),
      (async () => {
        try {
          const photoResult = await syncLocationPhotosFromGoogle(locationId);
          return {
            count: photoResult.created + photoResult.updated,
            errors: photoResult.errors.map((e) => `Photos sync: ${e}`),
          };
        } catch (e: any) {
          await logError("google.sync.full", null, e.message, { locationId, step: "photos" });
          return { count: 0, errors: [`Photos sync: ${e.message}`] };
        }
      })(),
      (async () => {
        try {
          const googlePosts = await listGooglePosts(accessToken, v4LocationName);
          const existingPosts = await db.post.findMany({
            where: { locationId, googlePostId: { not: null } },
            select: { googlePostId: true },
          });
          const existingPostIds = new Set(existingPosts.map((p) => p.googlePostId).filter(Boolean) as string[]);
          const existingProducts = await db.product.findMany({
            where: { locationId, googleItemId: { not: null } },
            select: { googleItemId: true },
          });
          const existingProductIds = new Set(existingProducts.map((p) => p.googleItemId).filter(Boolean) as string[]);

          const postRows: any[] = [];
          const productRows: any[] = [];
          for (const gp of googlePosts) {
            const googlePostId = gp.name;
            if (!googlePostId) continue;
            const topicType = gp.topicType || "STANDARD";

            if (topicType === "PRODUCT") {
              if (existingProductIds.has(googlePostId)) continue;
              productRows.push({
                locationId,
                name: gp.summary || gp.event?.title || "Product",
                description: gp.summary || null,
                imageUrl: gp.media?.[0]?.googleUrl || gp.media?.[0]?.sourceUrl || null,
                googleItemId: googlePostId,
                source: "google",
                price: gp.offer?.couponCode ? parseFloat(gp.offer.couponCode) || null : null,
                category: gp.callToAction?.url ? "Product" : "Service",
              });
              existingProductIds.add(googlePostId);
              continue;
            }

            if (existingPostIds.has(googlePostId)) continue;
            const postType = topicType === "OFFER" ? "offer" : topicType === "EVENT" ? "event" : "whats_new";
            postRows.push({
              locationId,
              profileId: gbp.id,
              type: postType,
              title: gp.event?.title || gp.offer?.title || "",
              content: gp.summary || "",
              ctaType: gp.callToAction?.actionType?.toLowerCase() || null,
              ctaUrl: gp.callToAction?.url || null,
              imageUrl: gp.media?.[0]?.googleUrl || gp.media?.[0]?.sourceUrl || null,
              status: gp.state === "LIVE" ? "published" : gp.state === "REJECTED" ? "failed" : "published",
              source: "google",
              googlePostId,
              publishedAt: gp.createTime ? new Date(gp.createTime) : new Date(),
              createdAt: gp.createTime ? new Date(gp.createTime) : new Date(),
              couponCode: gp.offer?.couponCode || null,
              redeemUrl: gp.offer?.redeemOnlineUrl || null,
              offerTerms: gp.offer?.termsConditions || null,
              startDate: gp.event?.schedule?.startDate
                ? new Date(`${gp.event.schedule.startDate.year}-${String(gp.event.schedule.startDate.month).padStart(2, "0")}-${String(gp.event.schedule.startDate.day).padStart(2, "0")}`)
                : null,
              startTime: gp.event?.schedule?.startTime
                ? `${String(gp.event.schedule.startTime.hours).padStart(2, "0")}:${String(gp.event.schedule.startTime.minutes || 0).padStart(2, "0")}`
                : null,
              endDate: gp.event?.schedule?.endDate
                ? new Date(`${gp.event.schedule.endDate.year}-${String(gp.event.schedule.endDate.month).padStart(2, "0")}-${String(gp.event.schedule.endDate.day).padStart(2, "0")}`)
                : null,
              endTime: gp.event?.schedule?.endTime
                ? `${String(gp.event.schedule.endTime.hours).padStart(2, "0")}:${String(gp.event.schedule.endTime.minutes || 0).padStart(2, "0")}`
                : null,
            });
            existingPostIds.add(googlePostId);
          }

          if (postRows.length) await db.post.createMany({ data: postRows });
          if (productRows.length) await db.product.createMany({ data: productRows });
          console.log(`[syncLocationFull] Posts synced: ${postRows.length}, Products from posts: ${productRows.length}, Total Google posts fetched: ${googlePosts.length}`);
          return { posts: postRows.length, error: null as string | null };
        } catch (e: any) {
          await logError("google.sync.full", null, e.message, { locationId, step: "posts" });
          return { posts: 0, error: `Posts sync: ${e.message}` };
        }
      })(),
      (async () => {
        try {
          const analyticsResult = await syncLocationAnalytics(locationId, 180);
          const stepErrors: string[] = [];
          if (analyticsResult.errors.length > 0) {
            stepErrors.push(`Analytics sync: ${analyticsResult.errors.join("; ")}`);
            await logError("google.sync.full", null, analyticsResult.errors.join("; "), { locationId, step: "analytics" });
          }
          if (analyticsResult.synced === 0 && analyticsResult.errors.length === 0) {
            stepErrors.push("Analytics sync: Google returned 0 daily metric rows for this location");
          }
          return { synced: analyticsResult.synced, errors: stepErrors };
        } catch (e: any) {
          await logError("google.sync.full", null, e.message, { locationId, step: "analytics" });
          return { synced: 0, errors: [`Analytics sync: ${e.message}`] };
        }
      })(),
      (async () => {
        try {
          const extrasResult = await syncLocationProfileExtrasFromGoogle(locationId);
          return { errors: extrasResult.errors.map((e) => `Profile extras: ${e}`) };
        } catch (e: any) {
          return { errors: [`Profile extras: ${e.message}`] };
        }
      })(),
    ]);

    result.reviews += reviewOutcome.created;
    if (reviewOutcome.error) errors.push(reviewOutcome.error);
    result.photos += photoOutcome.count;
    errors.push(...photoOutcome.errors);
    result.posts = postsOutcome.posts;
    if (postsOutcome.error) errors.push(postsOutcome.error);
    result.analytics = analyticsOutcome.synced;
    errors.push(...analyticsOutcome.errors);
    errors.push(...extrasOutcome.errors);

    // Recompute health & visibility scores from synced data
    try {
      await refreshLocationScores(locationId, { writeAudit: true });
    } catch (e: any) {
      errors.push(`Score refresh: ${e.message}`);
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
  allowedRedirectUris: getAllowedGoogleRedirectUris(),
  mode: IS_CONFIGURED ? "production" : "not_configured",
};
