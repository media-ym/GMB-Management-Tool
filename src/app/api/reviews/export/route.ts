import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/reviews/export — export reviews as CSV (doc 08 §22)
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const sentiment = url.searchParams.get("sentiment") || undefined;

  const scoped = scopeLocationIds(user, locationId);
  const where: any = {};
  if (scoped) where.locationId = { in: scoped };
  if (locationId && (!scoped || scoped.includes(locationId))) where.locationId = locationId;
  if (status) where.replyStatus = status;
  if (sentiment) where.sentiment = sentiment;

  const reviews = await db.review.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: { location: { select: { name: true, city: true } } },
  });

  // Build CSV
  const headers = ["Review ID", "Google Review ID", "Location", "City", "Author", "Rating", "Sentiment", "Reply Status", "Reply Source", "Review Text", "Reply Text", "Created At", "Replied At"];
  const rows = reviews.map(r => [
    r.id,
    r.googleReviewId,
    r.location.name,
    r.location.city,
    r.authorName,
    r.rating,
    r.sentiment,
    r.replyStatus,
    r.replySource ?? "",
    `"${r.text.replace(/"/g, '""')}"`,
    `"${(r.replyText ?? "").replace(/"/g, '""')}"`,
    r.createdAt.toISOString(),
    r.repliedAt?.toISOString() ?? "",
  ]);

  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="myfng-reviews-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
