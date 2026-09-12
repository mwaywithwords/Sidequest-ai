import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { openai } from "@/lib/ai/openai";
import type { ImageSafetyReason } from "@/lib/ai/schemas";

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
 * The verdict vocabulary, kept separate from `ImageSafetyReason` because this
 * is wire format: what one model is asked to choose between. Mapping to our
 * reasons happens below, so the two can drift apart without the application
 * noticing.
 */
const SUITABILITY_VERDICTS = [
  "usable",
  "person_focused",
  "weapon",
  "drug_content",
  "personal_information",
  "unusable_image",
  "other",
] as const;

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
 * Written to be read by the model, not by a student: it names buckets and
 * product rules, and explicitly leaves the wording of any refusal to us.
 *
 * Alcohol, tobacco and vapes sit under `drug_content` because the product
 * treats them the same way — none of them is something a nine-year-old should
 * be handed a maths problem about — and one reason means one clear message.
 */
const INSTRUCTIONS = `You screen photographs for SIDEQUEST, a maths app used by children in grades 3 to 5. A student photographs an everyday object and the app builds a maths challenge from what it can see on that object.

Decide whether this photograph is usable for that, and answer with one verdict:

- "usable": an everyday object is the subject, and it is clear enough that printed text, countable parts, or shapes could be read from it.
- "unusable_image": severely blurred, very dark or blown out, effectively blank (a bare wall, sky, or empty surface), or so close and featureless that no object can be identified.
- "person_focused": a person, face, or group is the subject. A hand holding or pointing at an object is fine and stays "usable".
- "weapon": a firearm, ammunition, or a knife or blade presented as a weapon is the subject. Ordinary kitchen and craft tools in ordinary use are fine.
- "drug_content": drugs or drug paraphernalia, or alcohol, tobacco, or vaping products.
- "personal_information": identity documents, bank cards, addressed mail, school or medical paperwork, or a screen showing someone's private messages or account details.
- "other": anything else that would be unsuitable in a maths activity for a nine-year-old.

Choose the first of those that applies. Prefer "usable" only when you can actually see a usable object; when you cannot tell what you are looking at, say so with a low confidence.

Set confidence to how sure you are of the verdict. Keep "note" to one short factual clause for an engineer's log — it is never shown to anyone, so do not address the student and do not suggest what they should do next.`;

/**
 * Returns why a photograph is unusable for SIDEQUEST, or 'appropriate'.
 *
 * Throws when the call fails, is refused, or answers with something that does
 * not match the schema. The gate treats that as a reason to stop, because an
 * unanswered question about a photo is not the same as a clean answer.
 */
export async function checkImageSuitability(
  image: string,
): Promise<ImageSafetyReason> {
  const response = await openai().responses.parse({
    model: SUITABILITY_MODEL,
    instructions: INSTRUCTIONS,
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
    // The schema is enforced twice over: it becomes the strict JSON schema the
    // model must fill in, and it validates what comes back.
    text: { format: zodTextFormat(SuitabilityVerdictSchema, "suitability") },
  });

  const parsed = response.output_parsed;
  if (!parsed) {
    throw new Error("Suitability check returned no parsed verdict");
  }

  // Low confidence in a 'usable' verdict means the model could not really tell
  // what it was looking at, which is the same outcome as a photo too poor to
  // read: ask for a better one rather than build a challenge on a guess.
  const verdict =
    parsed.verdict === "usable" && parsed.confidence === "low"
      ? "unusable_image"
      : parsed.verdict;

  if (verdict !== "usable") {
    console.warn("[suitability] refused image", {
      verdict,
      confidence: parsed.confidence,
      note: parsed.note,
    });
  }

  return verdict === "usable" ? "appropriate" : verdict;
}
