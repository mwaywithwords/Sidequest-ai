import type {
  Computation,
  ContextualPayload,
  CorrectAnswer,
  GeneratedChallenge,
  ObjectAnalysis,
  ReadySkillFit,
  UsedValue,
} from "@/lib/ai/schemas";
import { computationOperands, evaluateComputation, simplifyFraction } from "@/lib/math/evaluate";
import { gradeViolation } from "@/lib/math/grade-rules";
import {
  isContextualValue,
  isObservedValue,
  isStudentProvidedValue,
  type StudentEvidenceValue,
  valuesMatch,
} from "@/lib/math/grounding";
import { shapeSupports } from "@/lib/math/geometry-forms";
import { isFiniteNumber, sameUnit, unitsCompatible } from "@/lib/math/units";
import type { Grade, SkillId } from "@/lib/types";

/**
 * Deterministic verification of a candidate challenge.
 *
 * The only source of truth for the answer is:
 * computation → evaluateComputation → correctAnswer.
 *
 * Natural-language solution text is checked for a simple contradiction,
 * then ignored. Nothing here calls a model.
 */

export const VERIFICATION_REASONS = [
  "invalid_values",
  "unit_mismatch",
  "incorrect_answer",
  "solution_mismatch",
  "ungrounded_value",
  "skill_mismatch",
  "grade_inappropriate",
  "weak_object_connection",
  "unsupported_computation",
] as const;

export type VerificationReason = (typeof VERIFICATION_REASONS)[number];

export type VerificationResult =
  | { ok: true; computedAnswer: CorrectAnswer }
  | { ok: false; reason: VerificationReason; detail: string };

export type VerificationInput = {
  challenge: GeneratedChallenge;
  analysis: ObjectAnalysis;
  fit: ReadySkillFit;
  skillId: SkillId;
  grade: Grade;
  studentEvidence?: readonly StudentEvidenceValue[];
  contextualGrounding?: ContextualPayload | null;
};

const HYPOTHETICAL = /\b(if|suppose|imagine|what if)\b/i;

const GENERIC_CONNECTION =
  /\bthis (question|problem|challenge|sidequest) is about your\b/i;

const FRACTION_WORDS: Record<number, readonly string[]> = {
  2: ["half", "halves"],
  3: ["third", "thirds"],
  4: ["fourth", "fourths", "quarter", "quarters"],
  6: ["sixth", "sixths"],
  8: ["eighth", "eighths"],
  12: ["twelfth", "twelfths"],
};

export function verifyChallenge(input: VerificationInput): VerificationResult {
  const { challenge, analysis, fit, skillId, grade } = input;
  const evidence = input.studentEvidence ?? [];
  const operands = computationOperands(challenge.computation);

  const valuesCheck = verifyValues(challenge.valuesUsed, operands);
  if (valuesCheck) return valuesCheck;

  const originCheck = verifyOrigins(
    challenge,
    operands,
    analysis,
    fit,
    evidence,
    input.contextualGrounding ?? null,
  );
  if (originCheck) return originCheck;

  if (challenge.skillCode !== skillId) {
    return fail(
      "skill_mismatch",
      "The challenge skill does not match the skill the student selected.",
    );
  }

  if (!computationMatchesSkill(challenge.computation, skillId)) {
    return fail(
      "skill_mismatch",
      `The computation does not represent ${skillId}.`,
    );
  }

  const evaluated = evaluateComputation(challenge.computation);
  if (!evaluated.ok) {
    return evaluated;
  }

  if (!answersAgree(evaluated.answer, challenge.correctAnswer)) {
    return fail(
      "incorrect_answer",
      "The stored answer does not match the independently computed result.",
    );
  }

  const gradeProblem = gradeViolation(
    grade,
    challenge.computation,
    operands,
    evaluated.answer,
  );
  if (gradeProblem) {
    return fail("grade_inappropriate", gradeProblem);
  }

  if (
    !objectConnectionHolds(
      challenge,
      analysis,
      operands,
      fit,
      input.contextualGrounding ?? null,
    )
  ) {
    return fail(
      "weak_object_connection",
      "objectConnection does not explain how this object grounds the challenge.",
    );
  }

  if (!solutionAgreesWithAnswer(challenge.solution, evaluated.answer)) {
    return fail(
      "solution_mismatch",
      "The solution text does not contain the verified answer.",
    );
  }

  return { ok: true, computedAnswer: evaluated.answer };
}

export function planAfterVerification(
  attempt: 1 | 2,
  result: VerificationResult,
): "accept" | "regenerate" | "give_up" {
  if (result.ok) return "accept";
  if (attempt === 1) return "regenerate";
  return "give_up";
}

