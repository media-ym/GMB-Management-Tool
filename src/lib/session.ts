import { db } from "./db";
import type { SessionUser } from "./types";
import { can, permissionsForRole, type Permission } from "./permissions";
import type { Role } from "./types";
import { createClient } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/env";
import { loadRbacRoles } from "./rbac";
import { getClientIdForUser } from "./portal-link";

function toSessionUser(dbUser: {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar: string | null;
  assignedLocationIds: string | null;
  clientId?: string | null;
}): SessionUser {
  const role = dbUser.role as Role;
  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role,
    avatar: dbUser.avatar ?? null,
    clientId: dbUser.clientId ?? null,
    assignedLocationIds: dbUser.assignedLocationIds
      ? dbUser.assignedLocationIds.split(",").filter(Boolean)
      : [],
    permissions: permissionsForRole(role),
  };
}

/** Never select User.clientId — column may be missing (table owned by postgres). Use ClientPortalLink. */
const USER_SESSION_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  avatar: true,
  assignedLocationIds: true,
  status: true,
  authId: true,
  lockedUntil: true,
} as const;

type DbSessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar: string | null;
  assignedLocationIds: string | null;
  status: string;
  authId: string | null;
  lockedUntil: Date | null;
  clientId?: string | null;
};

async function resolveDbUserFromAuth(authId: string, email: string): Promise<DbSessionUser | null> {
  const normalized = email.trim().toLowerCase();
  const where = { OR: [{ authId }, { email: normalized }] };

  let dbUser: DbSessionUser | null = await db.user.findFirst({
    where,
    select: USER_SESSION_SELECT,
  });

  if (!dbUser) return null;
  if (dbUser.status === "suspended" || dbUser.status === "inactive") return null;
  if (dbUser.status === "locked" && dbUser.lockedUntil && dbUser.lockedUntil > new Date()) {
    return null;
  }
  if (dbUser.status !== "active" && dbUser.status !== "locked") return null;

  if (!dbUser.authId) {
    dbUser = await db.user.update({
      where: { id: dbUser.id },
      data: { authId, status: "active", failedLoginAttempts: 0, lockedUntil: null },
      select: USER_SESSION_SELECT,
    });
  }

  // Portal mapping from ClientPortalLink (works without User.clientId column)
  if (dbUser.role === "client_portal") {
    dbUser.clientId = await getClientIdForUser(dbUser.id);
  }

  return dbUser;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser?.email) return null;

    const dbUser = await resolveDbUserFromAuth(authUser.id, authUser.email);
    if (!dbUser) return null;
    if (
      dbUser.status === "locked" &&
      dbUser.lockedUntil &&
      dbUser.lockedUntil > new Date()
    ) {
      return null;
    }

    await loadRbacRoles();
    const session = toSessionUser(dbUser);

    // Portal users: scope to locations owned by their Client (same filter path as branch_manager)
    if (session.role === "client_portal" && session.clientId) {
      const locs = await db.location.findMany({
        where: { clientId: session.clientId },
        select: { id: true },
      });
      session.assignedLocationIds = locs.map((l) => l.id);
    }

    return session;
  } catch (e) {
    console.error("getSessionUser failed", e);
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new Error("UNAUTHORIZED");
  return u;
}

export async function requirePermission(perm: Permission): Promise<SessionUser> {
  const u = await requireUser();
  const allowed = u.permissions?.includes(perm) || can(u.role, perm);
  if (!allowed) throw new Error("FORBIDDEN");
  return u;
}

/** Roles whose data must stay within assignedLocationIds (never unscoped). */
export function isLocationScopedUser(user: SessionUser): boolean {
  return user.role === "branch_manager" || user.role === "client_portal";
}

// Scope a query to a branch manager's / portal client's locations
export function scopeLocationIds(user: SessionUser, requestedLocationId?: string): string[] | undefined {
  if (user.role === "client_portal") {
    const ids = user.assignedLocationIds ?? [];
    if (requestedLocationId && !ids.includes(requestedLocationId)) {
      throw new Error("FORBIDDEN");
    }
    // Always scope — empty list means no locations yet (never all tenants)
    return ids.length > 0 ? ids : ["__none__"];
  }
  if (user.role === "branch_manager" && user.assignedLocationIds && user.assignedLocationIds.length > 0) {
    if (requestedLocationId && !user.assignedLocationIds.includes(requestedLocationId)) {
      throw new Error("FORBIDDEN");
    }
    return user.assignedLocationIds;
  }
  return requestedLocationId ? [requestedLocationId] : undefined;
}

export async function logAudit(opts: {
  userId?: string;
  userName?: string;
  action: string;
  entity?: string;
  entityId?: string;
  previousValue?: unknown;
  newValue?: unknown;
  ip?: string;
  status?: "success" | "failed";
}) {
  try {
    await db.auditLog.create({
      data: {
        userId: opts.userId ?? null,
        userName: opts.userName ?? null,
        action: opts.action,
        entity: opts.entity ?? null,
        entityId: opts.entityId ?? null,
        previousValue: opts.previousValue ? JSON.stringify(opts.previousValue) : null,
        newValue: opts.newValue ? JSON.stringify(opts.newValue) : null,
        ip: opts.ip ?? null,
        status: opts.status ?? "success",
      },
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}

export async function touchLastLogin(userId: string, ip?: string) {
  try {
    await db.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ip ?? null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        status: "active",
      },
    });
  } catch (e) {
    console.error("touchLastLogin failed", e);
  }
}
