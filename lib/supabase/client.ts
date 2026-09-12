import { createBrowserClient } from "@supabase/ssr";
import { supabasePublicEnv } from "@/lib/env";

/**
 * Supabase client for code that runs in the browser: Client Components, event
 * handlers, and realtime subscriptions.
 *
 * Safe to call on every render. `createBrowserClient` keeps a singleton
 * internally, so repeated calls hand back the same instance rather than
 * opening anything new.
 */
export function createClient() {
  const { url, publishableKey } = supabasePublicEnv();

  return createBrowserClient(url, publishableKey);
}
