/**
 * Deterministic student math-expression checks.
 *
 * Run with: npx tsx lib/math/expression.check.ts
 *
 * These do not call a model. They format verified ComputationSchema
 * values and confirm the board cannot disagree with evaluation or
 * leak the stored answer.
 */

import type { Computation, UsedValue } from "@/lib/ai/schemas";
import { evaluateComputation } from "@/lib/math/evaluate";
import {
  presentMathExpression,
  spokenMathExpression,
  type StudentMathExpression,
} from "@/lib/math/expression";

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
  origin: UsedValue["origin"] = "given_in_problem",
  unit?: string,
): UsedValue {
  return unit === undefined
    ? { label, value, origin }
    : { label, value, origin, unit };
}

function single(expression: StudentMathExpression): {
  display: string;
  spoken: string;
} | null {
  if (expression.kind !== "equation" || expression.lines.length !== 1) {
    return null;
  }
  const line = expression.lines[0];
  if (line === undefined || line.heading !== null) return null;
  return { display: line.display, spoken: line.spoken };
}

function serialized(expression: StudentMathExpression): string {
  return JSON.stringify(expression);
}

function leaksAnswer(
  expression: StudentMathExpression,
  computation: Computation,
): boolean {
  const evaluated = evaluateComputation(computation);
  if (!evaluated.ok) return true;

  const blob = serialized(expression);
  const answer = evaluated.answer;

  if (answer.type === "number") {
    return (
      blob.includes(`=${answer.value}`) ||
      blob.includes(`= ${answer.value}`) ||
      blob.includes(`equals ${answer.value}`)
    );
  }

  if (answer.type === "fraction") {
    return (
      blob.includes(`${answer.numerator}/${answer.denominator}`) ||
      blob.includes(`equals ${answer.numerator}`)
    );
  }

  return blob.includes(answer.value);
}

const addition = {
  type: "arithmetic" as const,
  operation: "add" as const,
  operands: [val("left", 35), val("right", 40)],
};
const additionView = presentMathExpression(addition);
const additionLine = single(additionView);

check(
  "addition renders 35 + 40 = ?",
  additionLine?.display === "35 + 40 = ?" &&
    additionLine.spoken === "35 plus 40 equals unknown",
);

const subtraction = {
  type: "arithmetic" as const,
  operation: "subtract" as const,
  operands: [val("start", 125), val("taken", 70)],
};
const subtractionLine = single(presentMathExpression(subtraction));

check(
  "subtraction renders 125 − 70 = ?",
  subtractionLine?.display === "125 − 70 = ?" &&
    subtractionLine.spoken === "125 minus 70 equals unknown",
);

const multiplication = {
  type: "arithmetic" as const,
  operation: "multiply" as const,
  operands: [val("volume", 222, "observed", "mL"), val("cans", 4)],
};
const multiplicationLine = single(presentMathExpression(multiplication));

check(
  "multiplication renders 222 × 4 = ?",
  multiplicationLine?.display === "222 × 4 = ?" &&
    multiplicationLine.spoken === "222 times 4 equals unknown",
);

const division = {
  type: "division" as const,
  operation: "quotient" as const,
  dividend: val("total", 60),
  divisor: val("groups", 4),
};
const divisionLine = single(presentMathExpression(division));

check(
  "division renders 60 ÷ 4 = ?",
  divisionLine?.display === "60 ÷ 4 = ?" &&
    divisionLine.spoken === "60 divided by 4 equals unknown",
);

const fractionOf = {
  type: "fraction_of" as const,
  quantity: val("whole", 80),
  numerator: 1,
  denominator: 4,
};
const fractionLine = single(presentMathExpression(fractionOf));

check(
  "fraction-of renders 1/4 × 80 = ?",
  fractionLine?.display === "1/4 × 80 = ?" &&
    fractionLine.spoken === "1 over 4 times 80 equals unknown",
);

const remaining = {
  type: "fraction_remaining" as const,
  totalParts: val("slices", 8, "observed"),
  usedParts: val("eaten", 3),
  simplify: true,
};
const remainingLine = single(presentMathExpression(remaining));

