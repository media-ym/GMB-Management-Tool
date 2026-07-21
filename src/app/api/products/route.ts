import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, scopeLocationIds } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/products — list products with location info
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "locations.view")) return forbidden();

  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || undefined;
  const locationIdsParam = url.searchParams.get("locationIds")?.split(",").filter(Boolean);
  const category = url.searchParams.get("category") || undefined;
  const search = url.searchParams.get("search") || undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  const scoped = scopeLocationIds(user);
  const where: any = { isActive: true };

  if (locationIdsParam?.length) {
    where.locationId = scoped
      ? { in: scoped.filter((id) => locationIdsParam.includes(id)) }
      : { in: locationIdsParam };
  } else if (scoped) {
    where.locationId = { in: scoped };
  }

  if (locationId && (!scoped || scoped.includes(locationId))) where.locationId = locationId;
  if (category) where.category = category;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { description: { contains: search } },
    ];
  }

  const products = await db.product.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { location: { select: { name: true, city: true } } },
  });

  const data = products.map((p) => ({
    id: p.id,
    locationId: p.locationId,
    locationName: p.location.name,
    locationCity: p.location.city,
    name: p.name,
    description: p.description,
    price: p.price,
    currency: p.currency,
    category: p.category,
    imageUrl: p.imageUrl,
    googleItemId: p.googleItemId,
    googleEditId: p.googleEditId,
    landingUrl: p.landingUrl,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return ok(data);
}

// POST /api/products — create a product
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { locationId, name, description, price, category, imageUrl } = body;

  if (!locationId || !name) return fail("locationId and name are required");

  const scoped = scopeLocationIds(user, locationId);
  if (scoped && !scoped.includes(locationId)) return forbidden("Location out of scope");

  const location = await db.location.findUnique({ where: { id: locationId } });
  if (!location) return fail("Location not found", 404);

  const product = await db.product.create({
    data: {
      locationId,
      name,
      description: description || null,
      price: price != null ? parseFloat(price) : null,
      category: category || null,
      imageUrl: imageUrl || null,
    },
  });

  return ok({ id: product.id, name: product.name }, "Product created");
}

// DELETE /api/products?id=xxx — delete a product
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "posts.manage")) return forbidden();

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return fail("id query param is required");

  const product = await db.product.findUnique({ where: { id } });
  if (!product) return fail("Product not found", 404);

  const scoped = scopeLocationIds(user, product.locationId);
  if (scoped && !scoped.includes(product.locationId)) return forbidden("Location out of scope");

  await db.product.delete({ where: { id } });

  return ok({ id }, "Product deleted");
}
