import type {
  ArithmeticStep,
  Computation,
  ComputationStepOperand,
  UsedValue,
} from "@/lib/ai/schemas";
import {
  evaluateArithmeticSteps,
  evaluateComputation,
} from "@/lib/math/evaluate";
import { isFiniteNumber } from "@/lib/math/units";

/**
 * Student-facing math board, built only from a verified Computation.
 *
 * This is not the structured computation, not the stored answer, and not
 * model text. A later stage evaluates the computation; this stage only
 * formats the same operands into a Grade 3–5 expression. The final
 * result is always written as `?`.
 */

export type MathExpressionLine = {
  heading: string | null;
  display: string;
  spoken: string;
};

export type StudentMathExpression =
  | { kind: "none" }
  | { kind: "equation"; lines: MathExpressionLine[] };

const NONE: StudentMathExpression = { kind: "none" };

const OPERATORS = {
  add: { symbol: "+", spoken: "plus" },
  subtract: { symbol: "−", spoken: "minus" },
  multiply: { symbol: "×", spoken: "times" },
  divide: { symbol: "÷", spoken: "divided by" },
} as const;

type ArithmeticOp = keyof typeof OPERATORS;

/**
 * Deterministic presentation of a structured computation.
 *
 * Qualitative geometry returns `none` so the existing choice interaction
 * stays the only student representation. Any computation the evaluator
 * rejects also returns `none` rather than inventing a nearby equation.
 */
export function presentMathExpression(
  computation: Computation,
): StudentMathExpression {
  if (
    computation.type === "shape_identify" ||
    computation.type === "shape_count"
  ) {
    return NONE;
  }

  const evaluated = evaluateComputation(computation);
  if (!evaluated.ok) return NONE;

  switch (computation.type) {
    case "arithmetic":
      return presentInfix(
        operandNumbers(computation.operands),
        computation.operation,
      );
    case "division":
      return presentInfix(
        operandNumbers([computation.dividend, computation.divisor]),
        "divide",
      );
    case "conversion":
      return presentInfix(
        operandNumbers([computation.value, computation.factor]),
        computation.operation === "multiply" ? "multiply" : "divide",
      );
    case "fraction_of":
      return presentFractionOf(computation);
    case "fraction_remaining":
      return presentFractionRemaining(computation);
    case "geometry":
      return presentGeometry(computation);
    case "multi_step_arithmetic":
      return presentMultiStep(computation);
    default:
      return NONE;
  }
}

/**
 * One spoken label for a board. Multi-step lines are joined in order.
 */
export function spokenMathExpression(
  expression: StudentMathExpression,
): string {
  if (expression.kind === "none") return "";
  return expression.lines.map((line) => line.spoken).join(". ");
}

function presentFractionOf(
  computation: Extract<Computation, { type: "fraction_of" }>,
): StudentMathExpression {
  const quantity = formatMathNumber(computation.quantity.value);
  const numerator = formatMathNumber(computation.numerator);
  const denominator = formatMathNumber(computation.denominator);
  if (quantity === null || numerator === null || denominator === null) {
    return NONE;
  }

  return equation(
    `${numerator}/${denominator} × ${quantity} = ?`,
    `${numerator} over ${denominator} times ${quantity} equals unknown`,
  );
}

function presentFractionRemaining(
  computation: Extract<Computation, { type: "fraction_remaining" }>,
): StudentMathExpression {
  const total = formatMathNumber(computation.totalParts.value);
  const used = formatMathNumber(computation.usedParts.value);
  if (total === null || used === null) return NONE;

  return equation(
    `(${total} − ${used})/${total} = ?`,
    `open parenthesis ${total} minus ${used} close parenthesis over ${total} equals unknown`,
  );
}

function presentGeometry(
  computation: Extract<Computation, { type: "geometry" }>,
): StudentMathExpression {
  const values = operandNumbers(computation.dimensions);
  if (values === null) return NONE;

  if (computation.operation === "perimeter") {
    if (computation.shape === "rectangle" && values.length === 2) {
      return grouped(
        "2",
        "times",
        "×",
        values[0]!,
        "plus",
        "+",
        values[1]!,
      );
    }
    if (computation.shape === "square" && values.length === 1) {
      return presentInfix(["4", values[0]!], "multiply");
    }
    if (computation.shape === "triangle" && values.length === 3) {
      return presentInfix(values, "add");
    }
    return NONE;
  }

  if (computation.shape === "rectangle" && values.length === 2) {
    return presentInfix(values, "multiply");
  }
  if (computation.shape === "square" && values.length === 1) {
    return presentInfix([values[0]!, values[0]!], "multiply");
  }
  if (computation.shape === "triangle" && values.length === 2) {
    const base = values[0]!;
    const height = values[1]!;
    return equation(
      `(${base} × ${height}) ÷ 2 = ?`,
      `open parenthesis ${base} times ${height} close parenthesis divided by 2 equals unknown`,
    );
  }

  return NONE;
}

