import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { requireClientAuth } from "@/lib/client-auth";
import {
  getValidAccessToken,
  googleServiceStatus,
  initiateVerification,
  listVerifications,
  completeVerification,
} from "@/lib/google-service";

export const dynamic = "force-dynamic";

const ALLOWED_METHODS = new Set(["ADDRESS", "PHONE_CALL", "SMS", "EMAIL"]);
const GOOGLE_API_PACE_MS = 200; // small delay between Google calls to stay under 10 QPS

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// GET /api/locations/bulk-verify?locationIds=loc1,loc2,loc3
// Returns the verification status (verified / unverified + pending verifications)
// for every requested location in one round-trip. Used by the BulkVerifyDialog
// to render a table before any action is taken.
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.view")) return forbidden();

  const url = new URL(req.url);
  const idsRaw = url.searchParams.get("locationIds") || "";
  const locationIds = idsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (locationIds.length === 0) {
    return fail("locationIds query parameter is required (comma-separated).", 400);
  }

  // Honor branch-manager scope: filter out any IDs the user isn't allowed to
  // see. We don't 403 the whole request — the bulk UI passes every visible
  // location ID and we just return the ones in scope.
  const scope = scopeLocationIds(user);
  const visibleIds = scope ? locationIds.filter((id) => scope.includes(id)) : locationIds;
  if (visibleIds.length === 0) {
    return ok({ locations: [] }, "No in-scope locations requested.");
  }

  // Pre-fetch all linked GoogleBusinessProfiles + Location rows for the
  // requested IDs in a single DB round-trip.
  const rows = await db.location.findMany({
    where: { id: { in: visibleIds } },
    include: { googleProfiles: { take: 1 } },
  });

  // No-Google states cascade identically to the single-location verify route:
  //   - no GBP linked      → verificationState from local DB, pendingVerifications: []
  //   - OAuth not configured → same
  //   - account disconnected → same
  // Only when all 3 preconditions pass do we hit Google's listVerifications.
  const googleConfigured = googleServiceStatus.isConfigured;
  const accessToken = googleConfigured ? await getValidAccessToken() : null;

  const locations: any[] = [];

  for (const loc of rows) {
    const gbp = loc.googleProfiles[0];
    const base: any = {
      locationId: loc.id,
      name: loc.name,
      city: loc.city,
      verificationState: gbp?.verificationState || "unverified",
      pendingVerifications: [],
      canInitiate: !gbp ? false : gbp.verificationState !== "verified",
      canComplete: false,
      linked: !!gbp,
      configured: googleConfigured,
      connected: !!accessToken,
    };

    // If there's no GBP linked, no OAuth config, or no access token, just
    // return the local fallback — we can't query Google's verification
    // history in any of those cases.
    if (!gbp || !googleConfigured || !accessToken) {
      locations.push(base);
      continue;
    }

    try {
      const verifications = await listVerifications(accessToken, gbp.googleLocationId);
      const pending = verifications.filter((v: any) => v.state === "PENDING");
      base.pendingVerifications = pending;
      // A location can be initiated only if it's not verified AND has no
      // outstanding PENDING verification. Google will reject a second
      // initiate on top of a pending one.
      base.canInitiate = gbp.verificationState !== "verified" && pending.length === 0;
      base.canComplete = pending.length > 0;
      // Reconcile the local verificationState — if Google reports a
      // COMPLETED verification we treat the location as verified even if our
      // cached state hasn't caught up yet.
      if (gbp.verificationState !== "verified" && verifications.some((v: any) => v.state === "COMPLETED")) {
        base.verificationState = "verified";
        base.canInitiate = false;
        base.canComplete = false;
      }
    } catch (e: any) {
      base.error = e.message || "Failed to load verification history";
    }

    // Pace Google calls — listVerifications is one HTTP request per location,
    // and bulk-verify dialogs typically pass every location in the agency.
    await sleep(GOOGLE_API_PACE_MS);

    locations.push(base);
  }

  return ok(
    { locations },
    `Loaded verification status for ${locations.length} location(s).`,
  );
}

