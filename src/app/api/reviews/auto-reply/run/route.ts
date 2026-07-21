import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { processAllPendingAutoReplies } from "@/lib/review-auto-reply";

export const dynamic = "force-dynamic";

/** POST /api/reviews/auto-reply/run — reply to all pending reviews matching auto-reply rules */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.reply")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const ratings = Array.isArray(body.ratings)
    ? body.ratings.filter((r: unknown) => typeof r === "number")
    : undefined;

  const result = await processAllPendingAutoReplies({ ratings, batchSize: 10, maxBatches: 50 });

  return ok(
    result,
    `Auto-replied to ${result.replied} review(s)${result.remaining ? ` · ${result.remaining} still pending` : ""}`,
  );
}
