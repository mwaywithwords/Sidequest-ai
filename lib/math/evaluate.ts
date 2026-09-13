import type {
  ArithmeticStep,
  Computation,
  ComputationStepOperand,
  CorrectAnswer,
  UsedValue,
} from "@/lib/ai/schemas";
import {
  aspectAllowsLabel,
  choiceSetForAspect,
  structureCount,
} from "@/lib/math/geometry-forms";
import {
  isFiniteNumber,
  sharedUnit,
  unitFamily,
  unitsCompatible,
} from "@/lib/math/units";

/**
 * Pure evaluators for ComputationSchema.
 *
 * Each function either returns a structured answer or a typed failure.
 * Nothing here executes a string, and nothing rewrites a bad operand
 * into a nearby good one.
 */

export type EvaluationFailure = {
  ok: false;
  reason: "invalid_values" | "unit_mismatch" | "unsupported_computation";
  detail: string;
};

export type EvaluationSuccess = {
  ok: true;
  answer: CorrectAnswer;
};

export type EvaluationResult = EvaluationSuccess | EvaluationFailure;

export function computationOperands(computation: Computation): UsedValue[] {
  switch (computation.type) {
    case "arithmetic":
      return computation.operands;
    case "multi_step_arithmetic":
      return multiStepValueOperands(computation.steps);
    case "division":
      return [computation.dividend, computation.divisor];
    case "fraction_of":
      return [computation.quantity];
    case "fraction_remaining":
      return [computation.totalParts, computation.usedParts];
    case "conversion":
      return [computation.value, computation.factor];
    case "geometry":
      return computation.dimensions;
    case "shape_identify":
    case "shape_count":
      return [];
  }
}

export function evaluateComputation(
  computation: Computation,
): EvaluationResult {
  switch (computation.type) {
    case "arithmetic":
      return evaluateArithmetic(computation);
    case "multi_step_arithmetic":
      return evaluateMultiStepArithmetic(computation);
    case "division":
      return evaluateDivision(computation);
    case "fraction_of":
      return evaluateFractionOf(computation);
    case "fraction_remaining":
      return evaluateFractionRemaining(computation);
    case "conversion":
      return evaluateConversion(computation);
    case "geometry":
      return evaluateGeometry(computation);
    case "shape_identify":
      return evaluateShapeIdentify(computation);
    case "shape_count":
      return evaluateShapeCount(computation);
    default:
      return fail(
        "unsupported_computation",
        "This computation type is not supported.",
      );
  }
}

function evaluateArithmetic(
  computation: Extract<Computation, { type: "arithmetic" }>,
): EvaluationResult {
  const values = finiteOperands(computation.operands);
  if (values === null) {
    return fail("invalid_values", "An arithmetic operand was not a finite number.");
  }

  if (computation.operation === "add" || computation.operation === "subtract") {
    const unit = sharedUnit(computation.operands.map((operand) => operand.unit));
    if (unit === null) {
      return fail(
        "unit_mismatch",
        "Add and subtract need compatible units on every operand.",
      );
    }

    const result =
      computation.operation === "add"
        ? values.reduce((sum, value) => sum + value, 0)
        : values.reduce((remaining, value, index) =>
            index === 0 ? value : remaining - value,
          );

    return numberResult(result, unit);
  }

  const families = computation.operands.map((operand) => unitFamily(operand.unit));
  const measured = families.filter((family) => family !== "count");
  if (measured.length > 1 && new Set(measured).size > 1) {
    return fail(
      "unit_mismatch",
      "Multiplication cannot mix different measured units.",
    );
  }
  if (measured.length > 1 && measured[0] === "length") {
    return fail(
      "unit_mismatch",
      "Multiplying two lengths is an area. Use a geometry computation.",
    );
  }

  const product = values.reduce((total, value) => total * value, 1);
  const unit = computation.operands.find(
    (operand) => operand.unit !== undefined && operand.unit.trim().length > 0,
  )?.unit;

  return numberResult(product, unit);
}

function evaluateMultiStepArithmetic(
  computation: Extract<Computation, { type: "multi_step_arithmetic" }>,
): EvaluationResult {
  const intermediates = evaluateArithmeticSteps(computation.steps);
  if (!intermediates.ok) return intermediates;

  const last = intermediates.values.at(-1);
  if (last === undefined) {
    return fail("invalid_values", "A multi-step computation produced no result.");
  }

  return numberResult(last.value, last.unit);
}

