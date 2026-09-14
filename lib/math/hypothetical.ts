/**
 * Hypothetical given-in-problem values.
 *
 * Inspired-math numbers are expected to be imagined. This module only
 * checks that the question frames them as hypothetical and actually
 * states them. It does not require those values to appear in the photo.
 */

const HYPOTHETICAL =
  /\b(if|suppose|imagine|what if|let'?s say)\b/i;

const NUMBER_WORDS: Readonly<Record<number, readonly string[]>> = {
  1: ["one"],
  2: ["two"],
  3: ["three"],
  4: ["four"],
  5: ["five"],
  6: ["six"],
  7: ["seven"],
  8: ["eight"],
  9: ["nine"],
  10: ["ten"],
  11: ["eleven"],
  12: ["twelve"],
  13: ["thirteen"],
  14: ["fourteen"],
  15: ["fifteen"],
  16: ["sixteen"],
  17: ["seventeen"],
  18: ["eighteen"],
  19: ["nineteen"],
  20: ["twenty"],
  30: ["thirty"],
  40: ["forty"],
  50: ["fifty"],
  60: ["sixty"],
  70: ["seventy"],
  80: ["eighty"],
  90: ["ninety"],
  100: ["hundred", "one hundred", "a hundred"],
  1000: ["thousand", "one thousand", "a thousand"],
};

export const HYPOTHETICAL_PREFIX = "Suppose";

const SOURCE_ORIGINS = new Set([
  "observed",
  "student_provided",
  "contextual",
  "given_in_problem",
]);

export type HypotheticalValue = {
  origin: string;
  value: number;
};

export type FramingRepairOutcome =
  | "hypothetical_prefix"
  | "repair_not_applicable"
  | "not_considered";

export type FramingRepairResult = {
  question: string;
  applied: boolean;
  considered: boolean;
  outcome: FramingRepairOutcome;
};

export function questionHasHypotheticalFraming(question: string): boolean {
  return HYPOTHETICAL.test(question);
}

export function givenInProblemValues(
  values: readonly HypotheticalValue[],
): HypotheticalValue[] {
  return values.filter((value) => value.origin === "given_in_problem");
}

/**
 * Narrow inspired-math repair: every quantity that needs hypothetical
 * framing is already `given_in_problem` and written in the question,
 * but the model forgot an if/suppose/imagine prefix.
 *
 * Callers must pass the challenge's source values, not derived extras.
 * This never changes an origin, unit, or computation.
 */
export function canPrefixHypotheticalFraming(
  question: string,
  challengeMode: string,
  values: readonly HypotheticalValue[],
  maxQuestionLength: number,
): boolean {
  if (challengeMode !== "inspired_math") return false;

  const given = givenInProblemValues(values);
  if (given.length === 0) return false;

  const sources = values.filter((value) => SOURCE_ORIGINS.has(value.origin));
  const allSourcesGiven =
    sources.length > 0 &&
    sources.every((value) => value.origin === "given_in_problem");
  const framingQuantitiesGiven = given.length > 0;
  if (!allSourcesGiven && !framingQuantitiesGiven) return false;

  if (questionHasHypotheticalFraming(question)) return false;
  if (!given.every((value) => questionStatesNumber(question, value.value))) {
    return false;
  }

  const repaired = prefixHypotheticalFraming(question);
  return (
    repaired.length > question.trim().length &&
    repaired.length <= maxQuestionLength
  );
}

/**
 * Returns a new question string. The caller must pass that string into
 * grounding — do not keep using the unrepaired original.
 */
export function applyHypotheticalFramingRepair(input: {
  question: string;
  challengeMode: string;
  values: readonly HypotheticalValue[];
  maxQuestionLength: number;
  objectRelevant: boolean;
}): FramingRepairResult {
  const given = givenInProblemValues(input.values);
  const considered =
    input.challengeMode === "inspired_math" && given.length > 0;

  if (!considered) {
    return {
      question: input.question,
      applied: false,
      considered: false,
      outcome: "not_considered",
    };
  }

  if (
    !input.objectRelevant ||
    !canPrefixHypotheticalFraming(
      input.question,
      input.challengeMode,
      input.values,
      input.maxQuestionLength,
    )
  ) {
    return {
      question: input.question,
      applied: false,
      considered: true,
      outcome: "repair_not_applicable",
    };
  }

  return {
    question: prefixHypotheticalFraming(input.question),
    applied: true,
    considered: true,
    outcome: "hypothetical_prefix",
  };
}

export function prefixHypotheticalFraming(question: string): string {
  const trimmed = question.trim();
  if (trimmed.length === 0) return trimmed;
  if (questionHasHypotheticalFraming(trimmed)) return trimmed;

  const first = trimmed.charAt(0);
  const rest = trimmed.slice(1);
  return `${HYPOTHETICAL_PREFIX} ${first.toLowerCase()}${rest}`;
}

export function sentenceIsHypothetical(sentence: string): boolean {
  return HYPOTHETICAL.test(sentence);
}

/**
 * Whether the question states this number, including grouped digits
 * (`1,000`) and common word forms (`five-dollar`).
 */
export function questionStatesNumber(question: string, value: number): boolean {
  const text = question.toLowerCase();

  for (const form of digitForms(value)) {
    if (digitsAppear(question, form)) return true;
  }

  const words = NUMBER_WORDS[value];
  if (words === undefined) return false;

  return words.some((word) =>
    new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(text),
  );
}

function digitForms(value: number): string[] {
  const raw = Number.isInteger(value) ? String(Math.abs(value)) : String(value);
  const grouped = raw.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return grouped === raw ? [raw] : [raw, grouped];
}

function digitsAppear(text: string, digits: string): boolean {
  return new RegExp(
    `(^|[^0-9])${escapeRegExp(digits)}(?!\\.?\\d)`,
  ).test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