// POST /api/locations/bulk-verify — bulk initiate verification for multiple
// unverified locations. Skips locations that are already verified or already
// have a PENDING verification. Returns per-location initiated/failed/skipped.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { action, locationIds, method, input } = body as {
    action?: string;
    locationIds?: string[];
    method?: string;
    input?: any;
  };

  if (action !== "initiate") {
    return fail("action must be 'initiate' for POST.", 400);
  }
  if (!Array.isArray(locationIds) || locationIds.length === 0) {
    return fail("locationIds[] is required.", 400);
  }

  const methodUpper = String(method ?? "").toUpperCase();
  if (!ALLOWED_METHODS.has(methodUpper)) {
    return fail(`method must be one of: ${Array.from(ALLOWED_METHODS).join(", ")}.`, 400);
  }

  // Validate the per-method input shape before doing any work.
  const inputObj = input ?? {};
  if (methodUpper === "ADDRESS") {
    if (!inputObj.mailerContactName || typeof inputObj.mailerContactName !== "string") {
      return fail("ADDRESS verification requires input.mailerContactName.", 400);
    }
  } else if (methodUpper === "PHONE_CALL" || methodUpper === "SMS") {
    if (!inputObj.phoneNumber || typeof inputObj.phoneNumber !== "string") {
      return fail(`${methodUpper} verification requires input.phoneNumber.`, 400);
    }
  } else if (methodUpper === "EMAIL") {
    if (!inputObj.emailAddress || typeof inputObj.emailAddress !== "string") {
      return fail("EMAIL verification requires input.emailAddress.", 400);
    }
  }

  if (!googleServiceStatus.isConfigured) {
    return fail(
      "Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.",
      400,
    );
  }
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return fail("Google account not connected. Please reconnect Google OAuth.", 401);
  }

  // Branch-manager scope filter — silently drop out-of-scope IDs (matches
  // the bulk sync/archive/activate route's behaviour).
  const scope = scopeLocationIds(user);
  const ids = scope ? locationIds.filter((id) => scope.includes(id)) : locationIds;

  const rows = await db.location.findMany({
    where: { id: { in: ids } },
    include: { googleProfiles: { take: 1 } },
  });

  const initiated: { locationId: string; name: string; verificationName: string }[] = [];
  const failed: { locationId: string; name: string; error: string }[] = [];
  const skipped: { locationId: string; name: string; reason: string }[] = [];

  for (const loc of rows) {
    const gbp = loc.googleProfiles[0];
    if (!gbp) {
      skipped.push({ locationId: loc.id, name: loc.name, reason: "No Google Business Profile linked" });
      continue;
    }
    if (gbp.verificationState === "verified") {
      skipped.push({ locationId: loc.id, name: loc.name, reason: "Already verified" });
      continue;
    }

    // End-client authorization gate (same scope as the single-location
    // verify POST). Failing the gate skips this location and surfaces a
    // clear reason in the failed[] bucket — we don't abort the entire bulk
    // job, because the agency may manage a mix of self-managed and
    // client-managed locations.
    const authCheck = await requireClientAuth(loc.id, "profile.update");
    if (!authCheck.ok) {
      failed.push({
        locationId: loc.id,
        name: loc.name,
        error: "Client authorization required: profile.update scope not granted",
      });
      continue;
    }

    // Check Google's verification state — there may be a PENDING
    // verification we don't yet know about locally. If so, skip initiating a
    // duplicate one.
    try {
      const existing = await listVerifications(accessToken, gbp.googleLocationId);
      const hasPending = existing.some((v: any) => v.state === "PENDING");
      if (hasPending) {
        skipped.push({
          locationId: loc.id,
          name: loc.name,
          reason: "A verification is already pending — complete it with the PIN instead",
        });
        await sleep(GOOGLE_API_PACE_MS);
        continue;
      }
    } catch (e: any) {
      // If we can't even list verifications we probably can't initiate one
      // either — surface the error and move on.
      failed.push({ locationId: loc.id, name: loc.name, error: `Pre-check failed: ${e.message}` });
      await sleep(GOOGLE_API_PACE_MS);
      continue;
    }

    try {
      const verification = await initiateVerification(accessToken, gbp.googleLocationId, methodUpper, inputObj);
      const verificationName = verification?.name ?? "";
      initiated.push({ locationId: loc.id, name: loc.name, verificationName });

      await logAudit({
        userId: user.id,
        userName: user.name,
        action: "location.verify_initiated",
        entity: "location",
        entityId: loc.id,
        newValue: { method: methodUpper, input: inputObj, verificationName, bulk: true },
        ip: req.headers.get("x-forwarded-for") ?? undefined,
      });
    } catch (e: any) {
      failed.push({ locationId: loc.id, name: loc.name, error: e.message || "Initiate failed" });
    }

    await sleep(GOOGLE_API_PACE_MS);
  }

  // Any IDs that weren't found in the DB at all go to failed[].
  const foundIds = new Set(rows.map((r) => r.id));
  for (const id of ids) {
    if (!foundIds.has(id)) {
      failed.push({ locationId: id, name: id, error: "Location not found" });
    }
  }

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "bulk.verify_initiated",
    entity: "location",
    newValue: {
      method: methodUpper,
      input: inputObj,
      initiated: initiated.length,
      failed: failed.length,
      skipped: skipped.length,
      locationIds: ids,
    },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  const message =
    `${initiated.length} initiated` +
    (failed.length > 0 ? `, ${failed.length} failed` : "") +
    (skipped.length > 0 ? `, ${skipped.length} skipped` : "");

  return ok({ initiated, failed, skipped }, message);
}