export function evaluateArithmeticSteps(
  steps: readonly ArithmeticStep[],
):
  | { ok: true; values: Array<{ value: number; unit?: string }> }
  | EvaluationFailure {
  const results: Array<{ value: number; unit?: string }> = [];

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (step === undefined) {
      return fail("invalid_values", "A multi-step computation skipped a step.");
    }

    const resolved = resolveStepOperands(step.operands, results);
    if (!resolved.ok) return resolved;

    const evaluated = evaluateArithmetic({
      type: "arithmetic",
      operation: step.operation,
      operands: resolved.operands,
    });
    if (!evaluated.ok) return evaluated;
    if (evaluated.answer.type !== "number") {
      return fail(
        "unsupported_computation",
        "A multi-step arithmetic step must produce a number.",
      );
    }

    results.push({
      value: evaluated.answer.value,
      unit: evaluated.answer.unit,
    });
  }

  return { ok: true, values: results };
}

function resolveStepOperands(
  operands: readonly ComputationStepOperand[],
  results: readonly { value: number; unit?: string }[],
):
  | { ok: true; operands: UsedValue[] }
  | EvaluationFailure {
  const resolved: UsedValue[] = [];

  for (const operand of operands) {
    if (operand.kind === "value") {
      const { kind: _kind, ...value } = operand;
      void _kind;
      resolved.push(value);
      continue;
    }

    const prior = results[operand.step];
    if (prior === undefined) {
      return fail(
        "invalid_values",
        `Step result ${operand.step} is not available yet.`,
      );
    }

    resolved.push({
      label: `result of step ${operand.step + 1}`,
      value: prior.value,
      origin: "given_in_problem",
      ...(prior.unit === undefined ? {} : { unit: prior.unit }),
    });
  }

  return { ok: true, operands: resolved };
}

function multiStepValueOperands(
  steps: readonly ArithmeticStep[],
): UsedValue[] {
  const values: UsedValue[] = [];

  for (const step of steps) {
    for (const operand of step.operands) {
      if (operand.kind !== "value") continue;
      const { kind: _kind, ...value } = operand;
      void _kind;
      values.push(value);
    }
  }

  return values;
}

function evaluateDivision(
  computation: Extract<Computation, { type: "division" }>,
): EvaluationResult {
  const dividend = computation.dividend.value;
  const divisor = computation.divisor.value;

  if (!isFiniteNumber(dividend) || !isFiniteNumber(divisor)) {
    return fail("invalid_values", "A division operand was not a finite number.");
  }

  if (divisor === 0) {
    return fail("invalid_values", "Division by zero is not allowed.");
  }

  if (computation.operation === "quotient") {
    if (
      computation.dividend.unit !== undefined &&
      computation.divisor.unit !== undefined &&
      !unitsCompatible(computation.dividend.unit, computation.divisor.unit)
    ) {
      return fail(
        "unit_mismatch",
        "A quotient with two measured units needs those units to be compatible.",
      );
    }

    const unit =
      computation.divisor.unit === undefined
        ? computation.dividend.unit
        : undefined;

    return numberResult(dividend / divisor, unit);
  }

  if (computation.operation === "whole_groups") {
    return numberResult(Math.floor(dividend / divisor), undefined);
  }

  if (
    computation.dividend.unit !== undefined &&
    computation.divisor.unit !== undefined &&
    !unitsCompatible(computation.dividend.unit, computation.divisor.unit)
  ) {
    return fail(
      "unit_mismatch",
      "A remainder needs compatible units on the dividend and divisor.",
    );
  }

  const remainder = dividend - Math.floor(dividend / divisor) * divisor;
  return numberResult(remainder, computation.dividend.unit);
}

function evaluateFractionOf(
  computation: Extract<Computation, { type: "fraction_of" }>,
): EvaluationResult {
  const quantity = computation.quantity.value;
  const { numerator, denominator } = computation;

  if (
    !isFiniteNumber(quantity) ||
    !isFiniteNumber(numerator) ||
    !isFiniteNumber(denominator)
  ) {
    return fail("invalid_values", "A fraction-of operand was not a finite number.");
  }

  if (denominator === 0) {
    return fail("invalid_values", "A fraction cannot have a zero denominator.");
  }

  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    return fail("invalid_values", "Fraction parts must be integers.");
  }

  if (numerator <= 0 || denominator <= 0) {
    return fail("invalid_values", "Fraction parts must be positive.");
  }

  return numberResult(
    (quantity * numerator) / denominator,
    computation.quantity.unit,
  );
}

function evaluateFractionRemaining(
  computation: Extract<Computation, { type: "fraction_remaining" }>,
): EvaluationResult {
  const total = computation.totalParts.value;
  const used = computation.usedParts.value;

  if (!isFiniteNumber(total) || !isFiniteNumber(used)) {
    return fail("invalid_values", "A fraction-remaining operand was not finite.");
  }

  if (!Number.isInteger(total) || !Number.isInteger(used)) {
    return fail("invalid_values", "Fraction parts must be whole numbers.");
  }

  if (total <= 0) {
    return fail("invalid_values", "A whole cannot have zero or negative parts.");
  }

  if (used < 0 || used > total) {
    return fail("invalid_values", "Used parts must lie between 0 and the whole.");
  }

  const remaining = total - used;
  const fraction = computation.simplify
    ? simplifyFraction(remaining, total)
    : { numerator: remaining, denominator: total };

  if (fraction.denominator === 0) {
    return fail("invalid_values", "A fraction cannot have a zero denominator.");
  }

  return {
    ok: true,
    answer: {
      type: "fraction",
      numerator: fraction.numerator,
      denominator: fraction.denominator,
    },
  };
}

