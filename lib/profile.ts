import "server-only";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Grade } from "@/lib/types";

/**
 * The hackathon stand-in for an account: a `profiles` row whose id lives in a
 * cookie.
 *
 * The cookie is server-issued and HttpOnly, which is the whole point. If the
 * browser could name its own profile id, it could name somebody else's and
 * start attaching quests to them — and with no login there is nothing else to
 * check it against. Script on the page cannot read this value either.
 *
 * Swapping this for real auth later means reading the user id from the session
 * instead of the cookie; nothing else in the upload path needs to change.
 */
const COOKIE_NAME = "sidequest_profile";

/** Long enough that a student keeps their history, short enough to lapse. */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * The profile already issued to this browser, or null if none exists yet.
 *
 * Read-only: a page that is only checking ownership must not mint a new
 * profile just because someone followed a quest link. Creation stays on
 * the upload path, where a grade is known and a row is actually needed.
 */
export async function getProfileId(): Promise<string | null> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(COOKIE_NAME)?.value;

  if (!existing || !isUuid(existing)) return null;

  const { data } = await createAdminClient()
    .from("profiles")
    .select("id")
    .eq("id", existing)
    .maybeSingle();

  return data?.id ?? null;
}

/**
 * Returns the profile for this browser, creating one on first upload.
 *
 * `grade` is needed because `profiles.grade_level` is NOT NULL, and it doubles
 * as a way to keep the row honest when a student goes back and picks a
 * different grade.
 */
export async function getOrCreateProfileId(grade: Grade): Promise<string> {
  const cookieStore = await cookies();
  const supabase = createAdminClient();
  const existing = cookieStore.get(COOKIE_NAME)?.value;

  // Shape-check before querying: the cookie is attacker-supplied, and a
  // non-uuid would just be a guaranteed round trip to a Postgres cast error.
  if (existing && isUuid(existing)) {
    const { data } = await supabase
      .from("profiles")
      .select("id, grade_level")
      .eq("id", existing)
      .maybeSingle();

    // A missing row means the cookie outlived the database it points into, so
    // fall through and issue a new profile rather than failing the upload.
    if (data) {
      if (data.grade_level !== grade) {
        await supabase
          .from("profiles")
          .update({ grade_level: grade })
          .eq("id", data.id);
      }

      return data.id;
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .insert({ grade_level: grade })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `Could not create an anonymous profile: ${error?.message ?? "no row returned"}`,
    );
  }

  cookieStore.set(COOKIE_NAME, data.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  return data.id;
}
