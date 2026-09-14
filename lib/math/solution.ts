import type {
  ArithmeticStep,
  Computation,
  ComputationStepOperand,
  CorrectAnswer,
  UsedValue,
} from "@/lib/ai/schemas";
import {
  evaluateArithmeticSteps,
  evaluateComputation,
} from "@/lib/math/evaluate";
import { isFiniteNumber, normaliseUnit } from "@/lib/math/units";

/**
 * Student-facing solution prose built from a verified Computation.
 *
 * The evaluator is the source of truth. This module only formats that
 * result. It never calls a model and never uses eval.
 */

const OP_SYMBOL = {
  add: "+",
  subtract: "−",
  multiply: "×",
  divide: "÷",
} as const;

export function deterministicSolution(
  computation: Computation,
  answer: CorrectAnswer,
): string | null {
  const evaluated = evaluateComputation(computation);
  if (!evaluated.ok) return null;

  switch (computation.type) {
    case "arithmetic":
      return explainArithmetic(computation, answer);
    case "multi_step_arithmetic":
      return explainMultiStep(computation, answer);
    case "division":
      return explainDivision(computation, answer);
    case "fraction_of":
      return explainFractionOf(computation, answer);
    case "fraction_remaining":
      return explainFractionRemaining(computation, answer);
    default:
      return null;
  }
}

function explainArithmetic(
  computation: Extract<Computation, { type: "arithmetic" }>,
  answer: CorrectAnswer,
): string | null {
  const terms = formatOperands(computation.operands);
  const result = formatAnswer(answer);
  if (terms === null || result === null) return null;

  const equation = infixEquation(terms, computation.operation, result);
  if (equation === null) return null;

  if (computation.operation === "add") {
    return `Add ${joinAnd(terms)}. ${equation}`;
  }

  if (computation.operation === "subtract") {
    const first = terms[0];
    const rest = terms.slice(1);
    if (first === undefined || rest.length === 0) return null;
    return `Subtract ${joinAnd(rest)} from ${first}. ${equation}`;
  }

  if (terms.length === 2) {
    return `Multiply ${terms[0]} by ${terms[1]}. ${equation}`;
  }

  return `Multiply ${joinAnd(terms)}. ${equation}`;
}

function explainMultiStep(
  computation: Extract<Computation, { type: "multi_step_arithmetic" }>,
  answer: CorrectAnswer,
): string | null {
  const intermediates = evaluateArithmeticSteps(computation.steps);
  if (!intermediates.ok) return null;

  const sentences: string[] = [];

  for (let index = 0; index < computation.steps.length; index += 1) {
    const step = computation.steps[index];
    const intermediate = intermediates.values[index];
    if (step === undefined || intermediate === undefined) return null;

    const last = index === computation.steps.length - 1;
    const stepAnswer: CorrectAnswer = last
      ? answer
      : numberAnswer(intermediate.value, intermediate.unit);

    const sentence = explainResolvedStep(step, intermediates.values, stepAnswer);
    if (sentence === null) return null;
    sentences.push(sentence);
  }

  return sentences.length >= 2 ? sentences.join(" ") : null;
}

function explainResolvedStep(
  step: ArithmeticStep,
  results: readonly { value: number; unit?: string }[],
  answer: CorrectAnswer,
): string | null {
  const operands = resolveStepValues(step.operands, results);
  if (operands === null) return null;

  return explainArithmetic(
    { type: "arithmetic", operation: step.operation, operands },
    answer,
  );
}

function resolveStepValues(
  operands: readonly ComputationStepOperand[],
  results: readonly { value: number; unit?: string }[],
): UsedValue[] | null {
  const resolved: UsedValue[] = [];

  for (const operand of operands) {
    if (operand.kind === "value") {
      const { kind: _kind, ...value } = operand;
      void _kind;
      resolved.push(value);
      continue;
    }

    const prior = results[operand.step];
    if (prior === undefined || !isFiniteNumber(prior.value)) return null;

    resolved.push({
      label: `result of step ${operand.step + 1}`,
      value: prior.value,
      origin: "given_in_problem",
      ...(prior.unit === undefined ? {} : { unit: prior.unit }),
    });
  }

  return resolved.length >= 2 ? resolved : null;
}

