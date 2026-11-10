import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Service-role client. Bypasses RLS, so EVERY caller must have already established the
 * patient identity from a verified session or a verified channel binding, and must scope
 * every query by that user id. Never import this from client components.
 */
export function createAdminClient(): AdminClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("config_missing:SUPABASE_SECRET_KEY");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Any typed Supabase client (service-role or RLS-scoped user client). */
export type AdminClient = SupabaseClient<Database>;
