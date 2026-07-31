/** Shared Supabase env helpers. Throws only when a caller requires the value. */

export function getSupabaseUrl(): string | undefined {
  // Server: prefer direct Kong URL (no loop through our own /supabase proxy)
  if (typeof window === "undefined") {
    const internal =
      process.env.SUPABASE_URL || process.env.SUPABASE_INTERNAL_URL;
    if (internal) return internal.replace(/\/$/, "");
  }
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") || undefined;
}

export function getSupabaseAnonKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined;
}

export function getSupabaseServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

export function requireSupabaseUrl(): string {
  const url = getSupabaseUrl();
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return url;
}

export function requireSupabaseAnonKey(): string {
  const key = getSupabaseAnonKey();
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  return key;
}

export function requireSupabaseServiceRoleKey(): string {
  const key = getSupabaseServiceRoleKey();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return key;
}

export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
