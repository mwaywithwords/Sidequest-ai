/**
 * Environment access for the values that are safe to ship to the browser.
 *
 * Anything named `NEXT_PUBLIC_*` is inlined into the client bundle at build
 * time, so every value read here is public by definition. Credentials that
 * must stay on the server live in `lib/env.server.ts`, which a Client
 * Component cannot import.
 */

/**
 * Reads a variable at call time rather than on import, so pulling this module
 * into a page cannot fail a build that never talks to Supabase. A variable
 * that is present but blank counts as missing, which is what `.env.example`
 * leaves behind when a value never got filled in.
 */
export function requireEnv(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;

  throw new Error(
    `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
  );
}

/**
 * The project URL and publishable key, which both Supabase clients need.
 *
 * The `process.env` lookups are spelled out in full because the bundler
 * substitutes literal `process.env.NEXT_PUBLIC_*` expressions for their
 * values. Reading them through a computed key would leave them undefined in
 * the browser.
 */
export function supabasePublicEnv() {
  return {
    url: requireEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    publishableKey: requireEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}
