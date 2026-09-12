import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabasePublicEnv } from "@/lib/env";
import { supabaseSecretKey } from "@/lib/env.server";

/**
 * Supabase client holding the secret key, which bypasses Row Level Security.
 *
 * Built on `@supabase/supabase-js` rather than `@supabase/ssr` deliberately:
 * this client must not read the request's cookies. Its authority comes from
 * the secret key alone, and mixing a visitor's session into it would only blur
 * whose authority an operation actually ran under.
 *
 * Every table has RLS on with no policies, so this is currently the only way
 * to reach them at all. That makes it powerful: use it behind a server
 * boundary that has already decided the operation is allowed, and never
 * forward a client-supplied id into a query without checking it first.
 */
export function createAdminClient() {
  const { url } = supabasePublicEnv();

  return createSupabaseClient(url, supabaseSecretKey(), {
    // Nothing here is a logged-in user, so there is no session to keep.
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
