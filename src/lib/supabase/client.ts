"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseAnonKey, requireSupabaseUrl } from "./env";

export function createClient() {
  return createBrowserClient(requireSupabaseUrl(), requireSupabaseAnonKey());
}
