import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import {
  hasGmbProfileData,
  isGmbProfileRunning,
  launchGmbLoginBrowser,
} from "@/lib/gbp-chrome-session";

export const dynamic = "force-dynamic";

/** GET /api/products/gmb-session — check if GMB Product Editor session is ready */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.manage")) return forbidden();

  return ok({
    connected: hasGmbProfileData(),
    loginWindowOpen: isGmbProfileRunning(),
  });
}

/** POST /api/products/gmb-session — open Chrome once for GMB login (then close it) */
export async function POST(_req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.manage")) return forbidden();

  const result = launchGmbLoginBrowser();
  if (!result.ok) {
    return ok(
      { connected: hasGmbProfileData(), loginWindowOpen: false, error: result.error },
      result.error || "Could not open Chrome",
    );
  }

  return ok(
    {
      connected: hasGmbProfileData(),
      loginWindowOpen: true,
    },
    "Chrome opened — sign in with your GMB Google account, then close Chrome. Sync runs in the background after that.",
  );
}
