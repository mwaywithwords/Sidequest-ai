import type { CorrectAnswer } from "@/lib/ai/schemas";
import { simplifyFraction } from "@/lib/math/evaluate";
import { isFiniteNumber, sameUnit } from "@/lib/math/units";

/**
 * Deterministic student-answer grading.
 *
 * The stored `correct_answer` is the only key. Nothing here calls a model,
 * and nothing fuzzy-matches free text.
 */

export type NumberSubmission = {
  kind: "number";
  value: string;
};

export type FractionSubmission = {
  kind: "fraction";
  numerator: string;
  denominator: string;
};

export type AnswerSubmission = NumberSubmission | FractionSubmission;

export type ParsedStudentAnswer =
  | { ok: true; answer: CorrectAnswer; display: string }
  | { ok: false; reason: "blank" | "malformed" | "zero_denominator" };

const NUMBER_PATTERN =
  /^([+-]?(?:\d+\.?\d*|\.\d+))(?:\s+(.+))?$/;

/**
 * Tight relative epsilon used only when a side is not an integer.
 * Integers compare exactly, so `7` and `7.0` (which is the integer 7)
 * still match without a tolerance.
 */
export const DECIMAL_TOLERANCE = 1e-9;

export function parseStudentSubmission(
  submission: AnswerSubmission,
): ParsedStudentAnswer {
  if (submission.kind === "number") {
    return parseNumberSubmission(submission.value);
  }

  return parseFractionSubmission(submission.numerator, submission.denominator);
}

export function parseNumberSubmission(raw: string): ParsedStudentAnswer {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: "blank" };

  const match = NUMBER_PATTERN.exec(trimmed);
  if (match === null || match[1] === undefined) {
    return { ok: false, reason: "malformed" };
  }

  const value = Number(match[1]);
  if (!isFiniteNumber(value)) return { ok: false, reason: "malformed" };

  const unitText = match[2]?.trim();
  const answer: CorrectAnswer =
    unitText && unitText.length > 0
      ? { type: "number", value, unit: unitText }
      : { type: "number", value };

  return { ok: true, answer, display: formatStoredSubmission(answer) };
}

export function parseFractionSubmission(
  rawNumerator: string,
  rawDenominator: string,
): ParsedStudentAnswer {
  const numeratorText = rawNumerator.trim();
  const denominatorText = rawDenominator.trim();

  if (numeratorText.length === 0 || denominatorText.length === 0) {
    return { ok: false, reason: "blank" };
  }

  if (!/^[+-]?\d+$/.test(numeratorText) || !/^[+-]?\d+$/.test(denominatorText)) {
    return { ok: false, reason: "malformed" };
  }

  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText);

  if (!isFiniteNumber(numerator) || !isFiniteNumber(denominator)) {
    return { ok: false, reason: "malformed" };
  }

  if (denominator === 0) return { ok: false, reason: "zero_denominator" };

  const answer: CorrectAnswer = { type: "fraction", numerator, denominator };
  return { ok: true, answer, display: formatStoredSubmission(answer) };
}

/**
 * Compare a parsed student answer with the persisted verified answer.
 *
 * A typed unit is optional: the UI already names the unit, so a bare
 * number is judged on the value. If the student does type a unit, it
 * must be the same unit, not merely the same family.
 */
export function studentAnswerMatches(
  submitted: CorrectAnswer,
  expected: CorrectAnswer,
): boolean {
  if (submitted.type === "number" && expected.type === "number") {
    if (!numbersAgree(submitted.value, expected.value)) return false;
    if (submitted.unit === undefined) return true;
    return expected.unit !== undefined && sameUnit(submitted.unit, expected.unit);
  }

  if (submitted.type === "fraction" && expected.type === "fraction") {
    if (submitted.denominator === 0 || expected.denominator === 0) return false;
    const left = simplifyFraction(submitted.numerator, submitted.denominator);
    const right = simplifyFraction(expected.numerator, expected.denominator);
    if (
      left.numerator !== right.numerator ||
      left.denominator !== right.denominator
    ) {
      return false;
    }
    if (submitted.unit === undefined) return true;
    return expected.unit !== undefined && sameUnit(submitted.unit, expected.unit);
  }

  return false;
}

export function numbersAgree(left: number, right: number): boolean {
  if (!isFiniteNumber(left) || !isFiniteNumber(right)) return false;

  if (Number.isInteger(left) && Number.isInteger(right)) {
    return left === right;
  }

  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= DECIMAL_TOLERANCE * scale;
}

/** Student-facing figure shown only after a Sidequest is completed. */
export function formatRevealedAnswer(answer: CorrectAnswer): string {
  if (answer.type === "number") {
    const amount = Number.isInteger(answer.value)
      ? String(answer.value)
      : String(answer.value);
    const unit = answer.unit?.trim();
    return unit ? `${amount} ${unit}` : amount;
  }

  const reduced = simplifyFraction(answer.numerator, answer.denominator);
  const amount = `${reduced.numerator}/${reduced.denominator}`;
  const unit = answer.unit?.trim();
  return unit ? `${amount} ${unit}` : amount;
}

/** What we persist on attempts.submitted_answer — the student's own figure. */
export function formatStoredSubmission(answer: CorrectAnswer): string {
  if (answer.type === "number") {
    const amount = Number.isInteger(answer.value)
      ? String(answer.value)
      : String(answer.value);
    const unit = answer.unit?.trim();
    return unit ? `${amount} ${unit}` : amount;
  }

  return `${answer.numerator}/${answer.denominator}`;
}
