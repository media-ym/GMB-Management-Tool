import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, notFound, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// Internal notes on reviews (doc 08 §14) — stored as review labels with "note:" prefix
// GET /api/reviews/[id]/notes — list internal notes
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.view")) return forbidden();

  const { id } = await params;
  const review = await db.review.findUnique({ where: { id } });
  if (!review) return notFound("Review not found");

  // We store notes as ReviewLabel entries with label starting "note:"
  const noteLabels = await db.reviewLabel.findMany({
    where: { reviewId: id, label: { startsWith: "note:" } },
    orderBy: { label: "asc" }, // simplistic; in production would have a separate table
  });
  // Note: this is a simplified implementation. A proper implementation would have a
  // ReviewNote model. For now we parse notes from labels.
  return ok(noteLabels.map(n => ({ id: n.id, text: n.label.replace("note:", ""), createdAt: n.id })));
}

// POST /api/reviews/[id]/notes — add internal note
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.reply")) return forbidden();

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const text: string | undefined = body.text;
  if (!text || text.trim().length < 1) return fail("Note text required");

  const review = await db.review.findUnique({ where: { id } });
  if (!review) return notFound("Review not found");

  const note = await db.reviewLabel.create({
    data: { reviewId: id, label: `note:${text.trim()}` },
  });

  await logAudit({ userId: user.id, userName: user.name, action: "review.note", entity: "review", entityId: id, newValue: { text: text.trim() }, ip: req.headers.get("x-forwarded-for") ?? undefined });
  return ok({ id: note.id, text: text.trim() }, "Internal note added");
}
