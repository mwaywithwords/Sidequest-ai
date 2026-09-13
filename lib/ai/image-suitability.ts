import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { openai } from "@/lib/ai/openai";
import type { ImageSafetyReason } from "@/lib/ai/schemas";
import {
  resolveSuitability,
  SUITABILITY_INSTRUCTIONS,
  SUITABILITY_VERDICTS,
} from "@/lib/ai/suitability-rules";

/**
 * Product suitability, which is a different question from harmful content.
 *
 * Moderation decides whether a photograph is harmful. This decides whether it
 * is any use to SIDEQUEST: whether there is an everyday object in it at all,
 * whether it can be seen well enough to read a label or count a part, and
 * whether it breaks a product rule that no moderation taxonomy covers —
 * weapons, drug and vape imagery, someone's private paperwork, or a photo whose
 * subject is a person rather than a thing.
 *
 * Runs only on photographs moderation already passed, so it is never asked to
 * reason about harmful imagery. Its verdicts normalise into the same
 * `ImageSafetyReason` vocabulary, and its own words never reach the student.
 */

/**
 * A small multimodal model. The judgement here is coarse — a handful of
 * buckets, no measurement, no reading comprehension — and it runs on every
 * photograph before any teaching work happens, so it is worth being the
 * cheapest model that can see.
 */
const SUITABILITY_MODEL = "gpt-5.4-mini";

/**
 * Confidence is three buckets rather than a number on purpose: a model asked
 * for 0.87 will supply 0.87, and the extra precision is invented. Three levels
 * are enough for the only decision that depends on it — whether a 'usable'
 * verdict is trusted.
 */
const SuitabilityVerdictSchema = z.strictObject({
  verdict: z.enum(SUITABILITY_VERDICTS),
  confidence: z.enum(["high", "medium", "low"]),
  /** A line for the server log. Never shown to a student, never returned. */
  note: z.string(),
});

/**
 * Returns why a photograph is unusable for SIDEQUEST, or 'appropriate'.
 *
 * Throws when the call fails, is refused, or answers with something that does
 * not match the schema. The gate treats that as a reason to stop, because an
 * unanswered question about a photo is not the same as a clean answer.
 *
 * A parsed `drug_content` verdict is not taken at face value: ordinary
 * grocery and nutrition products have already been misfiled here, so the
 * note is checked against the product rules before the reason is returned.
 */
export async function checkImageSuitability(
  image: string,
): Promise<ImageSafetyReason> {
  const response = await openai().responses.parse({
    model: SUITABILITY_MODEL,
    instructions: SUITABILITY_INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: "Screen this photograph." },
          // 'auto' rather than 'low': the small print on a bank card or an
          // addressed envelope is exactly what this needs to notice, and a
          // 512px thumbnail loses it.
          { type: "input_image", image_url: image, detail: "auto" },
        ],
      },
    ],
    text: { format: zodTextFormat(SuitabilityVerdictSchema, "suitability") },
  });

  const parsed = response.output_parsed;
  if (!parsed) {
    throw new Error("Suitability check returned no parsed verdict");
  }

  const reason = resolveSuitability(parsed);

  if (reason !== "appropriate") {
    console.warn("[suitability] refused image", {
      verdict: parsed.verdict,
      reason,
      confidence: parsed.confidence,
      note: parsed.note,
    });
  }

  return reason;
}
