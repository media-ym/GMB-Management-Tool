import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, fail, unauthorized, forbidden } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { parsePrice, parseProductCsv } from "@/lib/product-import";

export const dynamic = "force-dynamic";

/** POST /api/products/import — bulk import GMB-style product catalog from CSV */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.manage")) return forbidden();

  const contentType = req.headers.get("content-type") || "";
  let csvText = "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("CSV file is required (field: file)");
    csvText = await file.text();
  } else {
    const body = await req.json().catch(() => ({}));
    csvText = typeof body.csv === "string" ? body.csv : "";
    if (!csvText) return fail("csv text or multipart file is required");
  }

  const { rows, errors: parseErrors } = parseProductCsv(csvText);
  if (parseErrors.length && rows.length === 0) return fail(parseErrors.join("; "));

  const scoped = scopeLocationIds(user);
  const locations = await db.location.findMany({
    where: scoped ? { id: { in: scoped } } : {},
    select: { id: true, name: true },
  });
  const byId = new Map(locations.map((l) => [l.id, l.id]));
  const byName = locations.map((l) => ({ id: l.id, name: l.name.toLowerCase() }));

  let imported = 0;
  const errors = [...parseErrors];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    let locationId = row.locationid || row.location_id || "";
    const locationName = row.locationname || row.location_name || row.location || "";

    if (!locationId && locationName) {
      const needle = locationName.toLowerCase();
      const match = byName.find((l) => l.name.includes(needle) || needle.includes(l.name));
      locationId = match?.id ?? "";
    }

    if (!locationId || !byId.has(locationId)) {
      errors.push(`Row ${rowNum}: location not found (${locationName || locationId || "missing"})`);
      continue;
    }

    if (scoped && !scoped.includes(locationId)) {
      errors.push(`Row ${rowNum}: location out of scope`);
      continue;
    }

    try {
      await db.product.create({
        data: {
          locationId,
          name: row.name.trim(),
          description: row.description?.trim() || null,
          category: row.category?.trim() || null,
          price: parsePrice(row.price),
          currency: row.currency?.trim() || "INR",
          imageUrl: row.imageurl?.trim() || row.image_url?.trim() || null,
          source: "manual",
        },
      });
      imported++;
    } catch (e: unknown) {
      errors.push(`Row ${rowNum}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return ok(
    { imported, skipped: rows.length - imported, errors },
    imported > 0 ? `Imported ${imported} products` : "No products imported",
  );
}
