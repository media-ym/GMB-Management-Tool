import { getSessionUser } from "@/lib/session";
import type { SessionUser } from "@/lib/types";

/** Server-side workspace user (Supabase Auth + Prisma RBAC profile). */
export async function getWorkspaceUser(): Promise<SessionUser | null> {
  return getSessionUser();
}
