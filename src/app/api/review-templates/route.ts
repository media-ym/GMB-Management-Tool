import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail, notFound } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/review-templates — list all reply templates (doc 08 §10)
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.view")) return forbidden();

  const templates = await db.reviewReplyTemplate.findMany({ orderBy: { rating: "asc" } });
  return ok(templates.map(t => ({
    id: t.id,
    title: t.title,
    rating: t.rating,
    template: t.template,
    language: t.language,
    isActive: t.isActive,
    createdBy: t.createdBy,
    createdAt: t.createdAt.toISOString(),
  })));
}

// POST /api/review-templates — create template
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.reply")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { title, rating, template, language } = body;
  if (!title || !rating || !template) return fail("title, rating, template required");
  if (rating < 1 || rating > 5) return fail("rating must be 1-5");

  const created = await db.reviewReplyTemplate.create({
    data: { title, rating, template, language: language || "en", isActive: true, createdBy: user.id },
  });
  await logAudit({ userId: user.id, userName: user.name, action: "template.create", entity: "review_template", entityId: created.id, ip: req.headers.get("x-forwarded-for") ?? undefined });
  return ok({ id: created.id }, "Template created");
}

// PATCH /api/review-templates — update template
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.reply")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { id, title, rating, template, isActive, language } = body;
  if (!id) return fail("id required");

  const data: any = {};
  if (title) data.title = title;
  if (rating) { if (rating < 1 || rating > 5) return fail("rating must be 1-5"); data.rating = rating; }
  if (template) data.template = template;
  if (typeof isActive === "boolean") data.isActive = isActive;
  if (language) data.language = language;

  const updated = await db.reviewReplyTemplate.update({ where: { id }, data });
  await logAudit({ userId: user.id, userName: user.name, action: "template.update", entity: "review_template", entityId: id, newValue: data, ip: req.headers.get("x-forwarded-for") ?? undefined });
  return ok({ id: updated.id }, "Template updated");
}

// DELETE via POST with action=delete
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.reply")) return forbidden();

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return fail("id query param required");

  await db.reviewReplyTemplate.delete({ where: { id } });
  await logAudit({ userId: user.id, userName: user.name, action: "template.delete", entity: "review_template", entityId: id, ip: req.headers.get("x-forwarded-for") ?? undefined });
  return ok({ id }, "Template deleted");
}
