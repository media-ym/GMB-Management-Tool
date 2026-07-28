import { createClient } from "@supabase/supabase-js";
import {
  requireSupabaseServiceRoleKey,
  requireSupabaseUrl,
} from "./env";

/** Service-role client — server only. Bypasses RLS. Never expose to the browser. */
export function createAdminClient() {
  return createClient(requireSupabaseUrl(), requireSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
