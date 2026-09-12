import "server-only";

import type { Moderation } from "openai/resources/moderations";
import { openai } from "@/lib/ai/openai";
import type { ImageSafetyReason } from "@/lib/ai/schemas";

/**
 * Harmful-content screening, delegated to OpenAI's moderation model.
 *
 * This half of the gate answers one question: does the photograph contain
 * content that is harmful by OpenAI's published taxonomy. It knows nothing
 * about SIDEQUEST — whether the photo shows a usable object, whether it is in
 * focus, whether a maths challenge could come out of it — which is why product
 * suitability is a separate check in lib/ai/image-suitability.ts.
 *
 * Its output is normalised to an `ImageSafetyReason` here so the category names
 * and scores never leave this module. They are logged, never returned.
 */

/** The multimodal moderation model. Text-only snapshots cannot see an image at all. */
const MODERATION_MODEL = "omni-moderation-latest";

type CategoryRule = {
  category: keyof Moderation.Categories;
  reason: ImageSafetyReason;
  /**
   * The score at or above which SIDEQUEST refuses, whether or not OpenAI
   * flagged the category itself.
   *
   * Every value here is well below the model's own flag threshold, which is
   * tuned for a general audience. This audience is nine-year-olds, so the gate
   * is deliberately jumpier than the default: refusing a harmless photo costs
   * one retake, and the other kind of mistake is not recoverable.
   */
  score: number;
};

/**
 * Categories in refusal order — the first match is the reason reported, so the
 * list runs from the most serious downwards.
 *
 * The mapping collapses thirteen categories into four of our reasons because
 * the student's next step is the same across each group, and because our
 * reasons exist to drive copy rather than to describe the content. Self-harm
 * lands under `graphic_content` for that reason: distressing imagery, one
 * message.
 *
 * Weapons and drug imagery are missing on purpose. The taxonomy has no
 * category for either as a *depiction* — `illicit` is about instructions for
 * wrongdoing — so those are product rules, decided by the suitability check.
 */
const CATEGORY_RULES: readonly CategoryRule[] = [
  { category: "sexual/minors", reason: "adult_content", score: 0.05 },
  { category: "sexual", reason: "adult_content", score: 0.15 },
  { category: "violence/graphic", reason: "graphic_content", score: 0.15 },
  { category: "self-harm", reason: "graphic_content", score: 0.15 },
  { category: "self-harm/intent", reason: "graphic_content", score: 0.15 },
  { category: "self-harm/instructions", reason: "graphic_content", score: 0.15 },
  { category: "violence", reason: "graphic_content", score: 0.3 },
  { category: "illicit/violent", reason: "other", score: 0.3 },
  { category: "illicit", reason: "other", score: 0.4 },
  { category: "hate/threatening", reason: "other", score: 0.3 },
  { category: "hate", reason: "other", score: 0.3 },
  { category: "harassment/threatening", reason: "other", score: 0.3 },
  { category: "harassment", reason: "other", score: 0.4 },
];

/**
 * Screens an image and returns why it was refused, or 'appropriate'.
 *
 * `image` is a data URL rather than a link, because at this point in the flow
 * the photograph has not been stored anywhere: a refused image should leave no
 * bytes behind, and nothing that could be fetched.
 *
 * Throws if the call fails or answers with nothing usable. Callers must let
 * that stop the pipeline — an unscreened photo is not a safe photo.
 */
export async function moderateImage(image: string): Promise<ImageSafetyReason> {
  const response = await openai().moderations.create({
    model: MODERATION_MODEL,
    input: [{ type: "image_url", image_url: { url: image } }],
  });

  const result = response.results[0];
  if (!result) {
    throw new Error("Moderation returned no result");
  }

  const matched = CATEGORY_RULES.find((rule) => breaches(result, rule));

  if (matched) {
    // The one place category names and scores are allowed to appear, and they
    // appear in a server log rather than in a response.
    console.warn("[moderation] refused image", {
      category: matched.category,
      score: result.category_scores[matched.category],
      flagged: result.categories[matched.category],
    });

    return matched.reason;
  }

  // A backstop for a category added to the taxonomy after this table was
  // written: if the model flagged something we have no rule for, the photo is
  // still refused rather than quietly allowed.
  if (result.flagged) {
    console.warn("[moderation] refused image flagged outside the rule table", {
      categories: result.categories,
    });

    return "other";
  }

  return "appropriate";
}

function breaches(result: Moderation, rule: CategoryRule): boolean {
  if (result.categories[rule.category] === true) return true;

  // Null for a category the model does not apply to images. Absent scores are
  // not evidence of anything, so they simply do not match.
  const score = result.category_scores[rule.category];

  return typeof score === "number" && score >= rule.score;
}
