import { NextRequest } from "next/server";
import { getSessionUser, scopeLocationIds, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { bulkTemplateReplyToReviews } from "@/lib/review-auto-reply";

export const dynamic = "force-dynamic";

/** POST /api/reviews/bulk-reply — apply per-rating templates to selected pending reviews */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.reply")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const reviewIds = Array.isArray(body.reviewIds)
    ? body.reviewIds.filter((id: unknown) => typeof id === "string")
    : [];

  if (reviewIds.length === 0) return fail("reviewIds array is required");
  if (reviewIds.length > 100) return fail("Maximum 100 reviews per bulk action");

  const scopedIds = scopeLocationIds(user);
  const reviews = await db.review.findMany({
    where: {
      id: { in: reviewIds },
      replyStatus: "pending",
      ...(scopedIds ? { locationId: { in: scopedIds } } : {}),
    },
    select: { id: true },
  });

  const allowedIds = reviews.map((r) => r.id);
  if (allowedIds.length === 0) return fail("No pending reviews found for selection");

  const result = await bulkTemplateReplyToReviews(allowedIds);

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "review.bulk_template_reply",
    entity: "review",
    newValue: { requested: reviewIds.length, processed: allowedIds.length, ...result },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok(
    result,
    `Replied to ${result.replied} review(s)${result.skipped ? ` · ${result.skipped} skipped` : ""}`,
  );
}
