import "server-only";

import { imageDataUrl } from "@/lib/ai/image-input";
import { checkImageSuitability } from "@/lib/ai/image-suitability";
import { moderateImage } from "@/lib/ai/moderation";
import {
  type ImageSafetyAnalysis,
  ImageSafetyAnalysisSchema,
  type ImageSafetyReason,
} from "@/lib/ai/schemas";
import { copy } from "@/lib/copy";

/**
 * The gate every photograph passes before SIDEQUEST looks at it as teaching
 * material.
 *
 * Two questions, asked in order and kept apart: is this harmful (OpenAI's
 * moderation model), and is it any use to us (a small vision check of our own
 * product rules). Both normalise into one `ImageSafetyAnalysis`, which is the
 * only shape the rest of the application sees.
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
  if (harmful !== "appropriate") {
    return verdict(harmful);
  }

  return verdict(await checkImageSuitability(image));
}

/**
 * Turns a reason into the validated analysis the application consumes.
 *
 * Parsed rather than asserted: the schema decides what a safety result is,
 * including the invariant that `allowed` and `appropriate` agree. The student's
 * sentence is attached here rather than asked of a model, because the wording
 * is a product decision and generic phrasing is what keeps the category behind
 * a refusal private.
 */
function verdict(reason: ImageSafetyReason): ImageSafetyAnalysis {
  return ImageSafetyAnalysisSchema.parse({
    allowed: reason === "appropriate",
    reason,
    messageForStudent: studentMessage(reason),
  });
}

function studentMessage(reason: ImageSafetyReason): string {
  switch (reason) {
    case "appropriate":
      return copy.safety.allowed;
    case "person_focused":
      return copy.safety.person;
    case "unusable_image":
      return copy.safety.unusable;
    // Every content category shares one sentence. Which of them matched is not
    // a nine-year-old's business, and telling them would only describe what the
    // photo was taken of.
    default:
      return copy.safety.unsuitable;
  }
}
