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

export type HypotheticalValue = {
  origin: string;
  value: number;
};

export function questionHasHypotheticalFraming(question: string): boolean {
  return HYPOTHETICAL.test(question);
}

/**
 * Narrow inspired-math repair: every relevant quantity is already
 * `given_in_problem` and written in the question, but the model forgot
 * an if/suppose/imagine prefix. This never changes an origin.
 */
export function canPrefixHypotheticalFraming(
  question: string,
  challengeMode: string,
  values: readonly HypotheticalValue[],
  maxQuestionLength: number,
): boolean {
  if (challengeMode !== "inspired_math") return false;
  if (values.length === 0) return false;
  if (values.some((value) => value.origin !== "given_in_problem")) {
    return false;
  }
  if (questionHasHypotheticalFraming(question)) return false;
  if (!values.every((value) => questionStatesNumber(question, value.value))) {
    return false;
  }

  const repaired = prefixHypotheticalFraming(question);
  return repaired.length > question.trim().length && repaired.length <= maxQuestionLength;
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
