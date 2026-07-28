import { db } from "./db";
import type { SessionUser } from "./types";
import { can, type Permission } from "./permissions";
import type { Role } from "./types";
import { createClient } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/env";

function toSessionUser(dbUser: {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar: string | null;
  assignedLocationIds: string | null;
}): SessionUser {
  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role as Role,
    avatar: dbUser.avatar ?? null,
    assignedLocationIds: dbUser.assignedLocationIds
      ? dbUser.assignedLocationIds.split(",").filter(Boolean)
      : [],
  };
}

async function resolveDbUserFromAuth(authId: string, email: string) {
  const normalized = email.trim().toLowerCase();
  let dbUser = await db.user.findFirst({
    where: {
      OR: [{ authId }, { email: normalized }],
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      avatar: true,
      assignedLocationIds: true,
      status: true,
      authId: true,
      lockedUntil: true,
    },
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
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        assignedLocationIds: true,
        status: true,
        authId: true,
        lockedUntil: true,
      },
    });
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

    return toSessionUser(dbUser);
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
  if (!can(u.role, perm)) throw new Error("FORBIDDEN");
  return u;
}

// Scope a query to a branch manager's assigned locations
export function scopeLocationIds(user: SessionUser, requestedLocationId?: string): string[] | undefined {
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
