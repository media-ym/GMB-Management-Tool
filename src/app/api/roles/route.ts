import { NextRequest } from "next/server";
import { getSessionUser, logAudit } from "@/lib/session";
import { ok, unauthorized, forbidden, fail } from "@/lib/api-response";
import { can, PERMISSION_CATALOG, type Permission, type RbacRoleDef } from "@/lib/permissions";
import { isValidRoleValue, loadRbacRoles, saveRbacRoles, slugifyRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "settings.view") && !can(user.role, "users.manage")) return forbidden();

  const roles = await loadRbacRoles();
  return ok({
    roles,
    catalog: PERMISSION_CATALOG,
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "users.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const label = String(body.label || "").trim();
  const description = String(body.description || "").trim();
  const permissions = Array.isArray(body.permissions) ? (body.permissions as Permission[]) : [];
  if (!label) return fail("Role name is required");

  const validPerms = new Set(PERMISSION_CATALOG.map((p) => p.key));
  const cleanPerms = permissions.filter((p) => validPerms.has(p));

  const roles = await loadRbacRoles();
  let value = slugifyRole(label);
  if (roles.some((r) => r.value === value)) {
    value = `${value}_${Date.now().toString(36).slice(-4)}`;
  }

  const created: RbacRoleDef = {
    value,
    label,
    description,
    permissions: cleanPerms,
    system: false,
  };
  const next = await saveRbacRoles([...roles, created]);

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "role.create",
    entity: "role",
    entityId: value,
    newValue: created,
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok({ roles: next, role: created }, "Role created");
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "users.manage")) return forbidden();

  const body = await req.json().catch(() => ({}));
  const value = String(body.value || "");
  if (!value) return fail("value required");

  const roles = await loadRbacRoles();
  const idx = roles.findIndex((r) => r.value === value);
  if (idx < 0) return fail("Role not found", 404);

  const validPerms = new Set(PERMISSION_CATALOG.map((p) => p.key));
  const current = roles[idx];
  const updated: RbacRoleDef = {
    ...current,
    label: body.label != null ? String(body.label).trim() || current.label : current.label,
    description: body.description != null ? String(body.description) : current.description,
    permissions: Array.isArray(body.permissions)
      ? (body.permissions as Permission[]).filter((p) => validPerms.has(p))
      : current.permissions,
    system: current.system,
  };

  // Super admin must always keep users.manage
  if (updated.value === "super_admin" && !updated.permissions.includes("users.manage")) {
    updated.permissions = [...updated.permissions, "users.manage"];
  }

  const nextList = [...roles];
  nextList[idx] = updated;
  const next = await saveRbacRoles(nextList);

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "role.update",
    entity: "role",
    entityId: value,
    newValue: updated,
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok({ roles: next, role: updated }, "Role updated");
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!can(user.role, "users.manage")) return forbidden();

  const url = new URL(req.url);
  const value = url.searchParams.get("value") || "";
  if (!value) return fail("value required");
  if (!(await isValidRoleValue(value))) return fail("Role not found", 404);

  const roles = await loadRbacRoles();
  const target = roles.find((r) => r.value === value);
  if (!target) return fail("Role not found", 404);
  if (target.system) return fail("System roles cannot be deleted");

  const next = await saveRbacRoles(roles.filter((r) => r.value !== value));

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: "role.delete",
    entity: "role",
    entityId: value,
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return ok({ roles: next }, "Role deleted");
}