// PATCH /api/locations/bulk-verify — bulk complete verification with PINs.
// Body: { pins: [{ locationId, pin }, ...] }
// For each location, finds the most recent PENDING verification record via
// listVerifications and submits the PIN via completeVerification.
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { pins } = body as { pins?: { locationId: string; pin: string }[] };

  if (!Array.isArray(pins) || pins.length === 0) {
    return fail("pins[] is required (each item: { locationId, pin }).", 400);
  }

  // Basic input validation up front so we don't burn Google quota on bad input.
  for (const p of pins) {
    if (!p.locationId || typeof p.locationId !== "string") {
      return fail("Each pin entry requires a locationId string.", 400);
    }
    if (!p.pin || typeof p.pin !== "string") {
      return fail(`Missing PIN for location ${p.locationId}.`, 400);
    }
  }

  if (!googleServiceStatus.isConfigured) {
    return fail(
      "Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.",
      400,
    );
  }
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return fail("Google account not connected. Please reconnect Google OAuth.", 401);
  }

  const scope = scopeLocationIds(user);
  const requestedIds = pins.map((p) => p.locationId);
  const ids = scope ? requestedIds.filter((id) => scope.includes(id)) : requestedIds;
  const rows = await db.location.findMany({
    where: { id: { in: ids } },
    include: { googleProfiles: { take: 1 } },
  });
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const completed: { locationId: string; name: string }[] = [];
  const failed: { locationId: string; name: string; error: string }[] = [];

  for (const entry of pins) {
    const loc = rowById.get(entry.locationId);
    if (!loc) {
      failed.push({ locationId: entry.locationId, name: entry.locationId, error: "Location not found" });
      continue;
    }
    const gbp = loc.googleProfiles[0];
    if (!gbp) {
      failed.push({ locationId: loc.id, name: loc.name, error: "No Google Business Profile linked" });
      continue;
    }

    // Same client-auth gate as the single-location PATCH.
    const authCheck = await requireClientAuth(loc.id, "profile.update");
    if (!authCheck.ok) {
      failed.push({
        locationId: loc.id,
        name: loc.name,
        error: "Client authorization required: profile.update scope not granted",
      });
      continue;
    }

    try {
      const verifications = await listVerifications(accessToken, gbp.googleLocationId);
      const pending = (verifications as any[]).filter((v) => v.state === "PENDING");
      if (pending.length === 0) {
        failed.push({
          locationId: loc.id,
          name: loc.name,
          error: "No pending verification to complete",
        });
        await sleep(GOOGLE_API_PACE_MS);
        continue;
      }
      // Most-recent first — Google returns newest verifications first, but
      // be defensive and pick the highest-priority pending one.
      const target = pending[0];
      await completeVerification(accessToken, target.name, entry.pin);

      completed.push({ locationId: loc.id, name: loc.name });

      await logAudit({
        userId: user.id,
        userName: user.name,
        action: "location.verify_completed",
        entity: "location",
        entityId: loc.id,
        newValue: { verificationName: target.name, bulk: true },
        ip: req.headers.get("x-forwarded-for") ?? undefined,
      });
    } catch (e: any) {
      failed.push({ locationId: loc.id, name: loc.name, error: e.message || "Complete failed" });
    }

    await sleep(GOOGLE_API_PACE_MS);
  }

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "bulk.verify_completed",
    entity: "location",
    newValue: {
      completed: completed.length,
      failed: failed.length,
      locationIds: ids,
    },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  const message =
    `${completed.length} completed` + (failed.length > 0 ? `, ${failed.length} failed` : "");

  return ok({ completed, failed }, message);
}
