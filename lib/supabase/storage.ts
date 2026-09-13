import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** Private bucket. Nothing inside is reachable without a signed URL. */
export const QUEST_IMAGE_BUCKET = "sidequest-images";

/**
 * Long enough for a student to move through Discover → Connect → Challenge
 * on one page load, short enough that a leaked URL is not a lasting key.
 * Minted per request and never written to Postgres.
 */
export const QUEST_IMAGE_SIGNED_TTL_SECONDS = 60 * 15;

/**
 * Where a quest's original photo lives.
 *
 * Both ids are uuids generated on the server, so nothing the client sends can
 * steer the write — a filename claiming to be `../../someone-else/original.jpg`
 * never reaches this function. Leading with the profile id also groups a
 * student's photos under one prefix, which is what a future storage policy
 * would grant access on.
 *
 * Only this path is stored, in `quests.image_path`. Never a URL, because a
 * signed URL expires, and never the bytes.
 */
export function questImagePath(
  profileId: string,
  questId: string,
  extension: string,
): string {
  return `${profileId}/${questId}/original.${extension}`;
}

/**
 * A short-lived URL the browser can use to display one private photo.
 *
 * Created on the server with the secret key, then handed to the page as a
 * string. The path in `quests.image_path` is what we keep; this URL is
 * thrown away when the response ends.
 */
export async function signQuestImageUrl(path: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .storage.from(QUEST_IMAGE_BUCKET)
    .createSignedUrl(path, QUEST_IMAGE_SIGNED_TTL_SECONDS);

  if (error !== null || data?.signedUrl == null) {
    console.error("[storage] could not sign quest image", error);
    return null;
  }

  return data.signedUrl;
}
