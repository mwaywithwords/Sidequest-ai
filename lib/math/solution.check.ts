/**
 * Deterministic solution-presentation checks.
 *
 * Run with: npx tsx lib/math/solution.check.ts
 *
 * These do not call a model. They format verified ComputationSchema
 * results into student-facing prose.
 */

import type { Computation, CorrectAnswer, UsedValue } from "@/lib/ai/schemas";
import { deterministicSolution } from "@/lib/math/solution";
import { solutionAgreesWithAnswer } from "@/lib/math/verify";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

function val(
  label: string,
  value: number,
  unit?: string,
): UsedValue {
  return unit === undefined
    ? { label, value, origin: "given_in_problem" }
    : { label, value, origin: "given_in_problem", unit };
}

function numberAnswer(value: number, unit?: string): CorrectAnswer {
  return unit === undefined
    ? { type: "number", value }
    : { type: "number", value, unit };
}

const walletAdd: Computation = {
  type: "arithmetic",
  operation: "add",
  operands: [val("starting dollars", 20, "dollars"), val("added dollars", 50, "dollars")],
};
const walletAddSolution = deterministicSolution(walletAdd, numberAnswer(70, "dollars"));
check(
  "wallet addition solution",
  walletAddSolution === "Add $20 and $50. $20 + $50 = $70." &&
    solutionAgreesWithAnswer(walletAddSolution ?? "", numberAnswer(70, "dollars")),
);

const walletSubtract: Computation = {
  type: "arithmetic",
  operation: "subtract",
  operands: [val("target dollars", 125, "dollars"), val("starting dollars", 70, "dollars")],
};
const walletSubtractSolution = deterministicSolution(
  walletSubtract,
  numberAnswer(55, "dollars"),
);
check(
  "wallet subtraction solution",
  walletSubtractSolution === "Subtract $70 from $125. $125 − $70 = $55.",
);

const walletMultiply: Computation = {
  type: "arithmetic",
  operation: "multiply",
  operands: [val("bills", 6), val("dollars on each bill", 5, "dollars")],
};
const walletMultiplySolution = deterministicSolution(
  walletMultiply,
  numberAnswer(30, "dollars"),
);
check(
  "wallet multiplication solution",
  walletMultiplySolution === "Multiply 6 by $5. 6 × $5 = $30.",
);

const sneakerMultiply: Computation = {
  type: "arithmetic",
  operation: "multiply",
  operands: [val("steps", 222), val("laps", 4)],
};
check(
  "sneaker multiplication solution",
  deterministicSolution(sneakerMultiply, numberAnswer(888)) ===
    "Multiply 222 by 4. 222 × 4 = 888.",
);

const cupDivision: Computation = {
  type: "division",
  operation: "quotient",
  dividend: val("total water", 1000, "mL"),
  divisor: val("cup amount", 250, "mL"),
};
check(
  "cup division solution groups thousands",
  deterministicSolution(cupDivision, numberAnswer(4)) ===
    "Divide 1,000 mL by 250 mL. 1,000 mL ÷ 250 mL = 4.",
);

const bottleSubtract: Computation = {
  type: "arithmetic",
  operation: "subtract",
  operands: [
    val("printed bottle volume", 11, "fl oz"),
    val("amount poured out", 4, "fl oz"),
  ],
};
check(
  "protein bottle subtraction solution",
  deterministicSolution(bottleSubtract, numberAnswer(7, "fl oz")) ===
    "Subtract 4 fl oz from 11 fl oz. 11 fl oz − 4 fl oz = 7 fl oz.",
);

const fractionOf: Computation = {
  type: "fraction_of",
  quantity: val("dollars", 80, "dollars"),
  numerator: 1,
  denominator: 4,
};
check(
  "fraction-of solution",
  deterministicSolution(fractionOf, numberAnswer(20, "dollars")) ===
    "Find 1/4 of $80. 1/4 × $80 = $20.",
);

const fractionRemaining: Computation = {
  type: "fraction_remaining",
  totalParts: val("quarters", 4),
  usedParts: val("quarters finished", 1),
  simplify: true,
};
const remainingSolution = deterministicSolution(fractionRemaining, {
  type: "fraction",
  numerator: 3,
  denominator: 4,
});
check(
  "fraction-remaining solution",
  remainingSolution ===
    "Take 1 from 4. 4 − 1 = 3 remaining parts, so 3/4.",
);

const multiStep: Computation = {
  type: "multi_step_arithmetic",
  steps: [
    {
      operation: "add",
      operands: [
        { kind: "value", ...val("starting dollars", 50, "dollars") },
        { kind: "value", ...val("added dollars", 20, "dollars") },
      ],
    },
    {
      operation: "subtract",
      operands: [
        { kind: "value", ...val("target dollars", 125, "dollars") },
        { kind: "step_result", step: 0 },
      ],
    },
  ],
};
check(
  "multi-step wallet solution explains each step",
  deterministicSolution(multiStep, numberAnswer(55, "dollars")) ===
    "Add $50 and $20. $50 + $20 = $70. Subtract $70 from $125. $125 − $70 = $55.",
);

check(
  "geometry is not rewritten",
  deterministicSolution(
    {
      type: "geometry",
      operation: "perimeter",
      shape: "square",
      dimensions: [val("side", 4, "in")],
    },
    numberAnswer(16, "in"),
  ) === null,
);

check(
  "shape identify is not rewritten",
  deterministicSolution(
    { type: "shape_identify", aspect: "plane", label: "rectangle" },
    { type: "choice", value: "rectangle", set: "plane" },
  ) === null,
);

if (failed > 0) {
  console.error(`\n${failed} solution check(s) failed`);
  process.exit(1);
}

console.log("\nall solution checks passed");