function evaluateConversion(
  computation: Extract<Computation, { type: "conversion" }>,
): EvaluationResult {
  const value = computation.value.value;
  const factor = computation.factor.value;

  if (!isFiniteNumber(value) || !isFiniteNumber(factor)) {
    return fail("invalid_values", "A conversion operand was not a finite number.");
  }

  if (factor === 0) {
    return fail("invalid_values", "A conversion factor cannot be zero.");
  }

  const result =
    computation.operation === "multiply" ? value * factor : value / factor;

  return numberResult(result, undefined);
}

function evaluateGeometry(
  computation: Extract<Computation, { type: "geometry" }>,
): EvaluationResult {
  const values = finiteOperands(computation.dimensions);
  if (values === null) {
    return fail("invalid_values", "A geometry dimension was not a finite number.");
  }

  const unit = sharedUnit(computation.dimensions.map((dimension) => dimension.unit));
  if (unit === null) {
    return fail(
      "unit_mismatch",
      "Geometry dimensions must use compatible length units.",
    );
  }

  const expected = expectedDimensionCount(
    computation.shape,
    computation.operation,
  );
  if (expected === null) {
    return fail(
      "unsupported_computation",
      `${computation.shape} ${computation.operation} is not supported.`,
    );
  }

  if (values.length !== expected) {
    return fail(
      "invalid_values",
      `${computation.shape} ${computation.operation} needs ${expected} dimension(s).`,
    );
  }

  if (computation.operation === "perimeter") {
    if (computation.shape === "rectangle") {
      return numberResult(2 * (values[0]! + values[1]!), unit);
    }
    if (computation.shape === "square") {
      return numberResult(4 * values[0]!, unit);
    }
    return numberResult(values[0]! + values[1]! + values[2]!, unit);
  }

  if (computation.shape === "rectangle") {
    return numberResult(values[0]! * values[1]!, unit);
  }
  if (computation.shape === "square") {
    return numberResult(values[0]! * values[0]!, unit);
  }
  return numberResult((values[0]! * values[1]!) / 2, unit);
}

function evaluateShapeIdentify(
  computation: Extract<Computation, { type: "shape_identify" }>,
): EvaluationResult {
  if (!aspectAllowsLabel(computation.aspect, computation.label)) {
    return fail(
      "invalid_values",
      `The label "${computation.label}" is not valid for ${computation.aspect}.`,
    );
  }

  return {
    ok: true,
    answer: {
      type: "choice",
      value: computation.label,
      set: choiceSetForAspect(computation.aspect),
    },
  };
}

function evaluateShapeCount(
  computation: Extract<Computation, { type: "shape_count" }>,
): EvaluationResult {
  const count = structureCount(computation.shape, computation.feature);
  if (count === null) {
    return fail(
      "invalid_values",
      `No established ${computation.feature} count for ${computation.shape}.`,
    );
  }

  return numberResult(count, undefined);
}

export function simplifyFraction(
  numerator: number,
  denominator: number,
): { numerator: number; denominator: number } {
  if (denominator === 0) return { numerator, denominator };

  const sign = denominator < 0 ? -1 : 1;
  const absNum = Math.abs(numerator);
  const absDen = Math.abs(denominator);
  const divisor = gcd(absNum, absDen);

  return {
    numerator: (sign * numerator) / divisor,
    denominator: absDen / divisor,
  };
}

export function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);

  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }

  return a === 0 ? 1 : a;
}

function expectedDimensionCount(
  shape: "rectangle" | "square" | "triangle",
  operation: "perimeter" | "area",
): number | null {
  if (shape === "rectangle") return 2;
  if (shape === "square") return 1;
  if (shape === "triangle" && operation === "perimeter") return 3;
  if (shape === "triangle" && operation === "area") return 2;
  return null;
}

function finiteOperands(operands: readonly UsedValue[]): number[] | null {
  const values = operands.map((operand) => operand.value);
  return values.every(isFiniteNumber) ? values : null;
}

function numberResult(
  value: number,
  unit: string | undefined,
): EvaluationResult {
  if (!isFiniteNumber(value)) {
    return fail("invalid_values", "The computed result was not a finite number.");
  }

  return {
    ok: true,
    answer: unit === undefined ? { type: "number", value } : { type: "number", value, unit },
  };
}

function fail(
  reason: EvaluationFailure["reason"],
  detail: string,
): EvaluationFailure {
  return { ok: false, reason, detail };
}