export function guidanceForFailure(reason: VerificationReason): string {
  switch (reason) {
    case "incorrect_answer":
      return "Your previous arithmetic did not match the structured computation. Generate a new challenge and recompute carefully.";
    case "ungrounded_value":
      return "The previous challenge used a value that was not established by its declared origin. Observed values must match ObjectAnalysis. Contextual values must match the contextual payload. Given-in-problem values must be stated in the question. Do not relabel origins.";
    case "unit_mismatch":
      return "The previous challenge mixed incompatible units.";
    case "invalid_values":
      return "The previous challenge had an invalid number, such as a zero divisor or a missing dimension. Use finite, well-formed values only.";
    case "solution_mismatch":
      return "The previous solution text did not contain the computed answer. Write a short solution that states the verified result.";
    case "skill_mismatch":
      return "The previous computation did not match the selected skill. Use an operation that is actually that skill.";
    case "grade_inappropriate":
      return "The previous challenge was not appropriate for this grade. Use smaller numbers and the operations this grade has met.";
    case "weak_object_connection":
      return "The previous objectConnection did not explain how this object or its real-world context grounds the challenge.";
    case "unsupported_computation":
      return "The previous computation type is not supported. Use one of the allowed structured computation shapes.";
  }
}

/**
 * Isolated so the wording check can be tuned without touching arithmetic.
 *
 * Looks for the verified number or an equivalent fraction in the solution
 * text. It does not parse the solution as mathematics.
 */
export function solutionAgreesWithAnswer(
  solution: string,
  answer: CorrectAnswer,
): boolean {
  const text = solution.toLowerCase();

  if (answer.type === "choice") {
    return text.includes(answer.value.toLowerCase());
  }

  if (answer.type === "number") {
    if (!numberAppears(text, answer.value)) return false;
    if (answer.unit && !text.includes(answer.unit.toLowerCase())) {
      return false;
    }
    return true;
  }

  const reduced = simplifyFraction(answer.numerator, answer.denominator);
  const forms = [
    `${answer.numerator}/${answer.denominator}`,
    `${reduced.numerator}/${reduced.denominator}`,
    `${answer.numerator} / ${answer.denominator}`,
  ];

  if (forms.some((form) => text.includes(form))) {
    return unitAppears(text, answer.unit);
  }

  const words = FRACTION_WORDS[reduced.denominator];
  if (
    words &&
    numberAppears(text, reduced.numerator) &&
    words.some((word) => text.includes(word))
  ) {
    return unitAppears(text, answer.unit);
  }

  return false;
}

export function answersAgree(
  computed: CorrectAnswer,
  stored: CorrectAnswer,
): boolean {
  if (computed.type === "choice" && stored.type === "choice") {
    return computed.value === stored.value && computed.set === stored.set;
  }

  if (computed.type === "number" && stored.type === "number") {
    if (!numbersEqual(computed.value, stored.value)) return false;
    return answerUnitsAgree(computed.unit, stored.unit);
  }

  if (computed.type === "fraction" && stored.type === "fraction") {
    const left = simplifyFraction(computed.numerator, computed.denominator);
    const right = simplifyFraction(stored.numerator, stored.denominator);
    if (
      left.numerator !== right.numerator ||
      left.denominator !== right.denominator
    ) {
      return false;
    }
    return answerUnitsAgree(computed.unit, stored.unit);
  }

  if (computed.type === "number" && stored.type === "fraction") {
    if (stored.denominator === 0) return false;
    const asNumber = stored.numerator / stored.denominator;
    return (
      numbersEqual(computed.value, asNumber) &&
      answerUnitsAgree(computed.unit, stored.unit)
    );
  }

  if (computed.type === "fraction" && stored.type === "number") {
    if (computed.denominator === 0) return false;
    const asNumber = computed.numerator / computed.denominator;
    return (
      numbersEqual(asNumber, stored.value) &&
      answerUnitsAgree(computed.unit, stored.unit)
    );
  }

  return false;
}

function verifyValues(
  valuesUsed: readonly UsedValue[],
  operands: readonly UsedValue[],
): VerificationResult | null {
  const listed = [...valuesUsed, ...operands];

  for (const value of listed) {
    if (!isFiniteNumber(value.value)) {
      return fail("invalid_values", `The value "${value.label}" is not finite.`);
    }
  }

  for (const operand of operands) {
    if (!valuesUsed.some((value) => valuesMatch(value, operand))) {
      return fail(
        "invalid_values",
        `The computation operand "${operand.label}" is missing from valuesUsed.`,
      );
    }
  }

  return null;
}

