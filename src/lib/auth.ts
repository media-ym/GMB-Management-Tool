/**
 * Legacy NextAuth helpers removed — auth is Supabase Auth + Prisma User profile.
 * Kept as a thin re-export surface so older imports do not break.
 */
export { getSessionUser as getServerSessionUser } from "@/lib/session";
