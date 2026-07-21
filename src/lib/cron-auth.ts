import { NextRequest } from "next/server";

/**
 * Shared auth for /api/cron/* routes.
 * Requires header `x-cron-secret` === process.env.CRON_SECRET.
 * If CRON_SECRET is unset, cron is disabled (401).
 */
export function assertCronAuthorized(req: NextRequest): Response | null {
  const cronSecret = req.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected || cronSecret !== expected) {
    return new Response(
      JSON.stringify({ success: false, message: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}
