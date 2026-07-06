import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { googleServiceStatus } from "@/lib/google-service";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/google/status — check if Google OAuth is configured for production
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.view")) return forbidden();

  return ok({
    configured: googleServiceStatus.isConfigured,
    mode: googleServiceStatus.mode,
    hasClientSecret: googleServiceStatus.hasClientSecret,
    redirectUri: googleServiceStatus.redirectUri,
    message: googleServiceStatus.isConfigured
      ? "Google OAuth is configured for production. Click Connect to authorize."
      : "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env to enable real GMB connection.",
  });
}
