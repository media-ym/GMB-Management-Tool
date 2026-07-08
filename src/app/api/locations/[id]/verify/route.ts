import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, notFound, fail } from "@/lib/api-response";
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

// GET /api/locations/[id]/verify — list verification history for a location
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.view")) return forbidden();

  const { id } = await params;
  const scoped = scopeLocationIds(user, id);
  if (scoped && !scoped.includes(id)) return forbidden("Location out of scope");

  const location = await db.location.findUnique({ where: { id }, include: { googleProfiles: true } });
  if (!location) return notFound("Location not found");

  const gbp = location.googleProfiles[0];
  if (!gbp) {
    return ok({ verifications: [], linked: false }, "No Google Business Profile linked to this location.");
  }

  if (!googleServiceStatus.isConfigured) {
    return ok(
      { verifications: [], linked: true, configured: false },
      "Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.",
    );
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return ok(
      { verifications: [], linked: true, configured: true, connected: false },
      "Google account not connected. Please reconnect Google OAuth.",
    );
  }

  try {
    const verifications = await listVerifications(accessToken, gbp.googleLocationId);
    return ok(
      { verifications, linked: true, configured: true, connected: true },
      `Loaded ${verifications.length} verification record(s) for "${location.name}".`,
    );
  } catch (e: any) {
    return fail(`Failed to load verifications: ${e.message}`, 502);
  }
}

// POST /api/locations/[id]/verify — initiate a new verification flow
// Body: { method: "ADDRESS"|"PHONE_CALL"|"SMS"|"EMAIL", input?: { mailerContactName?, phoneNumber?, emailAddress? } }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.manage")) return forbidden();

  const { id } = await params;
  const scoped = scopeLocationIds(user, id);
  if (scoped && !scoped.includes(id)) return forbidden("Location out of scope");

  const body = await req.json().catch(() => ({}));
  const method = String(body.method ?? "").toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return fail(`Invalid verification method. Must be one of: ${Array.from(ALLOWED_METHODS).join(", ")}.`, 400);
  }

  // Validate the per-method input shape before hitting Google.
  const input = body.input ?? {};
  if (method === "ADDRESS") {
    if (!input.mailerContactName || typeof input.mailerContactName !== "string") {
      return fail("Address verification requires input.mailerContactName.", 400);
    }
  } else if (method === "PHONE_CALL" || method === "SMS") {
    if (!input.phoneNumber || typeof input.phoneNumber !== "string") {
      return fail(`${method} verification requires input.phoneNumber.`, 400);
    }
  } else if (method === "EMAIL") {
    if (!input.emailAddress || typeof input.emailAddress !== "string") {
      return fail("Email verification requires input.emailAddress.", 400);
    }
  }

  const location = await db.location.findUnique({ where: { id }, include: { googleProfiles: true } });
  if (!location) return notFound("Location not found");

  const gbp = location.googleProfiles[0];
  if (!gbp) {
    return fail("No Google Business Profile linked to this location. Import this location from Google first.", 400);
  }

  if (!googleServiceStatus.isConfigured) {
    return fail(
      "Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.",
      400,
    );
  }

  // End-client authorization gate (Google Third-Party Policy) — initiating a
  // verification that causes Google to dispatch a postcard / SMS / call to the
  // business is a profile-modifying action, so we require profile.update.
  const authCheck = await requireClientAuth(id, "profile.update");
  if (!authCheck.ok) return authCheck.response;

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return fail("Google account not connected. Please reconnect Google OAuth.", 401);
  }

  try {
    const verification = await initiateVerification(accessToken, gbp.googleLocationId, method, input);

    await logAudit({
      userId: user.id,
      userName: user.name,
      action: "location.verify_initiated",
      entity: "location",
      entityId: id,
      newValue: { method, input, verificationName: verification?.name ?? null },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return ok(
      { verification, method, linked: true, configured: true, connected: true },
      `Verification via ${method} initiated for "${location.name}". Follow Google's instructions to complete it.`,
    );
  } catch (e: any) {
    return fail(`Failed to initiate verification: ${e.message}`, 502);
  }
}

// PATCH /api/locations/[id]/verify — complete a PIN-based verification
// Body: { verificationName: string, pin: string }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.manage")) return forbidden();

  const { id } = await params;
  const scoped = scopeLocationIds(user, id);
  if (scoped && !scoped.includes(id)) return forbidden("Location out of scope");

  const body = await req.json().catch(() => ({}));
  const verificationName = String(body.verificationName ?? "").trim();
  const pin = String(body.pin ?? "").trim();

  if (!verificationName) {
    return fail("verificationName is required (e.g. accounts/{aid}/locations/{lid}/verifications/{vid}).", 400);
  }
  if (!pin) {
    return fail("pin is required.", 400);
  }

  // The verificationName must belong to THIS location — strip the trailing
  // `/verifications/{vid}` segment to recover the parent location name and
  // cross-check it against the GBP linked to this route's location id.
  // Expected format: accounts/{aid}/locations/{lid}/verifications/{vid}
  const parent = verificationName.split("/verifications/")[0];
  const m = parent.match(/^accounts\/[^/]+\/locations\/[^/]+$/);
  if (!m) {
    return fail("Invalid verificationName format.", 400);
  }
  const location = await db.location.findUnique({ where: { id }, include: { googleProfiles: true } });
  if (!location) return notFound("Location not found");
  const gbp = location.googleProfiles[0];
  if (!gbp) {
    return fail("No Google Business Profile linked to this location.", 400);
  }
  if (gbp.googleLocationId !== parent) {
    return fail("The verification record does not belong to this location.", 400);
  }

  if (!googleServiceStatus.isConfigured) {
    return fail(
      "Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.",
      400,
    );
  }

  // Same authorization gate as POST — completing a verification mutates the
  // location's verification state on Google.
  const authCheck = await requireClientAuth(id, "profile.update");
  if (!authCheck.ok) return authCheck.response;

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return fail("Google account not connected. Please reconnect Google OAuth.", 401);
  }

  try {
    await completeVerification(accessToken, verificationName, pin);

    await logAudit({
      userId: user.id,
      userName: user.name,
      action: "location.verify_completed",
      entity: "location",
      entityId: id,
      newValue: { verificationName },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return ok(
      { completed: true, verificationName },
      "PIN submitted to Google. If the PIN was correct, the location is now verified.",
    );
  } catch (e: any) {
    return fail(`Failed to complete verification: ${e.message}`, 502);
  }
}
