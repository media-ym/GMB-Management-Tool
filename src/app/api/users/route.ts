import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { hashPassword } from "@/lib/password";
import { ROLES, type Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "users.manage")) return forbidden();

  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true, active: true, phone: true, avatar: true, assignedLocationIds: true, lastLoginAt: true, createdAt: true },
  });

  return ok(users.map((u) => ({
    ...u,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    assignedLocationIds: u.assignedLocationIds ? u.assignedLocationIds.split(",").filter(Boolean) : [],
  })));
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "users.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { name, email, role, password, assignedLocationIds } = body;
  if (!name || !email || !role || !password) return fail("name, email, role, password required");
  if (!ROLES.some((r) => r.value === role)) return fail("Invalid role");

  const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return fail("Email already in use");

  const created = await db.user.create({
    data: {
      name, email: email.toLowerCase(),
      role: role as Role,
      password: await hashPassword(password),
      assignedLocationIds: Array.isArray(assignedLocationIds) ? assignedLocationIds.join(",") : null,
    },
  });

  await logAudit({ userId: user.id, userName: user.name, action: "user.create", entity: "user", entityId: created.id, newValue: { name, email, role }, ip: req.headers.get("x-forwarded-for") ?? undefined });
  return ok({ id: created.id }, "User created");
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "users.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { id, role, active, assignedLocationIds, name } = body;
  if (!id) return fail("id required");

  const data: any = {};
  if (role) {
    if (!ROLES.some((r) => r.value === role)) return fail("Invalid role");
    data.role = role;
  }
  if (typeof active === "boolean") data.active = active;
  if (Array.isArray(assignedLocationIds)) data.assignedLocationIds = assignedLocationIds.join(",");
  if (name) data.name = name;

  const updated = await db.user.update({ where: { id }, data });
  await logAudit({ userId: user.id, userName: user.name, action: "user.update", entity: "user", entityId: id, newValue: data, ip: req.headers.get("x-forwarded-for") ?? undefined });
  return ok({ id: updated.id }, "User updated");
}