function explainDivision(
  computation: Extract<Computation, { type: "division" }>,
  answer: CorrectAnswer,
): string | null {
  const dividend = formatQuantity(computation.dividend.value, computation.dividend.unit);
  const divisor = formatQuantity(computation.divisor.value, computation.divisor.unit);
  const result = formatAnswer(answer);
  if (dividend === null || divisor === null || result === null) return null;

  if (computation.operation === "remainder") {
    return `Divide ${dividend} by ${divisor}. The remainder is ${result}.`;
  }

  if (computation.operation === "whole_groups") {
    return `Divide ${dividend} by ${divisor}. ${dividend} ÷ ${divisor} = ${result} whole groups.`;
  }

  const equation = infixEquation([dividend, divisor], "divide", result);
  if (equation === null) return null;
  return `Divide ${dividend} by ${divisor}. ${equation}`;
}

function explainFractionOf(
  computation: Extract<Computation, { type: "fraction_of" }>,
  answer: CorrectAnswer,
): string | null {
  const quantity = formatQuantity(
    computation.quantity.value,
    computation.quantity.unit,
  );
  const numerator = formatGroupedNumber(computation.numerator);
  const denominator = formatGroupedNumber(computation.denominator);
  const result = formatAnswer(answer);
  if (
    quantity === null ||
    numerator === null ||
    denominator === null ||
    result === null
  ) {
    return null;
  }

  const fraction = `${numerator}/${denominator}`;
  return `Find ${fraction} of ${quantity}. ${fraction} × ${quantity} = ${result}.`;
}

function explainFractionRemaining(
  computation: Extract<Computation, { type: "fraction_remaining" }>,
  answer: CorrectAnswer,
): string | null {
  if (answer.type !== "fraction") return null;

  const total = formatGroupedNumber(computation.totalParts.value);
  const used = formatGroupedNumber(computation.usedParts.value);
  const remaining = formatGroupedNumber(
    computation.totalParts.value - computation.usedParts.value,
  );
  const numerator = formatGroupedNumber(answer.numerator);
  const denominator = formatGroupedNumber(answer.denominator);
  if (
    total === null ||
    used === null ||
    remaining === null ||
    numerator === null ||
    denominator === null
  ) {
    return null;
  }

  return `Take ${used} from ${total}. ${total} − ${used} = ${remaining} remaining parts, so ${numerator}/${denominator}.`;
}

function formatOperands(operands: readonly UsedValue[]): string[] | null {
  const terms = operands.map((operand) =>
    formatQuantity(operand.value, operand.unit),
  );
  if (terms.some((term) => term === null)) return null;
  return terms as string[];
}

function infixEquation(
  terms: readonly string[],
  operation: keyof typeof OP_SYMBOL,
  result: string,
): string | null {
  if (terms.length < 2) return null;
  return `${terms.join(` ${OP_SYMBOL[operation]} `)} = ${result}.`;
}

function formatAnswer(answer: CorrectAnswer): string | null {
  if (answer.type === "number") {
    return formatQuantity(answer.value, answer.unit);
  }

  if (answer.type === "fraction") {
    const numerator = formatGroupedNumber(answer.numerator);
    const denominator = formatGroupedNumber(answer.denominator);
    if (numerator === null || denominator === null) return null;
    const fraction = `${numerator}/${denominator}`;
    return answer.unit === undefined
      ? fraction
      : `${fraction} ${answer.unit}`;
  }

  return null;
}

function formatQuantity(value: number, unit: string | undefined): string | null {
  const number = formatGroupedNumber(value);
  if (number === null) return null;
  if (unit === undefined || unit.trim().length === 0) return number;

  if (normaliseUnit(unit) === "dollar") {
    return `$${number}`;
  }

  return `${number} ${unit}`;
}

export function formatGroupedNumber(value: number): string | null {
  if (!isFiniteNumber(value)) return null;
  if (Object.is(value, -0)) return "0";

  if (Number.isInteger(value)) {
    const sign = value < 0 ? "-" : "";
    const digits = String(Math.abs(value));
    return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  }

  const normalised = Number(value.toPrecision(12));
  if (!isFiniteNumber(normalised)) return null;
  return String(normalised);
}

function joinAnd(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function numberAnswer(value: number, unit: string | undefined): CorrectAnswer {
  return unit === undefined
    ? { type: "number", value }
    : { type: "number", value, unit };
}
