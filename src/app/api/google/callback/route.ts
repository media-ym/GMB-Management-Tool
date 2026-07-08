import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getGoogleAuthUrl, exchangeCodeForTokens, googleServiceStatus } from "@/lib/google-service";
import { getSessionUser, logAudit } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/google/callback — Google OAuth callback (real token exchange)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");

  // Handle OAuth error from Google
  if (error) {
    return NextResponse.redirect(new URL(`/?google_error=${encodeURIComponent(error)}`, url.origin));
  }

  // ─── CSRF: validate OAuth state against cookie ─────────────────────────
  // The `state` param must match the `gmb_oauth_state` cookie we set when
  // initiating the OAuth flow. Reject on mismatch or missing cookie.
  const cookieState = req.cookies.get("gmb_oauth_state")?.value;
  // Always clear the cookie after the flow regardless of outcome
  const clearStateCookie = "gmb_oauth_state=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly";

  if (!state || !cookieState || state !== cookieState) {
    const redirect = NextResponse.redirect(new URL("/?google_error=state_mismatch", url.origin));
    redirect.headers.set("Set-Cookie", clearStateCookie);
    return redirect;
  }

  // ─── No code = OAuth flow did not complete ─────────────────────────────
  if (!code) {
    const redirect = NextResponse.redirect(new URL("/?google_error=no_code", url.origin));
    redirect.headers.set("Set-Cookie", clearStateCookie);
    return redirect;
  }

  const user = await getSessionUser();

  // Real OAuth — exchange code for tokens
  try {
    const tokens = await exchangeCodeForTokens(code);

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

    // Persist the actual scopes Google granted
    const grantedScopes = tokens.scope
      ? tokens.scope.split(" ").filter(Boolean)
      : ["https://www.googleapis.com/auth/business.manage"];

    // Upsert google account
    const existing = await db.googleAccount.findFirst();
    if (existing) {
      await db.googleAccount.update({
        where: { id: existing.id },
        data: {
          email,
          googleUserId,
          status: "active",
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken || existing.refreshToken,
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
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiry: new Date(tokens.expiryDate),
          scopesJson: JSON.stringify(grantedScopes),
        },
      });
    }

    if (user) {
      await logAudit({ userId: user.id, userName: user.name, action: "google.connect", entity: "google_account", newValue: { email, mode: "production" }, ip: req.headers.get("x-forwarded-for") ?? undefined });
    }

    const redirect = NextResponse.redirect(new URL("/?google_connected=true", url.origin));
    redirect.headers.set("Set-Cookie", clearStateCookie);
    return redirect;
  } catch (e: any) {
    console.error("Google OAuth callback error:", e);
    const redirect = NextResponse.redirect(new URL(`/?google_error=${encodeURIComponent(e.message)}`, url.origin));
    redirect.headers.set("Set-Cookie", clearStateCookie);
    return redirect;
  }
}

// POST /api/google/callback — initiate OAuth flow (get auth URL + set state cookie)
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { url: authUrl, state } = getGoogleAuthUrl(body.state);
  const res = NextResponse.json({ success: true, authUrl, state, mode: googleServiceStatus.mode });
  // Set CSRF state cookie — HttpOnly, SameSite=Lax, 1h expiry
  res.cookies.set("gmb_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60, // 1 hour
    path: "/",
  });
  return res;
}