function presentMultiStep(
  computation: Extract<Computation, { type: "multi_step_arithmetic" }>,
): StudentMathExpression {
  const intermediates = evaluateArithmeticSteps(computation.steps);
  if (!intermediates.ok) return NONE;

  const lines: MathExpressionLine[] = [];

  for (let index = 0; index < computation.steps.length; index += 1) {
    const step = computation.steps[index];
    const result = intermediates.values[index];
    if (step === undefined || result === undefined) return NONE;

    const terms = stepTermNumbers(step, intermediates.values);
    if (terms === null) return NONE;

    const last = index === computation.steps.length - 1;
    const shown = last ? null : formatMathNumber(result.value);
    if (!last && shown === null) return NONE;

    const body = infixBody(terms, step.operation);
    if (body === null) return NONE;

    const heading = `STEP ${index + 1}`;
    const resultDisplay = last ? "?" : shown!;
    const resultSpoken = last ? "unknown" : shown!;

    lines.push({
      heading,
      display: `${body.display} = ${resultDisplay}`,
      spoken: `Step ${index + 1}: ${body.spoken} equals ${resultSpoken}`,
    });
  }

  if (lines.length < 2) return NONE;
  return { kind: "equation", lines };
}

function presentInfix(
  terms: string[] | null,
  operation: ArithmeticOp,
): StudentMathExpression {
  const body = infixBody(terms, operation);
  if (body === null) return NONE;
  return equation(`${body.display} = ?`, `${body.spoken} equals unknown`);
}

function infixBody(
  terms: string[] | null,
  operation: ArithmeticOp,
): { display: string; spoken: string } | null {
  if (terms === null || terms.length < 2) return null;

  const op = OPERATORS[operation];
  return {
    display: terms.join(` ${op.symbol} `),
    spoken: terms.join(` ${op.spoken} `),
  };
}

function grouped(
  left: string,
  leftSpoken: string,
  leftSymbol: string,
  innerLeft: string,
  innerSpoken: string,
  innerSymbol: string,
  innerRight: string,
): StudentMathExpression {
  return equation(
    `${left} ${leftSymbol} (${innerLeft} ${innerSymbol} ${innerRight}) = ?`,
    `${left} ${leftSpoken} open parenthesis ${innerLeft} ${innerSpoken} ${innerRight} close parenthesis equals unknown`,
  );
}

function equation(display: string, spoken: string): StudentMathExpression {
  return {
    kind: "equation",
    lines: [{ heading: null, display, spoken }],
  };
}

function operandNumbers(operands: readonly UsedValue[]): string[] | null {
  const terms = operands.map((operand) => formatMathNumber(operand.value));
  if (terms.some((term) => term === null)) return null;
  return terms as string[];
}

function stepTermNumbers(
  step: ArithmeticStep,
  results: readonly { value: number; unit?: string }[],
): string[] | null {
  const terms: string[] = [];

  for (const operand of step.operands) {
    const value = stepOperandValue(operand, results);
    const formatted = value === null ? null : formatMathNumber(value);
    if (formatted === null) return null;
    terms.push(formatted);
  }

  return terms;
}

function stepOperandValue(
  operand: ComputationStepOperand,
  results: readonly { value: number; unit?: string }[],
): number | null {
  if (operand.kind === "value") {
    return isFiniteNumber(operand.value) ? operand.value : null;
  }

  const prior = results[operand.step];
  if (prior === undefined || !isFiniteNumber(prior.value)) return null;
  return prior.value;
}

function formatMathNumber(value: number): string | null {
  if (!isFiniteNumber(value)) return null;
  if (Object.is(value, -0)) return "0";
  if (Number.isInteger(value)) return String(value);

  const normalised = Number(value.toPrecision(12));
  if (!isFiniteNumber(normalised)) return null;
  return String(normalised);
}
