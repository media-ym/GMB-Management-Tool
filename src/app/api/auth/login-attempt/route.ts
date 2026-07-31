import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/api-response";
import { getSecurityConfig } from "@/lib/app-settings";
import { isLocked } from "@/lib/password";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login-attempt
 * body: { email, result: "check" | "failure" | "success" }
 * Enforces Settings → Security lockout for Supabase Auth login flow.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const result = String(body.result || "check");
  if (!email) return fail("email required");

  const security = await getSecurityConfig();
  const maxFailed = security.maxFailedAttempts;
  const lockMs = security.lockDuration * 60 * 1000;

  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      status: true,
      failedLoginAttempts: true,
      lockedUntil: true,
    },
  });

  if (!user) {
    // Don't reveal existence
    return ok({ allowed: true });
  }

  if (user.status === "suspended" || user.status === "inactive") {
    return fail(`Account is ${user.status}`, 403);
  }

  if (isLocked(user.lockedUntil) || (user.status === "locked" && isLocked(user.lockedUntil))) {
    const remaining = Math.ceil((new Date(user.lockedUntil!).getTime() - Date.now()) / 60000);
    return fail(`Account locked. Try again in ${remaining} minute(s).`, 423);
  }

  if (result === "check") {
    return ok({
      allowed: true,
      failedLoginAttempts: user.failedLoginAttempts,
      maxFailedAttempts: maxFailed,
    });
  }

  if (result === "failure") {
    const newFailed = user.failedLoginAttempts + 1;
    const shouldLock = newFailed >= maxFailed;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: newFailed,
        status: shouldLock ? "locked" : user.status === "locked" ? "locked" : user.status,
        lockedUntil: shouldLock ? new Date(Date.now() + lockMs) : user.lockedUntil,
      },
    });
    if (shouldLock) {
      return fail(`Too many failed attempts. Account locked for ${security.lockDuration} minutes.`, 423);
    }
    return ok({
      allowed: false,
      failedLoginAttempts: newFailed,
      remaining: maxFailed - newFailed,
    });
  }

  if (result === "success") {
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        status: "active",
      },
    });
    return ok({ allowed: true });
  }

  return fail("Invalid result");
}
