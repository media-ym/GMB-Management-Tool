import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden, notFound, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import {
  getValidAccessToken,
  googleServiceStatus,
  fetchVerificationOptions,
} from "@/lib/google-service";

export const dynamic = "force-dynamic";

// GET /api/locations/[id]/verify/options — fetch available verification
// options for a location (ADDRESS / PHONE_CALL / SMS / EMAIL).
// Optional query: ?dispatchMethod=ADDRESS|EMAIL|PHONE_CALL|SMS
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
    return ok(
      { options: [], linked: false },
      "No Google Business Profile linked to this location.",
    );
  }

  if (!googleServiceStatus.isConfigured) {
    return ok(
      { options: [], linked: true, configured: false },
      "Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.",
    );
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return ok(
      { options: [], linked: true, configured: true, connected: false },
      "Google account not connected. Please reconnect Google OAuth.",
    );
  }

  // Optional dispatchMethod hint — Google uses it to return channel-specific
  // metadata (e.g. the masked phone number for SMS / phone call).
  const url = new URL(req.url);
  const dispatchMethod = url.searchParams.get("dispatchMethod") || undefined;
  if (
    dispatchMethod &&
    !["ADDRESS", "EMAIL", "PHONE_CALL", "SMS"].includes(dispatchMethod)
  ) {
    return fail("dispatchMethod must be one of: ADDRESS, EMAIL, PHONE_CALL, SMS.", 400);
  }

  try {
    const data = await fetchVerificationOptions(accessToken, gbp.googleLocationId, dispatchMethod);
    const options = Array.isArray(data.options) ? data.options : [];
    return ok(
      { options, linked: true, configured: true, connected: true },
      `Loaded ${options.length} verification option(s) for "${location.name}".`,
    );
  } catch (e: any) {
    return fail(`Failed to load verification options: ${e.message}`, 502);
  }
}