function verifyOrigins(
  challenge: GeneratedChallenge,
  operands: readonly UsedValue[],
  analysis: ObjectAnalysis,
  fit: ReadySkillFit,
  evidence: readonly StudentEvidenceValue[],
  payload: ContextualPayload | null,
): VerificationResult | null {
  for (const value of challenge.valuesUsed) {
    if (value.origin === "observed" && !isObservedValue(value, analysis, fit)) {
      return fail(
        "ungrounded_value",
        `The observed value "${value.label}" is not in the object reading.`,
      );
    }

    if (
      value.origin === "student_provided" &&
      !isStudentProvidedValue(value, evidence)
    ) {
      return fail(
        "ungrounded_value",
        `The student-provided value "${value.label}" has no persisted evidence.`,
      );
    }

    if (value.origin === "contextual") {
      if (fit.challengeMode !== "inspired_math") {
        return fail(
          "ungrounded_value",
          "A contextual value was used outside inspired_math.",
        );
      }

      if (isObservedValue(value, analysis, fit)) {
        return fail(
          "ungrounded_value",
          `The contextual value "${value.label}" is actually an observed object fact.`,
        );
      }

      if (!isContextualValue(value, payload)) {
        return fail(
          "ungrounded_value",
          `The contextual value "${value.label}" is not in the contextual payload.`,
        );
      }
    }

    if (value.origin === "given_in_problem") {
      if (isObservedValue(value, analysis, fit)) {
        return fail(
          "ungrounded_value",
          `The given-in-problem value "${value.label}" is actually an observed object fact.`,
        );
      }

      if (isContextualValue(value, payload)) {
        return fail(
          "ungrounded_value",
          `The given-in-problem value "${value.label}" is actually a contextual fact.`,
        );
      }
    }
  }

  const given = challenge.valuesUsed.filter(
    (value) => value.origin === "given_in_problem",
  );
  if (given.length > 0) {
    if (!HYPOTHETICAL.test(challenge.question)) {
      return fail(
        "ungrounded_value",
        "A given-in-problem value is not framed as hypothetical.",
      );
    }

    for (const value of given) {
      if (!challenge.question.includes(String(value.value))) {
        return fail(
          "ungrounded_value",
          `The hypothetical value ${value.value} does not appear in the question.`,
        );
      }
    }
  }

  if (fit.challengeMode === "inspired_math") {
    const inspiredOperands = operands.filter(
      (operand) =>
        operand.origin === "contextual" ||
        operand.origin === "given_in_problem" ||
        operand.origin === "observed" ||
        operand.origin === "student_provided",
    );

    if (inspiredOperands.length === 0) {
      return fail(
        "ungrounded_value",
        "The inspired computation does not use a declared value.",
      );
    }

    const inspiredOk = inspiredOperands.some((operand) => {
      if (operand.origin === "observed") {
        return isObservedValue(operand, analysis, fit);
      }
      if (operand.origin === "student_provided") {
        return isStudentProvidedValue(operand, evidence);
      }
      if (operand.origin === "contextual") {
        return isContextualValue(operand, payload);
      }
      return operand.origin === "given_in_problem";
    });

    if (!inspiredOk) {
      return fail(
        "ungrounded_value",
        "The inspired computation operand could not be established independently.",
      );
    }

    return null;
  }

  if (isShapeComputation(challenge.computation)) {
    return verifyShapeComputation(challenge, analysis);
  }

  const groundedOperands = operands.filter(
    (operand) =>
      operand.origin === "observed" || operand.origin === "student_provided",
  );

  if (groundedOperands.length === 0) {
    return fail(
      "ungrounded_value",
      "The computation does not use an observed or student-provided value.",
    );
  }

  const groundedOk = groundedOperands.some((operand) =>
    operand.origin === "observed"
      ? isObservedValue(operand, analysis, fit)
      : isStudentProvidedValue(operand, evidence),
  );

  if (!groundedOk) {
    return fail(
      "ungrounded_value",
      "The grounded computation operand could not be established independently.",
    );
  }

  return null;
}

function computationMatchesSkill(
  computation: Computation,
  skillId: SkillId,
): boolean {
  switch (skillId) {
    case "addition":
      return (
        computation.type === "arithmetic" && computation.operation === "add"
      );
    case "subtraction":
      return (
        computation.type === "arithmetic" && computation.operation === "subtract"
      );
    case "multiplication":
      return (
        computation.type === "arithmetic" && computation.operation === "multiply"
      );
    case "division":
      return computation.type === "division";
    case "fractions":
      return (
        computation.type === "fraction_of" ||
        computation.type === "fraction_remaining"
      );
    case "measurement":
      return (
        computation.type === "arithmetic" ||
        computation.type === "conversion" ||
        computation.type === "division"
      );
    case "geometry":
      return (
        computation.type === "geometry" ||
        computation.type === "shape_identify" ||
        computation.type === "shape_count"
      );
  }
}

