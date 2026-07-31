import { db } from "@/lib/db";
import {
  BUILTIN_ROLE_DEFS,
  type Permission,
  type RbacRoleDef,
  permissionsForRole,
  setRbacRoleMap,
  builtinPermissions,
} from "@/lib/permissions";

const RBAC_KEY = "rbac";

type RbacStore = { roles: RbacRoleDef[] };

function defaultRoles(): RbacRoleDef[] {
  return BUILTIN_ROLE_DEFS.map((r) => ({
    ...r,
    permissions: [...permissionsForRole(r.value)],
    system: true,
  }));
}

function parseStore(raw: string | null | undefined): RbacStore {
  if (!raw) return { roles: defaultRoles() };
  try {
    const parsed = JSON.parse(raw) as RbacStore;
    if (!parsed?.roles?.length) return { roles: defaultRoles() };
    // Ensure all system roles exist; merge saved permissions
    const byValue = new Map(parsed.roles.map((r) => [r.value, r]));
    const merged: RbacRoleDef[] = defaultRoles().map((d) => {
      const saved = byValue.get(d.value);
      // Always refresh client_portal from code MATRIX (saved RBAC often has old limited perms)
      if (d.value === "client_portal") {
        return {
          ...d,
          label: saved?.label || d.label,
          description: saved?.description || d.description,
          permissions: builtinPermissions("client_portal"),
          system: true,
        };
      }
      if (!saved) return d;
      return {
        ...d,
        label: saved.label || d.label,
        description: saved.description || d.description,
        permissions: Array.isArray(saved.permissions) ? (saved.permissions as Permission[]) : d.permissions,
        system: true,
      };
    });
    for (const r of parsed.roles) {
      if (r.system) continue;
      if (!r.value || !r.label) continue;
      merged.push({
        value: r.value,
        label: r.label,
        description: r.description || "",
        permissions: Array.isArray(r.permissions) ? (r.permissions as Permission[]) : [],
        system: false,
      });
    }
    return { roles: merged };
  } catch {
    return { roles: defaultRoles() };
  }
}

let cache: { at: number; roles: RbacRoleDef[] } | null = null;

export function invalidateRbacCache() {
  cache = null;
}

export async function loadRbacRoles(): Promise<RbacRoleDef[]> {
  if (cache && Date.now() - cache.at < 15_000) {
    setRbacRoleMap(cache.roles);
    return cache.roles;
  }
  const row = await db.setting.findUnique({ where: { key: RBAC_KEY } });
  const roles = parseStore(row?.value).roles;
  cache = { at: Date.now(), roles };
  setRbacRoleMap(roles);
  return roles;
}

export async function saveRbacRoles(roles: RbacRoleDef[]): Promise<RbacRoleDef[]> {
  await db.setting.upsert({
    where: { key: RBAC_KEY },
    create: { key: RBAC_KEY, value: JSON.stringify({ roles }), description: "RBAC role definitions" },
    update: { value: JSON.stringify({ roles }) },
  });
  invalidateRbacCache();
  return loadRbacRoles();
}

export function slugifyRole(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return base || `role_${Date.now().toString(36)}`;
}

export async function isValidRoleValue(value: string): Promise<boolean> {
  const roles = await loadRbacRoles();
  return roles.some((r) => r.value === value);
}
