import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getGoogleAuthUrl, exchangeCodeForTokens, googleServiceStatus, resolveGoogleRedirectUri, rememberOAuthState, consumeOAuthState, scopesIncludeBusinessManage } from "@/lib/google-service";
import { encryptToken } from "@/lib/token-crypto";
import { getSessionUser, logAudit } from "@/lib/session";

export const dynamic = "force-dynamic";

function clearOAuthFlowCookies(res: NextResponse): void {
  res.cookies.set("gmb_oauth_state", "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
  res.cookies.set("gmb_oauth_redirect", "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
}

// GET /api/google/callback — Google OAuth callback (real token exchange)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");

  // Handle OAuth error from Google
  if (error) {
    return NextResponse.redirect(new URL(`/google?google_error=${encodeURIComponent(error)}`, url.origin));
  }

  // ─── CSRF: validate OAuth state (cookie first, server memory fallback) ─
  // Cookie can be missing when the user starts on 0.0.0.0 and Google returns
  // to localhost — hosts differ so the cookie is not sent.
  const cookieState = req.cookies.get("gmb_oauth_state")?.value;
  const cookieRedirect = req.cookies.get("gmb_oauth_redirect")?.value;
  const memorized = state ? consumeOAuthState(state) : null;
  const stateOk = Boolean(state && ((cookieState && state === cookieState) || memorized));
  const resolvedRedirect = cookieRedirect || memorized?.redirectUri || undefined;

  if (!state || !stateOk) {
    const redirect = NextResponse.redirect(new URL("/google?google_error=state_mismatch", url.origin));
    clearOAuthFlowCookies(redirect);
    return redirect;
  }

  // ─── No code = OAuth flow did not complete ─────────────────────────────
  if (!code) {
    const redirect = NextResponse.redirect(new URL("/google?google_error=no_code", url.origin));
    clearOAuthFlowCookies(redirect);
    return redirect;
  }

  const user = await getSessionUser();

  // Real OAuth — exchange code for tokens
  try {
    const tokens = await exchangeCodeForTokens(code, resolvedRedirect);

    // Get user info from Google
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
    } catch { /* ignore userinfo error */ }

    const grantedScopes = tokens.scope
      ? tokens.scope.split(" ").filter(Boolean)
      : [];

    if (!scopesIncludeBusinessManage(grantedScopes)) {
      const redirect = NextResponse.redirect(
        new URL("/google?google_error=missing_business_scope", url.origin),
      );
      clearOAuthFlowCookies(redirect);
      return redirect;
    }

    // Upsert google account
    const existing = await db.googleAccount.findFirst();
    // Google does not always return a new refresh_token on re-auth — preserve the
    // existing one if missing. Encrypt both tokens at rest before saving.
    const newRefresh = tokens.refreshToken || existing?.refreshToken || null;
    if (existing) {
      await db.googleAccount.update({
        where: { id: existing.id },
        data: {
          email,
          googleUserId,
          status: "active",
          accessToken: encryptToken(tokens.accessToken),
          refreshToken: encryptToken(newRefresh),
          tokenExpiry: new Date(tokens.expiryDate),
          scopesJson: JSON.stringify(grantedScopes),
        },
      });
    } else {
      await db.googleAccount.create({
        data: {
          email,
          googleUserId,
          status: "active",
          accessToken: encryptToken(tokens.accessToken),
          refreshToken: encryptToken(newRefresh),
          tokenExpiry: new Date(tokens.expiryDate),
          scopesJson: JSON.stringify(grantedScopes),
        },
      });
    }

    if (user) {
      await logAudit({ userId: user.id, userName: user.name, action: "google.connect", entity: "google_account", newValue: { email, mode: "production" }, ip: req.headers.get("x-forwarded-for") ?? undefined });
    }

    const redirect = NextResponse.redirect(new URL("/google?google_connected=true", url.origin));
    clearOAuthFlowCookies(redirect);
    return redirect;
  } catch (e: any) {
    console.error("Google OAuth callback error:", e);
    const redirect = NextResponse.redirect(new URL(`/google?google_error=${encodeURIComponent(e.message)}`, url.origin));
    clearOAuthFlowCookies(redirect);
    return redirect;
  }
}

// POST /api/google/callback — initiate OAuth flow (get auth URL + set state cookie)
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
  const { url: authUrl, state } = getGoogleAuthUrl(body.state, redirectUri);
  rememberOAuthState(state, redirectUri);
  const res = NextResponse.json({ success: true, authUrl, state, redirectUri, mode: googleServiceStatus.mode });
  // Set CSRF state cookie — HttpOnly, SameSite=Lax, 1h expiry
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
