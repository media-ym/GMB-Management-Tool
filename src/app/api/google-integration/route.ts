import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";

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

  // OAuth status
  const oauthStatus = accounts.length > 0
    ? (accounts[0].status === "active" && (!accounts[0].tokenExpiry || new Date(accounts[0].tokenExpiry) > new Date()) ? "connected" : "token_expired")
    : "disconnected";

  return ok({
    oauth: {
      status: oauthStatus,
      connectedEmail: accounts[0]?.email ?? null,
      tokenExpiry: accounts[0]?.tokenExpiry?.toISOString() ?? null,
      scopes: accounts[0]?.scopesJson ? JSON.parse(accounts[0].scopesJson) : [],
      lastConnectedAt: accounts[0]?.createdAt?.toISOString() ?? null,
    },
    accounts: accounts.map(a => ({
      id: a.id,
      email: a.email,
      googleUserId: a.googleUserId,
      status: a.status,
      tokenExpiry: a.tokenExpiry?.toISOString() ?? null,
      scopes: a.scopesJson ? JSON.parse(a.scopesJson) : [],
      profileCount: a.profiles.length,
      createdAt: a.createdAt.toISOString(),
    })),
    profiles: profiles.map(p => ({
      id: p.id,
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
    summary: {
      connectedProfiles,
      verifiedProfiles,
      activeProfiles,
      syncErrors,
      apiHealth: syncErrors > 3 ? "degraded" : "healthy",
    },
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

// POST /api/google-integration — connect (mock OAuth), disconnect, sync
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "system.sync")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const action = body.action;

  if (action === "connect") {
    // Mock OAuth connect — in production this redirects to Google consent screen
    // Here we just create/update the google account record
    const existing = await db.googleAccount.findFirst();
    if (existing) {
      await db.googleAccount.update({
        where: { id: existing.id },
        data: {
          email: body.email || "gmb@myfng.in",
          status: "active",
          accessToken: "mock_access_token_" + Date.now(),
          refreshToken: "mock_refresh_token_" + Date.now(),
          tokenExpiry: new Date(Date.now() + 3600 * 1000),
          scopesJson: JSON.stringify(["https://www.googleapis.com/auth/business.manage"]),
        },
      });
    } else {
      await db.googleAccount.create({
        data: {
          email: body.email || "gmb@myfng.in",
          googleUserId: "gmb_myfng_" + Date.now(),
          status: "active",
          accessToken: "mock_access_token_" + Date.now(),
          refreshToken: "mock_refresh_token_" + Date.now(),
          tokenExpiry: new Date(Date.now() + 3600 * 1000),
          scopesJson: JSON.stringify(["https://www.googleapis.com/auth/business.manage"]),
        },
      });
    }
    await logAudit({ userId: user.id, userName: user.name, action: "google.connect", entity: "google_account", newValue: { email: body.email || "gmb@myfng.in" }, ip: req.headers.get("x-forwarded-for") ?? undefined });
    return ok({ connected: true }, "Google Business Profile connected successfully");
  }

  if (action === "disconnect") {
    await db.googleAccount.updateMany({ data: { status: "revoked" } });
    await logAudit({ userId: user.id, userName: user.name, action: "google.disconnect", entity: "google_account", ip: req.headers.get("x-forwarded-for") ?? undefined });
    return ok({ disconnected: true }, "Google Business Profile disconnected");
  }

  if (action === "sync") {
    // Trigger sync for all profiles (mock — just update sync status + create sync log)
    const locationId = body.locationId;
    const where = locationId ? { id: locationId } : {};
    const locations = await db.location.findMany({ where, select: { id: true, name: true } });
    const now = new Date();
    for (const loc of locations) {
      await db.location.update({ where: { id: loc.id }, data: { syncStatus: "synced", lastSyncedAt: now } });
      await db.syncLog.create({
        data: {
          module: "profile",
          locationId: loc.id,
          startedAt: now,
          completedAt: new Date(now.getTime() + 3000),
          status: "success",
          recordsProcessed: 15 + Math.floor(Math.random() * 50),
          recordsInserted: Math.floor(Math.random() * 5),
          recordsUpdated: 10 + Math.floor(Math.random() * 20),
          recordsFailed: 0,
        },
      });
    }
    await logAudit({ userId: user.id, userName: user.name, action: "google.sync", entity: "location", newValue: { count: locations.length }, ip: req.headers.get("x-forwarded-for") ?? undefined });
    return ok({ synced: locations.length }, `Synced ${locations.length} location(s) from Google`);
  }

  return fail("Unknown action. Use: connect, disconnect, or sync");
}
