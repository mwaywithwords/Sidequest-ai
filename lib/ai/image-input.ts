import "server-only";

/**
 * How a photograph is handed to a model.
 *
 * Inline base64, never a link. The bucket is private and stays private: a
 * signed URL would be a temporary hole in that for anything holding the link,
 * and the safety gate runs before the photo is stored at all, so at that point
 * there is nothing to sign. The bytes exist for the length of one request and
 * are never logged and never written to Postgres.
 */

/**
 * What the browser always sends, and what preparation in lib/image-prepare.ts
 * re-encodes to. Used only if a download arrives without a content type.
 */
const FALLBACK_TYPE = "image/jpeg";

export async function imageDataUrl(image: Blob): Promise<string> {
  const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");

  return `data:${image.type || FALLBACK_TYPE};base64,${base64}`;
}
