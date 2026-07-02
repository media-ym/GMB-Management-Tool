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
    select: { id: true, email: true, name: true, role: true, status: true, phone: true, avatar: true, assignedLocationIds: true, failedLoginAttempts: true, lockedUntil: true, lastLoginAt: true, lastLoginIp: true, createdAt: true },
  });

  return ok(users.map((u) => ({
    ...u,
    lockedUntil: u.lockedUntil?.toISOString() ?? null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    lastLoginIp: u.lastLoginIp ?? null,
    createdAt: u.createdAt.toISOString(),
    assignedLocationIds: u.assignedLocationIds ? u.assignedLocationIds.split(",").filter(Boolean) : [],
  })));
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "users.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { name, email, role, password, assignedLocationIds, invite } = body;
  if (!name || !email || !role) return fail("name, email, role required");
  if (!ROLES.some((r) => r.value === role)) return fail("Invalid role");

  const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return fail("Email already in use");

  // Invitation flow (doc 06 §3): if invite=true, create user with status=invited and no password
  if (invite) {
    const { generateToken } = await import("@/lib/password");
    const token = generateToken();
    const created = await db.user.create({
      data: {
        name, email: email.toLowerCase(),
        role: role as Role,
        password: null,
        status: "invited",
        invitationToken: token,
        invitationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        assignedLocationIds: Array.isArray(assignedLocationIds) ? assignedLocationIds.join(",") : null,
      },
    });
    await logAudit({ userId: user.id, userName: user.name, action: "user.invite", entity: "user", entityId: created.id, newValue: { name, email, role }, ip: req.headers.get("x-forwarded-for") ?? undefined });
    return ok({ id: created.id, invitationToken: token }, "Invitation sent");
  }

  // Direct create with password — validate password policy (doc 06 §9)
  if (!password) return fail("password required (or set invite=true to send invitation)");
  const { validatePassword } = await import("@/lib/password");
  const pwCheck = validatePassword(password);
  if (!pwCheck.valid) return fail(`Password policy violation: ${pwCheck.errors.join("; ")}`);

  const created = await db.user.create({
    data: {
      name, email: email.toLowerCase(),
      role: role as Role,
      password: await hashPassword(password),
      status: "active",
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
  const { id, role, status, assignedLocationIds, name } = body;
  if (!id) return fail("id required");

  const data: any = {};
  if (role) {
    if (!ROLES.some((r) => r.value === role)) return fail("Invalid role");
    data.role = role;
  }
  if (status) {
    const validStatuses = ["active", "invited", "locked", "suspended", "inactive"];
    if (!validStatuses.includes(status)) return fail("Invalid status");
    data.status = status;
    if (status === "active") { data.failedLoginAttempts = 0; data.lockedUntil = null; }
    if (status === "locked") { data.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); }
  }
  if (Array.isArray(assignedLocationIds)) data.assignedLocationIds = assignedLocationIds.join(",");
  if (name) data.name = name;

  const updated = await db.user.update({ where: { id }, data });
  await logAudit({ userId: user.id, userName: user.name, action: "user.update", entity: "user", entityId: id, newValue: data, ip: req.headers.get("x-forwarded-for") ?? undefined });
  return ok({ id: updated.id }, "User updated");
}
