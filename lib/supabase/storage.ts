import "server-only";

/** Private bucket. Nothing inside is reachable without a signed URL. */
export const QUEST_IMAGE_BUCKET = "sidequest-images";

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
