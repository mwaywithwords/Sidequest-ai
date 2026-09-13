import {
  type ImageSafetyAnalysis,
  type ImageSafetyReason,
  ImageSafetyAnalysisSchema,
} from "@/lib/ai/schemas";
import { copy } from "@/lib/copy";

/**
 * Turns a reason into the validated analysis the application consumes.
 *
 * Parsed rather than asserted: the schema decides what a safety result is,
 * including the invariant that `allowed` and `appropriate` agree. The student's
 * sentence is attached here rather than asked of a model, because the wording
 * is a product decision and generic phrasing is what keeps the category behind
 * a refusal private.
 */
export function imageSafetyVerdict(
  reason: ImageSafetyReason,
): ImageSafetyAnalysis {
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
    default:
      return copy.safety.unsuitable;
  }
}
