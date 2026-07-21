import { NextRequest } from "next/server";
import { ok } from "@/lib/api-response";
import { assertCronAuthorized } from "@/lib/cron-auth";
import { processAllPendingAutoReplies } from "@/lib/review-auto-reply";

export const dynamic = "force-dynamic";

/** GET /api/cron/auto-reply-reviews — reply to pending reviews matching auto-reply rules */
export async function GET(req: NextRequest) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  const result = await processAllPendingAutoReplies({ batchSize: 10, maxBatches: 50 });
  return ok(
    result,
    `Auto-replied to ${result.replied} review(s)${result.remaining ? ` · ${result.remaining} still pending` : ""}`,
  );
}
