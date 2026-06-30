import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { db } from "./db";
import type { SessionUser } from "./types";
import { can, type Permission } from "./permissions";

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const u = session.user as any;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    avatar: u.avatar ?? null,
    assignedLocationIds: u.assignedLocationIds ?? [],
  };
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
