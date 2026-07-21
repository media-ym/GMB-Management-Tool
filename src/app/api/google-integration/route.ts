import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { getGoogleAuthUrl, getValidAccessToken, googleServiceStatus, revokeGoogleToken, isGoogleOAuthConnected, resolveGoogleRedirectUri, rememberOAuthState, syncLocationFull, getGoogleOAuthScopeStatus, scopesIncludeBusinessManage, parseAccountScopes } from "@/lib/google-service";
import { decryptToken } from "@/lib/token-crypto";

export const dynamic = "force-dynamic";

// GET /api/google-integration — OAuth status, connected accounts, sync health, API status
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.view")) return forbidden();

  const [accounts, profiles, syncLogs, errorLogs] = await Promise.all([
    db.googleAccount.findMany({ include: { profiles: { select: { id: true, profileName: true, profileStatus: true, location: { select: { name: true, city: true } } } } } }),
    db.googleBusinessProfile.findMany({ include: { location: { select: { name: true, city: true, syncStatus: true, lastSyncedAt: true } } } }),
    db.syncLog.findMany({ where: { status: { in: ["failed", "partial"] } }, orderBy: { startedAt: "desc" }, take: 5, include: { location: { select: { name: true, city: true } } } }),
    db.errorLog.findMany({ where: { module: { contains: "google" }, resolved: false }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const connectedProfiles = profiles.length;
  const verifiedProfiles = profiles.filter(p => p.verificationState === "verified").length;
  const activeProfiles = profiles.filter(p => p.profileStatus === "active").length;
  const syncErrors = syncLogs.length;
  const googleConnected = await isGoogleOAuthConnected();
  const scopeStatus = await getGoogleOAuthScopeStatus();

  // Determine OAuth status from active (non-revoked) accounts only
  const activeAccounts = accounts.filter((a) => a.status === "active");
  let oauthStatus = "disconnected";
  if (!googleServiceStatus.isConfigured) {
    oauthStatus = "not_configured";
  } else if (activeAccounts.length > 0) {
    const account = activeAccounts[0];
    const accountScopes = parseAccountScopes(account.scopesJson);
    if (!scopesIncludeBusinessManage(accountScopes)) {
      oauthStatus = "disconnected";
    } else if (!account.tokenExpiry || new Date(account.tokenExpiry) > new Date()) {
      oauthStatus = "connected";
    } else {
      const refreshed = await getValidAccessToken();
      oauthStatus = refreshed ? "connected" : "token_expired";
    }
  }

  const visibleProfiles = googleConnected ? profiles : [];
  const visibleSummary = googleConnected
    ? {
        connectedProfiles,
        verifiedProfiles,
        activeProfiles,
        syncErrors,
        apiHealth: syncErrors > 3 ? ("degraded" as const) : ("healthy" as const),
      }
    : {
        connectedProfiles: 0,
        verifiedProfiles: 0,
        activeProfiles: 0,
        syncErrors: 0,
        apiHealth: "disconnected" as const,
      };

  return ok({
    googleConnected,
    scopeStatus,
    oauth: {
      status: oauthStatus,
      configured: googleServiceStatus.isConfigured,
      mode: googleServiceStatus.mode,
      redirectUri: googleServiceStatus.redirectUri,
      connectedEmail: activeAccounts[0]?.email ?? null,
      tokenExpiry: activeAccounts[0]?.tokenExpiry?.toISOString() ?? null,
      scopes: activeAccounts[0]?.scopesJson ? JSON.parse(activeAccounts[0].scopesJson) : [],
      lastConnectedAt: activeAccounts[0]?.createdAt?.toISOString() ?? null,
    },
    accounts: activeAccounts.map(a => ({
      id: a.id,
      email: a.email,
      googleUserId: a.googleUserId,
      status: a.status,
      tokenExpiry: a.tokenExpiry?.toISOString() ?? null,
      scopes: a.scopesJson ? JSON.parse(a.scopesJson) : [],
      profileCount: a.profiles.length,
      createdAt: a.createdAt.toISOString(),
    })),
    profiles: visibleProfiles.map(p => ({
      id: p.id,
      locationId: p.locationId,
      googleLocationId: p.googleLocationId,
      profileName: p.profileName,
      primaryCategory: p.primaryCategory,
      averageRating: p.averageRating,
      totalReviews: p.totalReviews,
      verificationState: p.verificationState,
      profileStatus: p.profileStatus,
      mapUrl: p.mapUrl,
      locationName: p.location?.name ?? "",
      locationCity: p.location?.city ?? "",
      syncStatus: p.location?.syncStatus ?? "pending",
      lastSyncedAt: p.location?.lastSyncedAt?.toISOString() ?? null,
    })),
    summary: visibleSummary,
    cachedProfiles: googleConnected ? 0 : connectedProfiles,
    recentSyncErrors: syncLogs.map(s => ({
      id: s.id,
      module: s.module,
      locationName: s.location?.name ?? "—",
      status: s.status,
      errorMessage: s.errorMessage,
      startedAt: s.startedAt.toISOString(),
    })),
    apiErrors: errorLogs.map(e => ({
      id: e.id,
      errorCode: e.errorCode,
      errorMessage: e.errorMessage,
      createdAt: e.createdAt.toISOString(),
    })),
  });
}

// POST /api/google-integration — connect (real OAuth), disconnect, sync
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "system.sync") && !can(user.role, "locations.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const action = body.action;

  // ─── Connect: redirect to real Google OAuth ────────────────────────────
  if (action === "connect") {
    if (!googleServiceStatus.isConfigured) {
      return fail("Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file first.", 400);
    }
    // Generate the real Google OAuth URL with a CSRF state nonce.
    // The state is stored in an HttpOnly cookie (1h, SameSite=Lax) so the OAuth
    // callback can validate it before accepting the authorization code.
    const redirectUri = resolveGoogleRedirectUri({
      origin: req.headers.get("origin"),
      referer: req.headers.get("referer"),
      host: req.headers.get("host"),
      forwardedProto: req.headers.get("x-forwarded-proto"),
    });
    const { url: authUrl, state } = getGoogleAuthUrl(body.state || undefined, redirectUri);
    // Server-side state backup: cookies can be lost when opening via 0.0.0.0 then
    // returning on localhost (different browser host).
    rememberOAuthState(state, redirectUri);
    const res = ok(
      { authUrl, state, redirectUri, redirect: true },
      "Redirecting to Google for authentication…",
    );
    res.cookies.set("gmb_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60, // 1 hour
      path: "/",
    });
    res.cookies.set("gmb_oauth_redirect", redirectUri, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60,
      path: "/",
    });
    return res;
  }

  // ─── Disconnect: revoke tokens ─────────────────────────────────────────
  if (action === "disconnect") {
    // Revoke tokens with Google before clearing locally — best-effort: if Google
    // revoke fails (network, token already invalid), still clear local state.
    const account = await db.googleAccount.findFirst();
    if (account) {
      const accessToken = decryptToken(account.accessToken);
      const refreshToken = decryptToken(account.refreshToken);
      if (accessToken) await revokeGoogleToken(accessToken);
      if (refreshToken) await revokeGoogleToken(refreshToken);
    }
    await db.googleAccount.updateMany({ data: { status: "revoked", accessToken: null, refreshToken: null } });
    await db.location.updateMany({ data: { syncStatus: "pending", lastSyncedAt: null } });
    await logAudit({ userId: user.id, userName: user.name, action: "google.disconnect", entity: "google_account", ip: req.headers.get("x-forwarded-for") ?? undefined });
    return ok({ disconnected: true }, "Google account disconnected. Reconnect to sync live data again.");
  }

  // ─── Sync: fetch real data from Google ─────────────────────────────────
  if (action === "sync") {
    if (!googleServiceStatus.isConfigured) {
      return fail("Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.", 400);
    }

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return fail("Google account not connected. Click 'Connect Google' to authenticate first.", 401);
    }

    // Real sync — fetch actual profiles from Google
    const locationId = body.locationId;
    if (locationId) {
      const loc = await db.location.findUnique({ where: { id: locationId }, include: { googleProfiles: true } });
      if (!loc) return fail("Location not found", 404);
      if (!loc.googleProfiles[0]) return fail("No Google Business Profile linked to this location", 404);

      const result = await syncLocationFull(loc.id);
      await logAudit({ userId: user.id, userName: user.name, action: "google.sync", entity: "location", entityId: loc.id, ip: req.headers.get("x-forwarded-for") ?? undefined });

      if (result.errors.length > 0 && !result.success) {
        return fail(result.errors[0] || "Sync failed", 400);
      }
      return ok({ synced: 1, errors: result.errors }, `Synced "${loc.name}" from Google`);
    }

    // Full sync — all linked locations (reviews, posts, profile data)
    const locations = await db.location.findMany({
      where: { googleProfiles: { some: {} } },
      select: { id: true, name: true },
    });

    let synced = 0;
    const errors: string[] = [];
    for (const loc of locations) {
      const result = await syncLocationFull(loc.id);
      if (result.success || Object.values(result.synced).some((n) => n > 0)) synced++;
      for (const err of result.errors) errors.push(`${loc.name}: ${err}`);
    }

    await logAudit({ userId: user.id, userName: user.name, action: "google.sync", entity: "location", newValue: { synced, errors: errors.length }, ip: req.headers.get("x-forwarded-for") ?? undefined });

    if (synced > 0) {
      return ok({ synced, errors }, `Synced ${synced} location(s) from Google Business Profile`);
    }
    return fail(errors[0] || "No locations synced. Reconnect Google from More → Google.", 400);
  }

  return fail("Unknown action. Use: connect, disconnect, or sync");
}
