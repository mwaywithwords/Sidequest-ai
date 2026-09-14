import type { Computation, CorrectAnswer, UsedValue } from "@/lib/ai/schemas";
import { evaluateArithmeticSteps } from "@/lib/math/evaluate";
import type { Grade } from "@/lib/types";

/**
 * Conservative Grade 3–5 numeric guardrails.
 *
 * These are not a curriculum. They exist to reject challenges that are
 * obviously the wrong size for the grade: a 4-digit times 2-digit product
 * for a third grader, a negative remainder, a seventeenth as a unit
 * fraction, an area problem before the grade has met area.
 *
 * Chosen rules:
 *
 * All grades
 * - Results and operands must be finite.
 * - Negative results are rejected. SIDEQUEST problems are remaining
 *   amounts, counts, and measurements — a negative answer is a generation
 *   bug, not a grade-5 extension.
 *
 * Grade 3
 * - Whole numbers only. No decimals on operands or the result.
 * - Operand and result magnitudes at most 1,000.
 * - Multiplication product at most 100.
 * - Division dividend at most 100, divisor at most 10.
 * - Fraction denominators in {2, 3, 4, 6, 8}.
 * - No unit conversions.
 * - Geometry may be perimeter, not area.
 *
 * Grade 4
 * - Whole numbers only.
 * - Magnitudes at most 10,000.
 * - Division divisor at most 9 (one digit), except equal-grouping
 *   problems whose quotient is a whole number of at most 12.
 * - Fraction denominators at most 12.
 * - Conversions are allowed.
 * - Geometry may be perimeter or area.
 *
 * Grade 5
 * - Decimals to hundredths are allowed.
 * - Magnitudes at most 100,000.
 * - Division divisor at most 99, with the same equal-grouping exception.
 * - Fraction denominators at most 12.
 * - Conversions and both geometry operations are allowed.
 */

const GRADE_3_FRACTION_DENOMINATORS = new Set([2, 3, 4, 6, 8]);

export function gradeViolation(
  grade: Grade,
  computation: Computation,
  operands: readonly UsedValue[],
  answer: CorrectAnswer,
): string | null {
  const numbers = [
    ...operands.map((operand) => operand.value),
    ...extraComputationNumbers(computation),
    ...answerNumbers(answer),
  ];

  if (numbers.some((value) => !Number.isFinite(value))) {
    return "A grade check saw a non-finite number.";
  }

  if (answerIsNegative(answer) || numbers.some((value) => value < 0)) {
    return "Negative amounts are not used in SIDEQUEST challenges.";
  }

  if (grade === 3) {
    return grade3Violation(computation, numbers, answer);
  }

  if (grade === 4) {
    return grade4Violation(computation, numbers, answer);
  }

  return grade5Violation(computation, numbers, answer);
}

function grade3Violation(
  computation: Computation,
  numbers: readonly number[],
  answer: CorrectAnswer,
): string | null {
  if (numbers.some((value) => !Number.isInteger(value))) {
    return "Grade 3 challenges use whole numbers only.";
  }

  if (numbers.some((value) => Math.abs(value) > 1000)) {
    return "Grade 3 numbers must stay within 1,000.";
  }

  if (computation.type === "conversion") {
    return "Grade 3 does not use unit conversions.";
  }

  if (computation.type === "geometry" && computation.operation === "area") {
    return "Grade 3 geometry is perimeter, not area.";
  }

  if (computation.type === "arithmetic" && computation.operation === "multiply") {
    const product = computation.operands.reduce(
      (total, operand) => total * operand.value,
      1,
    );
    if (product > 100) {
      return "Grade 3 multiplication stays within 100.";
    }
  }

  if (computation.type === "multi_step_arithmetic") {
    for (const step of computation.steps) {
      if (step.operation !== "multiply") continue;
      const product = step.operands.reduce((total, operand) => {
        if (operand.kind !== "value") return total;
        return total * operand.value;
      }, 1);
      if (product > 100) {
        return "Grade 3 multiplication stays within 100.";
      }
    }
  }

  if (computation.type === "division") {
    if (computation.dividend.value > 100 || computation.divisor.value > 10) {
      return "Grade 3 division uses a dividend up to 100 and a divisor up to 10.";
    }
    if (
      computation.operation === "quotient" &&
      computation.dividend.value % computation.divisor.value !== 0
    ) {
      return "Grade 3 quotients must come out as a whole number.";
    }
  }

  return fractionDenominatorViolation(computation, answer, (denominator) =>
    GRADE_3_FRACTION_DENOMINATORS.has(denominator)
      ? null
      : "Grade 3 fractions use halves, thirds, fourths, sixths, or eighths.",
  );
}

