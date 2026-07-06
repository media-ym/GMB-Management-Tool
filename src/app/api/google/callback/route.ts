import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getGoogleAuthUrl, exchangeCodeForTokens, googleServiceStatus } from "@/lib/google-service";
import { getSessionUser, logAudit } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/google/callback — Google OAuth callback (real token exchange)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const mock = url.searchParams.get("mock");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");

  // Handle OAuth error from Google
  if (error) {
    return NextResponse.redirect(new URL(`/?google_error=${encodeURIComponent(error)}`, url.origin));
  }

  const user = await getSessionUser();

  // Mock mode — just create/update the account record
  if (mock === "true" || !code) {
    const existing = await db.googleAccount.findFirst();
    if (existing) {
      await db.googleAccount.update({
        where: { id: existing.id },
        data: {
          status: "active",
          accessToken: "mock_access_token_" + Date.now(),
          refreshToken: "mock_refresh_token_" + Date.now(),
          tokenExpiry: new Date(Date.now() + 3600 * 1000),
        },
      });
    } else {
      await db.googleAccount.create({
        data: {
          email: "gmb@myfng.in",
          googleUserId: "gmb_myfng_" + Date.now(),
          status: "active",
          accessToken: "mock_access_token_" + Date.now(),
          refreshToken: "mock_refresh_token_" + Date.now(),
          tokenExpiry: new Date(Date.now() + 3600 * 1000),
          scopesJson: JSON.stringify(["https://www.googleapis.com/auth/business.manage"]),
        },
      });
    }
    if (user) {
      await logAudit({ userId: user.id, userName: user.name, action: "google.connect", entity: "google_account", newValue: { mode: "mock" }, ip: req.headers.get("x-forwarded-for") ?? undefined });
    }
    return NextResponse.redirect(new URL("/?google_connected=true", url.origin));
  }

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
          scopesJson: JSON.stringify(["https://www.googleapis.com/auth/business.manage"]),
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
          scopesJson: JSON.stringify(["https://www.googleapis.com/auth/business.manage"]),
        },
      });
    }

    if (user) {
      await logAudit({ userId: user.id, userName: user.name, action: "google.connect", entity: "google_account", newValue: { email, mode: "production" }, ip: req.headers.get("x-forwarded-for") ?? undefined });
    }

    return NextResponse.redirect(new URL("/?google_connected=true", url.origin));
  } catch (e: any) {
    console.error("Google OAuth callback error:", e);
    return NextResponse.redirect(new URL(`/?google_error=${encodeURIComponent(e.message)}`, url.origin));
  }
}

// POST /api/google/callback — initiate OAuth flow (get auth URL)
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const authUrl = getGoogleAuthUrl(body.state);
  return NextResponse.json({ success: true, authUrl, mode: googleServiceStatus.mode });
}
