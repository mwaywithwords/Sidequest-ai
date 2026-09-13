import type { ImageSafetyReason } from "@/lib/ai/schemas";

/**
 * Product rules for the suitability screen, kept out of the model call so
 * they can be tested without a network.
 *
 * The vision model still makes the first call. These rules exist because
 * that model has already shown it will file ordinary objects under a
 * prohibited bucket — a protein shake under `drug_content` for a Nutrition
 * Facts panel, a wallet under the same bucket as "paraphernalia".
 *
 * A prohibited verdict is therefore not taken at face value. The model's
 * own note must assert visible evidence of that category. Speculative
 * association — shape, packaging style, resemblance, possible use — is
 * not evidence. Uncertain notes prefer the ordinary-object reading.
 *
 * The guard cannot invent a refusal the note does not support, and it
 * cannot turn a real refusal into a pass when the note names drugs,
 * paraphernalia, alcohol, tobacco, vapes, or a firearm as present. A
 * call that throws still fails closed upstream.
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
 * Shared classification rule: refuse prohibited categories on visible
 * evidence, not on what an ordinary object could theoretically be.
 *
 * Interpolated into the suitability instructions so the prompt and the
 * code-side guard cannot drift apart.
 */
export const EVIDENCE_RULE = `Refuse "weapon", "drug_content", "personal_information", or "other" only on positive visual evidence of that category. Do not infer prohibited content from object shape, packaging style, vague resemblance, possible use, or speculation.

An ordinary everyday object is "usable" even if it could theoretically be associated with drugs, alcohol, weapons, or another prohibited category. If you are uncertain between an ordinary object and a prohibited category, choose the ordinary-object interpretation unless prohibited content is actually visible.

A wallet, purse, backpack, shoe, ball, bottle, can, keys, spoon, cup, book, toy, household container, food or nutrition packaging, or piece of sports equipment is "usable" unless something prohibited is visibly present. A wallet by itself is "usable"; a wallet containing clearly visible drug paraphernalia is "drug_content". An ordinary bottle is "usable"; a clearly identifiable alcohol bottle is "drug_content". Protein, vitamin, and nutrition packaging is "usable" unless prohibited content is visible.`;

/**
 * The drug_content rule as the model is asked to apply it.
 *
 * Interpolated into the suitability instructions so the prompt and the
 * code-side guard cannot drift apart.
 */
export const DRUG_CONTENT_RULE = `"drug_content": clearly drug-focused imagery that is unsuitable for a child-focused educational experience. Use this only when illegal or recreational drugs, visible drug use, or drug paraphernalia (pipes, bongs, syringes presented as drug equipment) are actually visible. Alcohol, tobacco, and vaping products also belong here when they are clearly identifiable.

Do not use "drug_content" for ordinary child-safe food, beverage, nutrition, fitness, or household products. Protein shakes, protein powder, sports drinks, soda and other grocery drinks, nutrition labels, vitamin containers, ordinary dietary supplements, and household products with measurement or ingredient labels are "usable".

Do not classify an object as "drug_content" merely because it has a Nutrition Facts panel; lists milligrams, grams, ounces, percentages, ingredients, or serving sizes; makes health or nutrition claims; resembles packaging used for medicine or supplements; or because the text mentions health, protein, energy, vitamins, minerals, or nutrition.

Do not classify a wallet, bag, bottle, container, or other ordinary object as "drug_content" because it could hide, store, resemble, or theoretically be associated with drugs.

Prescription or pharmacy medication is "other", not "drug_content". Do not infer that an unlabeled or ambiguous container is a drug from its packaging shape alone.`;

export const WEAPON_RULE = `"weapon": a firearm, ammunition, or a knife or blade presented as a weapon is visibly the subject. Ordinary kitchen knives, scissors, craft tools, and sports equipment are "usable". Do not infer a weapon from object shape, possible use, or resemblance.`;

export const SUITABILITY_INSTRUCTIONS = `You screen photographs for SIDEQUEST, a maths app used by children in grades 3 to 5. A student photographs an everyday object and the app builds a maths challenge from what it can see on that object.

${EVIDENCE_RULE}

Decide whether this photograph is usable for that, and answer with one verdict:

- "usable": an everyday object is the subject, and it is clear enough that printed text, countable parts, or shapes could be read from it. Ordinary grocery, nutrition, fitness, household, school, and sports objects are usable.
- "unusable_image": severely blurred, very dark or blown out, effectively blank (a bare wall, sky, or empty surface), or so close and featureless that no object can be identified.
- "person_focused": a person, face, or group is the subject. A hand holding or pointing at an object is fine and stays "usable".
- ${WEAPON_RULE}
- ${DRUG_CONTENT_RULE}
- "personal_information": identity documents, bank cards, addressed mail, school or medical paperwork, or a screen showing someone's private messages or account details.
- "other": anything else that would be unsuitable in a maths activity for a nine-year-old, including prescription or pharmacy medication.

Choose the first of those that applies. Prefer "usable" when you can see an everyday object and you do not have positive visual evidence of a prohibited category. When you cannot tell what you are looking at, say so with a low confidence.

Set confidence to how sure you are of the verdict. Keep "note" to one short factual clause for an engineer's log — it is never shown to anyone, so do not address the student and do not suggest what they should do next. Name the object you can see. Describe prohibited content only when it is actually visible; do not speculate about what the object could be used for.`;

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
  "recreational drugs",
  "illegal drug",
  "illegal drugs",
  "illicit drug",
  "illicit drugs",
  "drugs",
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

