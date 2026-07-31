import { NextRequest } from "next/server";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import {
  getGoogleAuthUrl,
  googleServiceStatus,
  rememberOAuthState,
  resolveGoogleRedirectUri,
} from "@/lib/google-service";

export const dynamic = "force-dynamic";

/** POST /api/portal/connect — start Google OAuth for this end-client */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== "client_portal" || !user.clientId) {
    return forbidden("Client portal access only");
  }

  if (!googleServiceStatus.isConfigured) {
    return fail(
      "Google OAuth is not configured on the server. Contact MyFNG support.",
      400,
    );
  }

  const redirectUri = resolveGoogleRedirectUri({
    origin: req.headers.get("origin"),
    referer: req.headers.get("referer"),
    host: req.headers.get("host"),
    forwardedProto: req.headers.get("x-forwarded-proto"),
  });
  const returnPath = "/google?google_connected=true";
  const { url: authUrl, state } = getGoogleAuthUrl(undefined, redirectUri);
  rememberOAuthState(state, redirectUri, 60 * 60 * 1000, {
    portalClientId: user.clientId,
    returnPath,
  });

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "portal.google.connect_start",
    entity: "client",
    entityId: user.clientId,
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  const res = ok({ authUrl, state, redirectUri, redirect: true }, "Redirecting to Google…");
  res.cookies.set("gmb_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60,
    path: "/",
  });
  res.cookies.set("gmb_oauth_redirect", redirectUri, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60,
    path: "/",
  });
  res.cookies.set("gmb_oauth_portal_client", user.clientId, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60,
    path: "/",
  });
  res.cookies.set("gmb_oauth_return", returnPath, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60,
    path: "/",
  });
  return res;
}