function grade4Violation(
  computation: Computation,
  numbers: readonly number[],
  answer: CorrectAnswer,
): string | null {
  if (numbers.some((value) => !Number.isInteger(value))) {
    return "Grade 4 challenges use whole numbers only.";
  }

  if (numbers.some((value) => Math.abs(value) > 10_000)) {
    return "Grade 4 numbers must stay within 10,000.";
  }

  if (computation.type === "division" && computation.divisor.value > 9) {
    if (!isFriendlyEqualGrouping(computation)) {
      return "Grade 4 division uses a one-digit divisor.";
    }
  }

  return fractionDenominatorViolation(computation, answer, (denominator) =>
    denominator <= 12
      ? null
      : "Grade 4 fraction denominators must be 12 or less.",
  );
}

function grade5Violation(
  computation: Computation,
  numbers: readonly number[],
  answer: CorrectAnswer,
): string | null {
  if (numbers.some((value) => decimalPlaces(value) > 2)) {
    return "Grade 5 decimals stop at hundredths.";
  }

  if (numbers.some((value) => Math.abs(value) > 100_000)) {
    return "Grade 5 numbers must stay within 100,000.";
  }

  if (computation.type === "division" && computation.divisor.value > 99) {
    if (!isFriendlyEqualGrouping(computation)) {
      return "Grade 5 division uses a divisor up to two digits.";
    }
  }

  return fractionDenominatorViolation(computation, answer, (denominator) =>
    denominator <= 12
      ? null
      : "Grade 5 fraction denominators must be 12 or less.",
  );
}

function isFriendlyEqualGrouping(
  computation: Extract<Computation, { type: "division" }>,
): boolean {
  const dividend = computation.dividend.value;
  const divisor = computation.divisor.value;
  if (!Number.isInteger(dividend) || !Number.isInteger(divisor) || divisor <= 0) {
    return false;
  }

  if (dividend % divisor !== 0) return false;

  const quotient = dividend / divisor;
  return Number.isInteger(quotient) && quotient >= 1 && quotient <= 12;
}

function fractionDenominatorViolation(
  computation: Computation,
  answer: CorrectAnswer,
  allow: (denominator: number) => string | null,
): string | null {
  if (computation.type === "fraction_of") {
    return allow(computation.denominator);
  }

  if (computation.type === "fraction_remaining") {
    return allow(computation.totalParts.value);
  }

  if (answer.type === "fraction") {
    return allow(answer.denominator);
  }

  return null;
}

function extraComputationNumbers(computation: Computation): number[] {
  if (computation.type === "fraction_of") {
    return [computation.numerator, computation.denominator];
  }

  if (computation.type === "multi_step_arithmetic") {
    const intermediates = evaluateArithmeticSteps(computation.steps);
    if (!intermediates.ok) return [];
    return intermediates.values.map((entry) => entry.value);
  }

  return [];
}

function answerNumbers(answer: CorrectAnswer): number[] {
  if (answer.type === "number") return [answer.value];
  if (answer.type === "choice") return [];
  return [answer.numerator, answer.denominator];
}

function answerIsNegative(answer: CorrectAnswer): boolean {
  if (answer.type === "number") return answer.value < 0;
  if (answer.type === "choice") return false;
  return answer.numerator < 0;
}

function decimalPlaces(value: number): number {
  if (Number.isInteger(value)) return 0;

  const text = String(value);
  const dot = text.indexOf(".");
  if (dot < 0) return 0;

  return text.length - dot - 1;
}