/**
 * Phrases that share a token with the drug list but name an ordinary
 * grocery or alcohol-free product. Stripped before evidence is judged.
 */
const DRUG_FALSE_FRIENDS = [
  "root beer",
  "non-alcoholic",
  "alcohol-free",
  "alcohol free",
] as const;

const WEAPON_FOCUSED_PHRASES = [
  "firearm",
  "handgun",
  "pistol",
  "rifle",
  "shotgun",
  "revolver",
  "ammunition",
  "ammo",
  "assault rifle",
  "machine gun",
] as const;

/**
 * Bare "gun" is evidence of a firearm unless the note is naming a
 * workshop tool. Those tools share the token and are not weapons.
 */
const TOOL_GUN_PHRASES = [
  "glue gun",
  "staple gun",
  "nail gun",
  "heat gun",
  "spray gun",
  "caulk gun",
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

const PRESCRIPTION_PHRASES = [
  "prescription",
  "pharmacy label",
  "rx bottle",
  "rx label",
] as const;

/**
 * Hedges that turn a prohibited phrase into speculation rather than
 * an assertion that the thing is visible.
 */
const SPECULATIVE_MARKERS =
  /\b(could(n't)?|possibly|possible|might be|maybe|resembl(?:e|es|ing)|similar to|associated with|theoretically|perhaps|potentially|potential|suspected|supposedly|may be)\b/i;

const NEGATION_MARKERS = /\b(no|not|without|isn't|is not)\b/i;

/**
 * Maps a parsed suitability judgement onto an `ImageSafetyReason`.
 *
 * Low-confidence "usable" still becomes `unusable_image`. A prohibited
 * content verdict is kept only when the note asserts that category as
 * visible. Ordinary objects and speculative associations cannot stay
 * in those buckets.
 */
export function resolveSuitability(
  judgement: SuitabilityJudgement,
): ImageSafetyReason {
  const verdict = applyCategoryGuards(judgement);

  if (verdict === "usable" && judgement.confidence === "low") {
    return "unusable_image";
  }

  return verdict === "usable" ? "appropriate" : verdict;
}

/**
 * Whether a log note asserts imagery that really belongs in drug_content.
 *
 * Speculative association is not enough. Nutrition words, serving sizes,
 * supplement packaging, and ordinary containers are not enough.
 */
export function isDrugFocusedDescription(note: string): boolean {
  const evidence = stripFalseFriends(note, DRUG_FALSE_FRIENDS);

  return hasAssertedPhrase(evidence, DRUG_FOCUSED_PHRASES);
}

export function isWeaponFocusedDescription(note: string): boolean {
  if (hasAssertedPhrase(note, WEAPON_FOCUSED_PHRASES)) {
    return true;
  }

  return (
    hasAssertedPhrase(note, ["gun"]) && !hasPhrase(note, TOOL_GUN_PHRASES)
  );
}

export function isOrdinaryConsumerProduct(note: string): boolean {
  return hasPhrase(note, ORDINARY_PRODUCT_PHRASES);
}

function applyCategoryGuards(
  judgement: SuitabilityJudgement,
): SuitabilityVerdict {
  if (isDrugFocusedDescription(judgement.note)) {
    return "drug_content";
  }

  if (isWeaponFocusedDescription(judgement.note)) {
    return "weapon";
  }

  if (judgement.verdict === "drug_content") {
    if (hasPhrase(judgement.note, PRESCRIPTION_PHRASES)) {
      return "other";
    }

    return "usable";
  }

  if (judgement.verdict === "weapon") {
    return "usable";
  }

  return judgement.verdict;
}

function stripFalseFriends(
  text: string,
  phrases: readonly string[],
): string {
  return phrases.reduce(
    (next, phrase) => next.replace(phrasePattern(phrase), " "),
    text,
  );
}

/**
 * A listed phrase counts only when the note presents it as visible, not
 * as something the object could be, resemble, or be used for.
 */
function hasAssertedPhrase(
  text: string,
  phrases: readonly string[],
): boolean {
  const hay = text.toLowerCase();

  return phrases.some((phrase) => {
    const pattern = phrasePattern(phrase);

    for (const match of hay.matchAll(pattern)) {
      const before = precedingWords(hay, match.index ?? 0, 5);

      if (
        !SPECULATIVE_MARKERS.test(before) &&
        !NEGATION_MARKERS.test(before)
      ) {
        return true;
      }
    }

    return false;
  });
}

function precedingWords(text: string, index: number, count: number): string {
  return text.slice(0, index).trim().split(/\s+/).slice(-count).join(" ");
}

function hasPhrase(text: string, phrases: readonly string[]): boolean {
  const hay = text.toLowerCase();

  return phrases.some((phrase) => phrasePattern(phrase).test(hay));
}

function phrasePattern(phrase: string): RegExp {
  const escaped = phrase
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");

  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "gi");
}