check(
  "fraction-remaining keeps parts symbolic and hides the simplified answer",
  remainingLine?.display === "(8 − 3)/8 = ?" &&
    remainingLine.spoken ===
      "open parenthesis 8 minus 3 close parenthesis over 8 equals unknown" &&
    !leaksAnswer(presentMathExpression(remaining), remaining),
);

const multiStep: Computation = {
  type: "multi_step_arithmetic",
  steps: [
    {
      operation: "add",
      operands: [
        { kind: "value", ...val("starting", 50) },
        { kind: "value", ...val("added", 20) },
      ],
    },
    {
      operation: "subtract",
      operands: [
        { kind: "value", ...val("target", 125) },
        { kind: "step_result", step: 0 },
      ],
    },
  ],
};
const multiView = presentMathExpression(multiStep);

check(
  "multi-step shows the derived intermediate and hides the final answer",
  multiView.kind === "equation" &&
    multiView.lines.length === 2 &&
    multiView.lines[0]?.heading === "STEP 1" &&
    multiView.lines[0]?.display === "50 + 20 = 70" &&
    multiView.lines[0]?.spoken === "Step 1: 50 plus 20 equals 70" &&
    multiView.lines[1]?.heading === "STEP 2" &&
    multiView.lines[1]?.display === "125 − 70 = ?" &&
    multiView.lines[1]?.spoken === "Step 2: 125 minus 70 equals unknown" &&
    spokenMathExpression(multiView) ===
      "Step 1: 50 plus 20 equals 70. Step 2: 125 minus 70 equals unknown",
);

check(
  "multi-step does not leak 55",
  multiView.kind === "equation" && !serialized(multiView).includes("55"),
);

const measuredSubtract = {
  type: "arithmetic" as const,
  operation: "subtract" as const,
  operands: [
    val("printed bottle volume", 11, "observed", "fl oz"),
    val("amount poured out", 4, "given_in_problem", "fl oz"),
  ],
};
const measuredLine = single(presentMathExpression(measuredSubtract));

check(
  "measurement arithmetic uses the verified numbers and drops units from the board",
  measuredLine?.display === "11 − 4 = ?" &&
    !serialized(presentMathExpression(measuredSubtract)).includes("fl oz") &&
    !serialized(presentMathExpression(measuredSubtract)).includes("observed"),
);

const conversion = {
  type: "conversion" as const,
  operation: "multiply" as const,
  value: val("litres", 3, "observed", "l"),
  factor: val("millilitres in a litre", 1000, "given_in_problem"),
};
const conversionLine = single(presentMathExpression(conversion));

check(
  "conversion multiply renders 3 × 1000 = ?",
  conversionLine?.display === "3 × 1000 = ?" &&
    conversionLine.spoken === "3 times 1000 equals unknown" &&
    !leaksAnswer(presentMathExpression(conversion), conversion),
);

const conversionDivide = {
  type: "conversion" as const,
  operation: "divide" as const,
  value: val("millilitres", 2000, "observed", "ml"),
  factor: val("millilitres in a litre", 1000, "given_in_problem"),
};

check(
  "conversion divide renders 2000 ÷ 1000 = ?",
  single(presentMathExpression(conversionDivide))?.display === "2000 ÷ 1000 = ?",
);

const rectangleArea = {
  type: "geometry" as const,
  operation: "area" as const,
  shape: "rectangle" as const,
  dimensions: [
    val("pane width", 12, "observed", "in"),
    val("pane height", 18, "observed", "in"),
  ],
};

check(
  "measured rectangle area uses the verified dimensions",
  single(presentMathExpression(rectangleArea))?.display === "12 × 18 = ?",
);

const rectanglePerimeter = {
  type: "geometry" as const,
  operation: "perimeter" as const,
  shape: "rectangle" as const,
  dimensions: [
    val("pane width", 12, "observed", "in"),
    val("pane height", 18, "observed", "in"),
  ],
};
const perimeterLine = single(presentMathExpression(rectanglePerimeter));

