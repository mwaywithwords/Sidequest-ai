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

export function questionHasHypotheticalFraming(question: string): boolean {
  return HYPOTHETICAL.test(question);
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
