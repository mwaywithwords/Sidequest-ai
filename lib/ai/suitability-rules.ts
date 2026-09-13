import type { ImageSafetyReason } from "@/lib/ai/schemas";

/**
 * Product rules for the suitability screen, kept out of the model call so
 * they can be tested without a network.
 *
 * The vision model still makes the first call. These rules exist because that
 * model has already shown it will file a protein shake under `drug_content`
 * the moment it sees a Nutrition Facts panel. The correction can only move a
 * `drug_content` verdict off that bucket when the model's own note describes
 * an ordinary product or an unmarked container. It cannot turn a real
 * refusal into a pass when the note names drugs, paraphernalia, alcohol,
 * tobacco, or vapes — and a call that throws still fails closed upstream.
 */

export const SUITABILITY_VERDICTS = [
  "usable",
  "person_focused",
  "weapon",
  "drug_content",
  "personal_information",
  "unusable_image",
  "other",
] as const;

export type SuitabilityVerdict = (typeof SUITABILITY_VERDICTS)[number];

export type SuitabilityJudgement = {
  verdict: SuitabilityVerdict;
  confidence: "high" | "medium" | "low";
  note: string;
};

/**
 * The drug_content rule as the model is asked to apply it.
 *
 * Interpolated into the suitability instructions so the prompt and the
 * code-side guard cannot drift apart.
 */
export const DRUG_CONTENT_RULE = `"drug_content": clearly drug-focused imagery that is unsuitable for a child-focused educational experience. Reserve this for illegal or recreational drugs, visible drug use, or drug paraphernalia (pipes, bongs, syringes presented as drug equipment). Alcohol, tobacco, and vaping products also belong here.

Do not use "drug_content" for ordinary child-safe food, beverage, nutrition, fitness, or household products. Protein shakes, protein powder, sports drinks, soda and other grocery drinks, nutrition labels, vitamin containers, ordinary dietary supplements, and household products with measurement or ingredient labels are "usable".

Do not classify an object as "drug_content" merely because it has a Nutrition Facts panel; lists milligrams, grams, ounces, percentages, ingredients, or serving sizes; makes health or nutrition claims; resembles packaging used for medicine or supplements; or because the text mentions health, protein, energy, vitamins, minerals, or nutrition.

Prescription or pharmacy medication is "other", not "drug_content". Do not infer that an unlabeled or ambiguous container is a drug from its packaging shape alone.`;

export const SUITABILITY_INSTRUCTIONS = `You screen photographs for SIDEQUEST, a maths app used by children in grades 3 to 5. A student photographs an everyday object and the app builds a maths challenge from what it can see on that object.

Decide whether this photograph is usable for that, and answer with one verdict:

- "usable": an everyday object is the subject, and it is clear enough that printed text, countable parts, or shapes could be read from it. Ordinary grocery, nutrition, fitness, and household products are usable.
- "unusable_image": severely blurred, very dark or blown out, effectively blank (a bare wall, sky, or empty surface), or so close and featureless that no object can be identified.
- "person_focused": a person, face, or group is the subject. A hand holding or pointing at an object is fine and stays "usable".
- "weapon": a firearm, ammunition, or a knife or blade presented as a weapon is the subject. Ordinary kitchen and craft tools in ordinary use are fine.
- ${DRUG_CONTENT_RULE}
- "personal_information": identity documents, bank cards, addressed mail, school or medical paperwork, or a screen showing someone's private messages or account details.
- "other": anything else that would be unsuitable in a maths activity for a nine-year-old, including prescription or pharmacy medication.

Choose the first of those that applies. Prefer "usable" only when you can actually see a usable object; when you cannot tell what you are looking at, say so with a low confidence.

Set confidence to how sure you are of the verdict. Keep "note" to one short factual clause for an engineer's log — it is never shown to anyone, so do not address the student and do not suggest what they should do next. Name the object you can see; do not diagnose it as a drug unless drug evidence is actually visible.`;

