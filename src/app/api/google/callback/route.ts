import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  exchangeCodeForTokens,
  googleServiceStatus,
  resolveGoogleRedirectUri,
  rememberOAuthState,
  consumeOAuthState,
  scopesIncludeBusinessManage,
  getGoogleAuthUrl,
} from "@/lib/google-service";
import { encryptToken } from "@/lib/token-crypto";
import { getSessionUser, logAudit } from "@/lib/session";
import { DEFAULT_SCOPES } from "@/lib/client-auth";

export const dynamic = "force-dynamic";

function clearOAuthFlowCookies(res: NextResponse): void {
  res.cookies.set("gmb_oauth_state", "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
  res.cookies.set("gmb_oauth_redirect", "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
  res.cookies.set("gmb_oauth_portal_client", "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
  res.cookies.set("gmb_oauth_return", "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
}

// GET /api/google/callback — Google OAuth callback (real token exchange)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");

  const cookieState = req.cookies.get("gmb_oauth_state")?.value;
  const cookieRedirect = req.cookies.get("gmb_oauth_redirect")?.value;
  const cookiePortalClient = req.cookies.get("gmb_oauth_portal_client")?.value;
  const cookieReturn = req.cookies.get("gmb_oauth_return")?.value;
  const memorized = state ? consumeOAuthState(state) : null;
  const stateOk = Boolean(state && ((cookieState && state === cookieState) || memorized));
  const resolvedRedirect = cookieRedirect || memorized?.redirectUri || undefined;
  const portalClientId =
    cookiePortalClient || memorized?.portalClientId || null;
  const returnPath =
    cookieReturn || memorized?.returnPath || "/google?google_connected=true";

  const failRedirect = (q: string) => {
    const redirect = NextResponse.redirect(new URL(`/google?google_error=${encodeURIComponent(q)}`, url.origin));
    clearOAuthFlowCookies(redirect);
    return redirect;
  };

  if (error) return failRedirect(error);

  if (!state || !stateOk) return failRedirect("state_mismatch");
  if (!code) return failRedirect("no_code");

  const user = await getSessionUser();

  // Portal connect must be done by the matching portal user
  if (portalClientId) {
    if (!user?.clientId || user.clientId !== portalClientId) {
      return failRedirect("portal_session_mismatch");
    }
  }

  try {
    const tokens = await exchangeCodeForTokens(code, resolvedRedirect);

    let email = "gmb@myfng.in";
    let googleUserId = "unknown";
    try {
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      if (userInfoRes.ok) {
        const userInfo = await userInfoRes.json();
        email = userInfo.email || email;
        googleUserId = userInfo.id || googleUserId;
      }
    } catch { /* ignore */ }

    const grantedScopes = tokens.scope
      ? tokens.scope.split(" ").filter(Boolean)
      : [];

    if (!scopesIncludeBusinessManage(grantedScopes)) {
      return failRedirect("missing_business_scope");
    }

    // Upsert GoogleAccount scoped to end-client OR platform (clientId null)
    const existing = portalClientId
      ? await db.googleAccount.findFirst({
          where: { clientId: portalClientId },
          orderBy: { updatedAt: "desc" },
        })
      : await db.googleAccount.findFirst({
          where: { clientId: null },
          orderBy: { updatedAt: "desc" },
        }) || await db.googleAccount.findFirst({ orderBy: { updatedAt: "desc" } });

    const newRefresh = tokens.refreshToken || existing?.refreshToken || null;
    const accountData = {
      email,
      googleUserId,
      status: "active" as const,
      accessToken: encryptToken(tokens.accessToken),
      refreshToken: encryptToken(newRefresh),
      tokenExpiry: new Date(tokens.expiryDate),
      scopesJson: JSON.stringify(grantedScopes),
      clientId: portalClientId,
    };

    if (existing) {
      await db.googleAccount.update({
        where: { id: existing.id },
        data: accountData,
      });
    } else {
      await db.googleAccount.create({ data: accountData });
    }

    // Auto-grant ClientAuthorization when portal client connects Google
    if (portalClientId) {
      const activeAuth = await db.clientAuthorization.findFirst({
        where: {
          clientId: portalClientId,
          status: "active",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (!activeAuth) {
        await db.clientAuthorization.create({
          data: {
            clientId: portalClientId,
            status: "active",
            authorizedScopes: JSON.stringify(DEFAULT_SCOPES),
            grantedByUserId: user?.id ?? null,
            notes: "Auto-granted when client connected Google Business Profile via portal",
          },
        });
      }
    }

    if (user) {
      await logAudit({
        userId: user.id,
        userName: user.name,
        action: portalClientId ? "portal.google.connect" : "google.connect",
        entity: "google_account",
        newValue: { email, mode: "production", clientId: portalClientId },
        ip: req.headers.get("x-forwarded-for") ?? undefined,
      });
    }

    const redirect = NextResponse.redirect(new URL(returnPath, url.origin));
    clearOAuthFlowCookies(redirect);
    return redirect;
  } catch (e: any) {
    console.error("Google OAuth callback error:", e);
    return failRedirect(e.message || "oauth_failed");
  }
}

// POST /api/google/callback — initiate OAuth (legacy; prefer /api/google-integration or /api/portal/connect)
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const redirectUri = resolveGoogleRedirectUri({
    origin: req.headers.get("origin"),
    referer: req.headers.get("referer"),
    host: req.headers.get("host"),
    forwardedProto: req.headers.get("x-forwarded-proto"),
  });
  const portalClientId =
    body.portalClientId ||
    (user.role === "client_portal" ? user.clientId : null) ||
    null;
  const returnPath = body.returnPath || "/google?google_connected=true";

  const { url: authUrl, state } = getGoogleAuthUrl(body.state, redirectUri);
  rememberOAuthState(state, redirectUri, 60 * 60 * 1000, { portalClientId, returnPath });
  const res = NextResponse.json({ success: true, authUrl, state, redirectUri, mode: googleServiceStatus.mode });
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
  if (portalClientId) {
    res.cookies.set("gmb_oauth_portal_client", portalClientId, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60,
      path: "/",
    });
  }
  res.cookies.set("gmb_oauth_return", returnPath, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60,
    path: "/",
  });
  return res;
}
