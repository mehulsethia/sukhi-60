import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Database } from "@/lib/database.types";
import { freshFetch } from "./fresh-fetch";

/** Per-request client bound to the user's session cookies. All queries are RLS-enforced. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { fetch: freshFetch },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component; the proxy refreshes the session instead.
          }
        },
      },
    },
  );
}

/**
 * Verified identity (getUser validates the JWT with Supabase Auth; never trust getSession alone).
 * Memoized per request: the layout, the page and its server components share one check
 * instead of each making a round trip to Supabase Auth.
 */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { supabase, user: null };
  return { supabase, user: data.user };
});

export async function requireUser() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}