const DRUG_FOCUSED_PHRASES = [
  "marijuana",
  "cannabis",
  "weed",
  "cocaine",
  "heroin",
  "methamphetamine",
  "meth",
  "fentanyl",
  "ecstasy",
  "mdma",
  "lsd",
  "ketamine",
  "crack cocaine",
  "recreational drug",
  "illegal drug",
  "illicit drug",
  "drug use",
  "drug paraphernalia",
  "paraphernalia",
  "bong",
  "crack pipe",
  "meth pipe",
  "rolling papers",
  "cannabis grinder",
  "alcohol",
  "alcoholic",
  "beer",
  "wine",
  "liquor",
  "vodka",
  "whiskey",
  "whisky",
  "cigarette",
  "cigar",
  "tobacco",
  "vape",
  "vaping",
  "e-cigarette",
  "e-cig",
] as const;

const ORDINARY_PRODUCT_PHRASES = [
  "premier protein",
  "protein shake",
  "protein powder",
  "protein drink",
  "protein bottle",
  "sports drink",
  "gatorade",
  "soda",
  "soft drink",
  "cola",
  "nutrition facts",
  "nutrition label",
  "nutrition labeling",
  "nutrition panel",
  "vitamin",
  "multivitamin",
  "dietary supplement",
  "supplement bottle",
  "supplement packaging",
  "grocery",
  "beverage",
  "household",
  "detergent",
  "food container",
  "drink bottle",
] as const;

const AMBIGUOUS_CONTAINER_PHRASES = [
  "unlabeled",
  "unlabelled",
  "no markings",
  "no visible text",
  "no label",
  "unmarked bottle",
  "unmarked container",
  "ambiguous container",
  "plain bottle",
  "plain container",
] as const;

const PRESCRIPTION_PHRASES = [
  "prescription",
  "pharmacy label",
  "rx bottle",
  "rx label",
] as const;

/**
 * Maps a parsed suitability judgement onto an `ImageSafetyReason`.
 *
 * Low-confidence "usable" still becomes `unusable_image`. A `drug_content`
 * verdict is kept only when the note describes actual drug-focused imagery,
 * or when nothing in the note lets us contradict the model. Ordinary
 * nutrition and grocery products cannot stay in that bucket.
 */
export function resolveSuitability(
  judgement: SuitabilityJudgement,
): ImageSafetyReason {
  const verdict = applyDrugContentGuard(judgement);

  if (verdict === "usable" && judgement.confidence === "low") {
    return "unusable_image";
  }

  return verdict === "usable" ? "appropriate" : verdict;
}

/**
 * Whether a log note describes imagery that really belongs in drug_content.
 *
 * Used by the regression checks and by the guard. Nutrition words, serving
 * sizes, and supplement packaging are not enough.
 */
export function isDrugFocusedDescription(note: string): boolean {
  return hasPhrase(note, DRUG_FOCUSED_PHRASES);
}

export function isOrdinaryConsumerProduct(note: string): boolean {
  return hasPhrase(note, ORDINARY_PRODUCT_PHRASES);
}

function applyDrugContentGuard(
  judgement: SuitabilityJudgement,
): SuitabilityVerdict {
  if (isDrugFocusedDescription(judgement.note)) {
    return "drug_content";
  }

  if (judgement.verdict !== "drug_content") {
    return judgement.verdict;
  }

  if (hasPhrase(judgement.note, PRESCRIPTION_PHRASES)) {
    return "other";
  }

  if (
    isOrdinaryConsumerProduct(judgement.note) ||
    hasPhrase(judgement.note, AMBIGUOUS_CONTAINER_PHRASES)
  ) {
    return "usable";
  }

  return "drug_content";
}

function hasPhrase(text: string, phrases: readonly string[]): boolean {
  const hay = text.toLowerCase();

  return phrases.some((phrase) => {
    const escaped = phrase
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");

    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(hay);
  });
}
