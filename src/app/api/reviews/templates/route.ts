import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ok, fail, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/reviews/templates — list all reply templates
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.view")) return forbidden();

  const templates = await db.reviewReplyTemplate.findMany({
    orderBy: [{ rating: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      rating: true,
      template: true,
      language: true,
      isActive: true,
      createdAt: true,
    },
  });

  return ok(
    templates.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })),
    "Templates loaded",
  );
}

// POST /api/reviews/templates — create a new reply template
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.reply")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { title, rating, template, language } = body;

  if (!title || typeof title !== "string") return fail("title is required");
  if (!rating || typeof rating !== "number" || rating < 1 || rating > 5)
    return fail("rating must be 1-5");
  if (!template || typeof template !== "string")
    return fail("template is required");

  const created = await db.reviewReplyTemplate.create({
    data: {
      title: title.trim(),
      rating,
      template: template.trim(),
      language: language?.trim() || "en",
      createdBy: user.id,
    },
  });

  return ok(
    {
      id: created.id,
      title: created.title,
      rating: created.rating,
      template: created.template,
      language: created.language,
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
    },
    "Template created",
  );
}

// PATCH /api/reviews/templates — update an existing reply template
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.reply")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { id, title, rating, template, language, isActive } = body;

  if (!id || typeof id !== "string") return fail("id is required");

  if (rating !== undefined && (typeof rating !== "number" || rating < 1 || rating > 5))
    return fail("rating must be 1-5");

  const existing = await db.reviewReplyTemplate.findUnique({ where: { id } });
  if (!existing) return fail("Template not found", 404);

  const data: Record<string, unknown> = {};
  if (title !== undefined) data.title = String(title).trim();
  if (rating !== undefined) data.rating = rating;
  if (template !== undefined) data.template = String(template).trim();
  if (language !== undefined) data.language = String(language).trim();
  if (isActive !== undefined) data.isActive = Boolean(isActive);

  const updated = await db.reviewReplyTemplate.update({ where: { id }, data });

  return ok(
    {
      id: updated.id,
      title: updated.title,
      rating: updated.rating,
      template: updated.template,
      language: updated.language,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
    },
    "Template updated",
  );
}

// DELETE /api/reviews/templates?id=xxx — delete a reply template
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "reviews.reply")) return forbidden();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return fail("id query param is required");

  const existing = await db.reviewReplyTemplate.findUnique({ where: { id } });
  if (!existing) return fail("Template not found", 404);

  await db.reviewReplyTemplate.delete({ where: { id } });

  return ok({ id }, "Template deleted");
}