check(
  "measured rectangle perimeter matches the evaluator formula",
  perimeterLine?.display === "2 × (12 + 18) = ?" &&
    perimeterLine.spoken ===
      "2 times open parenthesis 12 plus 18 close parenthesis equals unknown",
);

const squarePerimeter = {
  type: "geometry" as const,
  operation: "perimeter" as const,
  shape: "square" as const,
  dimensions: [val("side", 6, "observed", "cm")],
};

check(
  "measured square perimeter is 4 × side",
  single(presentMathExpression(squarePerimeter))?.display === "4 × 6 = ?",
);

const triangleArea = {
  type: "geometry" as const,
  operation: "area" as const,
  shape: "triangle" as const,
  dimensions: [val("base", 6, "observed", "cm"), val("height", 4, "observed", "cm")],
};

check(
  "measured triangle area is (base × height) ÷ 2",
  single(presentMathExpression(triangleArea))?.display === "(6 × 4) ÷ 2 = ?",
);

const qualitative: Computation = {
  type: "shape_identify",
  aspect: "solid",
  label: "sphere",
};

check(
  "qualitative geometry does not force an equation",
  presentMathExpression(qualitative).kind === "none" &&
    spokenMathExpression(presentMathExpression(qualitative)) === "",
);

const faces: Computation = {
  type: "shape_count",
  shape: "rectangular prism",
  feature: "faces",
};

check(
  "structure geometry does not invent an equation",
  presentMathExpression(faces).kind === "none",
);

const inventedDimensions: Computation = {
  type: "geometry",
  operation: "area",
  shape: "rectangle",
  dimensions: [val("only width", 12, "observed", "in")],
};

check(
  "measured geometry without the required dimensions fails safely",
  presentMathExpression(inventedDimensions).kind === "none",
);

check(
  "addition does not leak 75",
  !leaksAnswer(additionView, addition),
);

check(
  "multiplication does not leak 888",
  !leaksAnswer(presentMathExpression(multiplication), multiplication) &&
    !serialized(presentMathExpression(multiplication)).includes("888"),
);

const remainderDiv = {
  type: "division" as const,
  operation: "remainder" as const,
  dividend: val("total", 17),
  divisor: val("groups", 5),
};

check(
  "remainder division still hides the leftover",
  single(presentMathExpression(remainderDiv))?.display === "17 ÷ 5 = ?" &&
    !leaksAnswer(presentMathExpression(remainderDiv), remainderDiv),
);

const unsupported = presentMathExpression({
  type: "not_a_computation",
} as unknown as Computation);

check("unsupported computation fails safely", unsupported.kind === "none");

const invalid = presentMathExpression({
  type: "arithmetic",
  operation: "add",
  operands: [val("broken", Number.NaN), val("right", 4)],
});

check("invalid values fail safely", invalid.kind === "none");

check(
  "presentation never includes origins or generation keys",
  !serialized(additionView).includes("observed") &&
    !serialized(additionView).includes("student_provided") &&
    !serialized(additionView).includes("contextual") &&
    !serialized(additionView).includes("given_in_problem") &&
    !serialized(additionView).includes("correctAnswer") &&
    !serialized(additionView).includes("correct_answer") &&
    !serialized(additionView).includes("computation") &&
    !serialized(multiView).includes("step_result"),
);

check(
  "a three-operand sum stays left to right",
  single(
    presentMathExpression({
      type: "arithmetic",
      operation: "add",
      operands: [val("a", 10), val("b", 20), val("c", 30)],
    }),
  )?.display === "10 + 20 + 30 = ?",
);

check(
  "whole-groups division uses the same student expression as a quotient",
  single(
    presentMathExpression({
      type: "division",
      operation: "whole_groups",
      dividend: val("ounces", 128, "given_in_problem", "fl oz"),
      divisor: val("can", 12, "observed", "fl oz"),
    }),
  )?.display === "128 ÷ 12 = ?",
);

if (failed > 0) {
  console.error(`\n${failed} math-expression checks failed`);
  process.exit(1);
}

console.log("\nall math-expression checks passed");