function isShapeComputation(
  computation: Computation,
): computation is Extract<
  Computation,
  { type: "shape_identify" | "shape_count" }
> {
  return (
    computation.type === "shape_identify" || computation.type === "shape_count"
  );
}

function verifyShapeComputation(
  challenge: GeneratedChallenge,
  analysis: ObjectAnalysis,
): VerificationResult | null {
  const shapes = challenge.shapesUsed ?? [];
  if (shapes.length === 0) {
    return fail(
      "ungrounded_value",
      "A shape challenge has no observed form to stand on.",
    );
  }

  const observed = shapes.filter((shape) => shape.origin === "observed");
  if (observed.length === 0) {
    return fail(
      "ungrounded_value",
      "A shape challenge must use an observed form from the reading.",
    );
  }

  const computation = challenge.computation;
  if (computation.type === "shape_identify") {
    const matched = observed.some(
      (shape) =>
        shape.form === computation.label &&
        shape.aspect === computation.aspect &&
        shapeSupports(analysis, computation.aspect, computation.label),
    );

    if (!matched) {
      return fail(
        "ungrounded_value",
        `The label "${computation.label}" is not supported by the object reading.`,
      );
    }

    return null;
  }

  if (computation.type === "shape_count") {
    const matched = observed.some(
      (shape) =>
        shape.form === computation.shape &&
        shapeSupports(analysis, shape.aspect, shape.form),
    );

    if (!matched) {
      return fail(
        "ungrounded_value",
        `The form "${computation.shape}" is not supported by the object reading.`,
      );
    }
  }

  return null;
}

function objectConnectionHolds(
  challenge: GeneratedChallenge,
  analysis: ObjectAnalysis,
  operands: readonly UsedValue[],
  fit: ReadySkillFit,
  payload: ContextualPayload | null,
): boolean {
  const connection = challenge.objectConnection.trim();
  if (connection.length === 0) return false;

  const hay = connection.toLowerCase();
  const photoAnchors = operands.filter(
    (operand) =>
      operand.origin === "observed" || operand.origin === "student_provided",
  );

  const citesPhoto = photoAnchors.some((anchor) => {
    if (hay.includes(String(anchor.value))) return true;
    if (hay.includes(anchor.label.toLowerCase())) return true;
    if (anchor.unit && hay.includes(anchor.unit.toLowerCase())) return true;
    return false;
  });

  const citesShape = (challenge.shapesUsed ?? []).some((shape) => {
    if (hay.includes(shape.form.toLowerCase())) return true;
    if (hay.includes(shape.label.toLowerCase())) return true;
    return false;
  });

  if (fit.challengeMode === "inspired_math") {
    const worldAnchors = operands.filter(
      (operand) =>
        operand.origin === "contextual" ||
        operand.origin === "given_in_problem",
    );
    const citesWorld = worldAnchors.some((anchor) => {
      if (hay.includes(String(anchor.value))) return true;
      if (hay.includes(anchor.label.toLowerCase())) return true;
      return false;
    });
    const topic = payload?.topic ?? fit.inspirationContext?.topic ?? "";
    const citesTopic = topic
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length >= 4)
      .some((token) => hay.includes(token));

    if (!citesPhoto && !citesWorld && !citesTopic && !citesShape) return false;
  } else if (!citesPhoto && !citesShape) {
    return false;
  }

  if (
    GENERIC_CONNECTION.test(connection) &&
    photoAnchors.length === 0 &&
    !citesShape
  ) {
    return false;
  }

  const objectName = analysis.objectName.toLowerCase();
  const tokens = objectName
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 4);

  return (
    (objectName.length > 0 && hay.includes(objectName)) ||
    tokens.some((token) => hay.includes(token)) ||
    citesPhoto ||
    citesShape
  );
}

function answerUnitsAgree(
  computed?: string,
  stored?: string,
): boolean {
  if (computed === undefined && stored === undefined) return true;
  if (computed === undefined || stored === undefined) return false;
  return unitsCompatible(computed, stored) && sameUnit(computed, stored);
}

function numbersEqual(left: number, right: number): boolean {
  if (!isFiniteNumber(left) || !isFiniteNumber(right)) return false;

  if (Number.isInteger(left) && Number.isInteger(right)) {
    return left === right;
  }

  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= 1e-9 * scale;
}

function numberAppears(text: string, value: number): boolean {
  const exact = Number.isInteger(value) ? String(value) : String(value);
  return new RegExp(`(^|[^0-9])${escapeRegExp(exact)}(?!\\.?\\d)`).test(text);
}

function unitAppears(text: string, unit: string | undefined): boolean {
  if (unit === undefined) return true;
  return text.includes(unit.toLowerCase());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(reason: VerificationReason, detail: string): VerificationResult {
  return { ok: false, reason, detail };
}
