import "server-only";

import { requireEnv } from "@/lib/env";

/**
 * Credentials that must never reach the browser.
 *
 * The `server-only` import above is the enforcement: if this module ever ends
 * up in a Client Component's module graph, the build fails instead of quietly
 * shipping a secret. That is why the secret key is read here and not in
 * `lib/env.ts` alongside the public values.
 */

/**
 * Supabase's elevated key. It bypasses Row Level Security entirely, so it
 * belongs only in Server Actions, Route Handlers, and other server-side code.
 *
 * Nothing calls this yet. The MVP reaches Supabase through the publishable key,
 * and a client built on this key should be added only when something genuinely
 * needs to bypass RLS.
 */
export function supabaseSecretKey(): string {
  return requireEnv("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
}
