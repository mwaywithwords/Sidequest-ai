import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicEnv } from "@/lib/env";

/**
 * Supabase client for code that runs on the server: Server Components, Server
 * Actions, and Route Handlers.
 *
 * Build a new one per request rather than sharing a module-level instance. It
 * closes over the cookies of the request that created it, so a shared instance
 * would read one visitor's session on another visitor's request. Creating one
 * is cheap — it mostly configures a `fetch` call.
 */
export async function createClient() {
  const { url, publishableKey } = supabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      /**
       * Called when a token refresh produces new cookies. Server Components
       * are not allowed to write them, so this throws and the result is
       * discarded; the session simply stays as it was for this request.
       *
       * Whoever adds authentication needs a root `proxy.ts` to do the writing
       * instead, and it has to apply the cache headers passed as `setAll`'s
       * second argument. Without them a CDN can cache a response carrying a
       * `Set-Cookie` and hand one user's session to the next.
       */
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Expected outside a Server Action or Route Handler.
        }
      },
    },
  });
}
