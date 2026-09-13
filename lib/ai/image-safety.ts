import "server-only";

import { imageDataUrl } from "@/lib/ai/image-input";
import { imageSafetyVerdict } from "@/lib/ai/image-safety-verdict";
import { moderateImage } from "@/lib/ai/moderation";
import { type ImageSafetyAnalysis } from "@/lib/ai/schemas";

/**
 * The gate every photograph passes before SIDEQUEST looks at it as teaching
 * material.
 *
 * Harmful-content screening only. Product suitability now shares the
 * combined vision request with Object Analysis, after this gate has passed.
 * Both still normalise into one `ImageSafetyAnalysis`.
 *
 * Fail closed is the whole design. A refusal is a value; anything else going
 * wrong — a call that errors, a model that answers with nonsense — is a thrown
 * error. Neither path can return an allowed verdict, so there is no way for an
 * unscreened photograph to reach object analysis or challenge generation.
 */

/**
 * Formats OpenAI accepts as image input.
 *
 * Narrower than the upload allowlist, which includes HEIC because iPhones shoot
 * in it. In practice the browser has already re-encoded to JPEG before sending,
 * and a HEIC that somehow arrives is a photo we cannot screen — so it is
 * refused as unreadable rather than sent off to be rejected by the API.
 */
export const MODEL_READABLE_IMAGE_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/**
 * Screens a photograph and returns the verdict.
 *
 * Throws when screening could not be completed. Callers must treat that as a
 * stop, not as a pass.
 */
export async function screenImage(file: File): Promise<ImageSafetyAnalysis> {
  // Screening happens before the photo is stored, which is the point: a refused
  // image leaves no bytes in the bucket and no URL for anything to fetch.
  const image = await imageDataUrl(file);

  // Moderation runs first because it is the cheaper call and the graver
  // question. Harmful content is also the one thing that should not be handed
  // to a second model at all, so nothing else sees the photo until it passes.
  const harmful = await moderateImage(image);
  return imageSafetyVerdict(harmful);
}
