/**
 * Deterministic verification checks.
 *
 * Run with: npx tsx lib/math/verify.check.ts
 *
 * These do not call a model. They evaluate ComputationSchema in
 * TypeScript and check that a wrong generated answer cannot pass.
 */

import type {
  GeneratedChallenge,
  ObjectAnalysis,
  ReadySkillFit,
  UsedValue,
} from "@/lib/ai/schemas";
import { evaluateComputation, simplifyFraction } from "@/lib/math/evaluate";
import { unitsCompatible } from "@/lib/math/units";
import {
  answersAgree,
  guidanceForFailure,
  planAfterVerification,
  solutionAgreesWithAnswer,
  verifyChallenge,
} from "@/lib/math/verify";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

const bottle: ObjectAnalysis = {
  objectName: "protein shake bottle",
  category: "packaged beverage",
  brand: "Premier Protein",
  confidence: 0.92,
  visibleText: ["Premier Protein", "11 FL OZ"],
  visibleMeasurements: [
    { value: 11, unit: "fl oz", label: "printed bottle volume" },
  ],
  countableProperties: [],
  shapeProperties: ["rectangular carton with a screw cap"],
  observableProperties: ["purple plastic cap"],
};

const sneaker: ObjectAnalysis = {
  objectName: "sneaker",
  category: "footwear",
  confidence: 0.84,
  visibleText: [],
  visibleMeasurements: [],
  countableProperties: ["8 visible eyelets"],
  shapeProperties: ["curved sole"],
  observableProperties: ["worn fabric"],
};

const windowPane: ObjectAnalysis = {
  objectName: "window",
  category: "household",
  confidence: 0.9,
  visibleText: [],
  visibleMeasurements: [
    { value: 12, unit: "in", label: "pane width" },
    { value: 18, unit: "in", label: "pane height" },
  ],
  countableProperties: ["6 rectangular panes"],
  shapeProperties: ["rectangular panes"],
  observableProperties: ["clear glass"],
};

const pizza: ObjectAnalysis = {
  objectName: "pizza",
  category: "food",
  confidence: 0.88,
  visibleText: [],
  visibleMeasurements: [],
  countableProperties: ["8 equal slices"],
  shapeProperties: ["circular pizza cut through the centre"],
  observableProperties: ["cut into wedges"],
};

function fit(
  skill: ReadySkillFit["selectedSkillCode"],
  property: string,
): ReadySkillFit {
  return {
    selectedSkillCode: skill,
    fitScore: 0.8,
    challengeMode: "object_math",
    canGenerateChallenge: true,
    usableProperties: [property],
    reason: "A grounded path exists.",
    suggestedObjectCharacteristics: [],
    alternativeSkillCodes: [],
    anchors: [{ property, origin: "observed" }],
    evidenceRequest: null,
    inspirationContext: null,
  };
}

function val(
  label: string,
  value: number,
  origin: UsedValue["origin"],
  unit?: string,
): UsedValue {
  return unit === undefined
    ? { label, value, origin }
    : { label, value, origin, unit };
}

function challenge(
  overrides: Partial<GeneratedChallenge> &
    Pick<
      GeneratedChallenge,
      "question" | "skillCode" | "correctAnswer" | "computation" | "valuesUsed"
    >,
): GeneratedChallenge {
  return {
    solution: "The calculation is shown here.",
    hint1: "Use the number from the object.",
    hint2: "Perform the operation.",
    difficulty: 2,
    objectConnection: "Your object shows a real number we can use.",
    verificationStrategy: "Evaluate the structured computation.",
    ...overrides,
  };
}

function verify(
  built: GeneratedChallenge,
  analysis: ObjectAnalysis,
  skill: ReadySkillFit["selectedSkillCode"],
  property: string,
  grade: 3 | 4 | 5 = 4,
) {
  return verifyChallenge({
    challenge: built,
    analysis,
    fit: fit(skill, property),
    skillId: skill,
    grade,
  });
}

const volume = val("printed bottle volume", 11, "observed", "fl oz");
const poured = val("amount poured out", 4, "given_in_problem", "fl oz");
const eyelets = val("8 visible eyelets", 8, "observed");
const sneakers = val("number of sneakers", 4, "given_in_problem");
const width = val("pane width", 12, "observed", "in");
const height = val("pane height", 18, "observed", "in");
const slices = val("8 equal slices", 8, "observed");
const eaten = val("slices eaten", 3, "given_in_problem");

const bottleSubtract = challenge({
  question:
    "The bottle in your photo contains 11 fluid ounces. If 4 fluid ounces are poured out, how many fluid ounces remain?",
  skillCode: "subtraction",
  solution: "Start with 11 fluid ounces. Take away 4. 11 − 4 = 7 fl oz.",
  objectConnection:
    "Your bottle shows 11 fl oz, so that real measurement becomes the starting amount.",
  valuesUsed: [volume, poured],
  correctAnswer: { type: "number", value: 7, unit: "fl oz" },
  computation: {
    type: "arithmetic",
    operation: "subtract",
    operands: [volume, poured],
  },
});

const sneakerMultiply = challenge({
  question:
    "The sneaker in your photo has 8 visible eyelets. If 4 sneakers had the same number, how many eyelets would that be altogether?",
  skillCode: "multiplication",
  solution: "Each sneaker has 8 eyelets. 4 groups of 8 is 32.",
  objectConnection:
    "Your sneaker shows 8 eyelets, so that real count is the group we scale up.",
  valuesUsed: [eyelets, sneakers],
  correctAnswer: { type: "number", value: 32 },
  computation: {
    type: "arithmetic",
    operation: "multiply",
    operands: [eyelets, sneakers],
  },
});

const windowPerimeter = challenge({
  question:
    "One pane of the window in your photo is 12 inches wide and 18 inches tall. If you traced all the way around that pane, how many inches would you travel?",
  skillCode: "geometry",
  solution: "Two widths and two heights: 12 + 12 + 18 + 18 = 60 in.",
  objectConnection:
    "Your window pane is 12 inches by 18 inches, so those real measurements become the sides.",
  valuesUsed: [width, height],
  correctAnswer: { type: "number", value: 60, unit: "in" },
  computation: {
    type: "geometry",
    operation: "perimeter",
    shape: "rectangle",
    dimensions: [width, height],
  },
});

const pizzaFraction = challenge({
  question:
    "The pizza in your photo is cut into 8 equal slices. If you eat 3 slices, what fraction of the pizza is still in the box?",
  skillCode: "fractions",
  solution: "The whole pizza is 8 eighths. 3 slices are eaten, so 5/8 remain.",
  objectConnection:
    "Your pizza shows 8 equal slices, so that real count is the whole we break into eighths.",
  valuesUsed: [slices, eaten],
  correctAnswer: { type: "fraction", numerator: 5, denominator: 8 },
  computation: {
    type: "fraction_remaining",
    totalParts: slices,
    usedParts: eaten,
    simplify: false,
  },
});

// --- arithmetic ------------------------------------------------------------

const addEval = evaluateComputation({
  type: "arithmetic",
  operation: "add",
  operands: [
    val("left", 11, "observed", "fl oz"),
    val("right", 4, "given_in_problem", "fl oz"),
  ],
});
check(
  "correct addition",
  addEval.ok &&
    addEval.answer.type === "number" &&
    addEval.answer.value === 15,
);

const wrongAdd = verify(
  {
    ...bottleSubtract,
    skillCode: "addition",
    computation: {
      type: "arithmetic",
      operation: "add",
      operands: [volume, poured],
    },
    correctAnswer: { type: "number", value: 99, unit: "fl oz" },
    solution: "11 + 4 = 99 fl oz.",
    question:
      "The bottle in your photo contains 11 fluid ounces. If 4 more fluid ounces are added, how many is that?",
  },
  bottle,
  "addition",
  "printed bottle volume: 11 fl oz",
);
check(
  "wrong addition is rejected",
  !wrongAdd.ok && wrongAdd.reason === "incorrect_answer",
);

const subtractEval = evaluateComputation({
  type: "arithmetic",
  operation: "subtract",
  operands: [volume, poured],
});
check(
  "subtraction 11 − 4 = 7",
  subtractEval.ok &&
    subtractEval.answer.type === "number" &&
    subtractEval.answer.value === 7,
);

const multiplyEval = evaluateComputation({
  type: "arithmetic",
  operation: "multiply",
  operands: [eyelets, sneakers],
});
check(
  "multiplication 8 × 4 = 32",
  multiplyEval.ok &&
    multiplyEval.answer.type === "number" &&
    multiplyEval.answer.value === 32,
);

const negative = verify(
  {
    ...bottleSubtract,
    computation: {
      type: "arithmetic",
      operation: "subtract",
      operands: [poured, volume],
    },
    valuesUsed: [poured, volume],
    correctAnswer: { type: "number", value: -7, unit: "fl oz" },
    solution: "4 − 11 = -7 fl oz.",
    question:
      "The bottle in your photo contains 11 fluid ounces. If 4 fluid ounces start a subtraction the wrong way, how many remain?",
  },
  bottle,
  "subtraction",
  "printed bottle volume: 11 fl oz",
  3,
);
check(
  "negative-result rejected for grade 3",
  !negative.ok && negative.reason === "grade_inappropriate",
);

// --- division --------------------------------------------------------------

const exact = evaluateComputation({
  type: "division",
  operation: "quotient",
  dividend: val("eggs", 12, "observed"),
  divisor: val("groups", 3, "given_in_problem"),
});
check(
  "exact quotient 12 ÷ 3 = 4",
  exact.ok && exact.answer.type === "number" && exact.answer.value === 4,
);

const groups = evaluateComputation({
  type: "division",
  operation: "whole_groups",
  dividend: val("ounces", 128, "given_in_problem", "fl oz"),
  divisor: val("can", 12, "observed", "fl oz"),
});
check(
  "whole groups 128 ÷ 12 = 10",
  groups.ok && groups.answer.type === "number" && groups.answer.value === 10,
);

const remainder = evaluateComputation({
  type: "division",
  operation: "remainder",
  dividend: val("ounces", 128, "given_in_problem", "fl oz"),
  divisor: val("can", 12, "observed", "fl oz"),
});
check(
  "remainder 128 ÷ 12 = 8",
  remainder.ok &&
    remainder.answer.type === "number" &&
    remainder.answer.value === 8,
);

const divideZero = evaluateComputation({
  type: "division",
  operation: "quotient",
  dividend: val("eggs", 12, "observed"),
  divisor: val("groups", 0, "given_in_problem"),
});
check(
  "division by zero is rejected",
  !divideZero.ok && divideZero.reason === "invalid_values",
);

// --- fractions -------------------------------------------------------------

const halfOf = evaluateComputation({
  type: "fraction_of",
  quantity: val("eggs", 12, "observed"),
  numerator: 1,
  denominator: 2,
});
check(
  "fraction_of 1/2 of 12 = 6",
  halfOf.ok && halfOf.answer.type === "number" && halfOf.answer.value === 6,
);

const remaining = evaluateComputation({
  type: "fraction_remaining",
  totalParts: slices,
  usedParts: eaten,
  simplify: false,
});
check(
  "fraction_remaining 8 − 3 = 5/8",
  remaining.ok &&
    remaining.answer.type === "fraction" &&
    remaining.answer.numerator === 5 &&
    remaining.answer.denominator === 8,
);

const equivalent = answersAgree(
  { type: "fraction", numerator: 2, denominator: 4 },
  { type: "fraction", numerator: 1, denominator: 2 },
);
check("equivalent fractions 2/4 and 1/2 agree", equivalent);

const zeroDen = evaluateComputation({
  type: "fraction_of",
  quantity: val("eggs", 12, "observed"),
  numerator: 1,
  denominator: 0,
});
check(
  "zero denominator is rejected",
  !zeroDen.ok && zeroDen.reason === "invalid_values",
);

check(
  "simplifyFraction reduces 2/4 to 1/2",
  simplifyFraction(2, 4).numerator === 1 &&
    simplifyFraction(2, 4).denominator === 2,
);

// --- conversion ------------------------------------------------------------

const gallons = val("gallons", 1, "given_in_problem", "gal");
const factor = val("fl oz per gallon", 128, "given_in_problem");
const convert = evaluateComputation({
  type: "conversion",
  operation: "multiply",
  value: gallons,
  factor,
});
check(
  "valid explicit conversion 1 × 128 = 128",
  convert.ok && convert.answer.type === "number" && convert.answer.value === 128,
);

const convertWrong = {
  ...challenge({
    question:
      "The bottle in your photo contains 11 fluid ounces. If 1 gallon = 128 fluid ounces, how many gallons is the bottle?",
    skillCode: "measurement",
    solution: "11 ÷ 128 = 2 gallons.",
    objectConnection: "Your bottle shows 11 fl oz as the amount we convert.",
    valuesUsed: [
      volume,
      val("fl oz per gallon", 128, "given_in_problem"),
    ],
    correctAnswer: { type: "number", value: 2 },
    computation: {
      type: "conversion",
      operation: "divide",
      value: volume,
      factor: val("fl oz per gallon", 128, "given_in_problem"),
    },
  }),
};
const convertCheck = verify(
  convertWrong,
  bottle,
  "measurement",
  "printed bottle volume: 11 fl oz",
  5,
);
check(
  "wrong conversion result is rejected",
  !convertCheck.ok && convertCheck.reason === "incorrect_answer",
);

const zeroFactor = evaluateComputation({
  type: "conversion",
  operation: "divide",
  value: volume,
  factor: val("factor", 0, "given_in_problem"),
});
check(
  "zero conversion factor is rejected",
  !zeroFactor.ok && zeroFactor.reason === "invalid_values",
);

// --- geometry --------------------------------------------------------------

const peri = evaluateComputation({
  type: "geometry",
  operation: "perimeter",
  shape: "rectangle",
  dimensions: [width, height],
});
check(
  "rectangle perimeter 2×(12+18) = 60",
  peri.ok && peri.answer.type === "number" && peri.answer.value === 60,
);

const area = evaluateComputation({
  type: "geometry",
  operation: "area",
  shape: "rectangle",
  dimensions: [width, height],
});
check(
  "rectangle area 12×18 = 216",
  area.ok && area.answer.type === "number" && area.answer.value === 216,
);

const missingDim = evaluateComputation({
  type: "geometry",
  operation: "perimeter",
  shape: "rectangle",
  dimensions: [width],
});
check(
  "missing geometry dimension is rejected",
  !missingDim.ok && missingDim.reason === "invalid_values",
);

const wrongPeri = verify(
  {
    ...windowPerimeter,
    correctAnswer: { type: "number", value: 30, unit: "in" },
    solution: "12 + 18 = 30 in.",
  },
  windowPane,
  "geometry",
  "pane width",
);
check(
  "wrong geometry answer is rejected",
  !wrongPeri.ok && wrongPeri.reason === "incorrect_answer",
);

// --- grounding -------------------------------------------------------------

const bottleOk = verify(
  bottleSubtract,
  bottle,
  "subtraction",
  "printed bottle volume: 11 fl oz",
);
check("observed 11 fl oz matches ObjectAnalysis", bottleOk.ok);

const invented = verify(
  {
    ...bottleSubtract,
    valuesUsed: [
      val("printed bottle volume", 12, "observed", "fl oz"),
      poured,
    ],
    computation: {
      type: "arithmetic",
      operation: "subtract",
      operands: [val("printed bottle volume", 12, "observed", "fl oz"), poured],
    },
    correctAnswer: { type: "number", value: 8, unit: "fl oz" },
    question:
      "The bottle in your photo contains 12 fluid ounces. If 4 fluid ounces are poured out, how many remain?",
  },
  bottle,
  "subtraction",
  "printed bottle volume: 11 fl oz",
);
check(
  "invented observed 12 fl oz is rejected",
  !invented.ok && invented.reason === "ungrounded_value",
);

const unused = verify(
  {
    ...bottleSubtract,
    skillCode: "addition",
    question:
      "The bottle in your photo is interesting. If you had 4 bottles and 3 more, how many is that?",
    valuesUsed: [
      volume,
      val("bottles", 4, "given_in_problem"),
      val("more", 3, "given_in_problem"),
    ],
    computation: {
      type: "arithmetic",
      operation: "add",
      operands: [
        val("bottles", 4, "given_in_problem"),
        val("more", 3, "given_in_problem"),
      ],
    },
    correctAnswer: { type: "number", value: 7 },
    solution: "4 + 3 = 7.",
    objectConnection: "Your bottle shows 11 fl oz.",
  },
  bottle,
  "addition",
  "printed bottle volume: 11 fl oz",
);
check(
  "grounded value not used in computation is rejected",
  !unused.ok && unused.reason === "ungrounded_value",
);

const fakeStudent = verifyChallenge({
  challenge: {
    ...bottleSubtract,
    valuesUsed: [
      val("shoe size", 7, "student_provided"),
      poured,
    ],
    computation: {
      type: "arithmetic",
      operation: "subtract",
      operands: [val("shoe size", 7, "student_provided"), poured],
    },
    question:
      "You measured the bottle in your photo. If the size is 7 and 4 are poured out, how many remain?",
  },
  analysis: bottle,
  fit: fit("subtraction", "printed bottle volume: 11 fl oz"),
  skillId: "subtraction",
  grade: 4,
  studentEvidence: [],
});
check(
  "student_provided without persisted evidence is rejected",
  !fakeStudent.ok && fakeStudent.reason === "ungrounded_value",
);

// --- units -----------------------------------------------------------------

check("compatible units: fl oz and FL OZ", unitsCompatible("fl oz", "FL OZ"));
check("incompatible units: fl oz and inches", !unitsCompatible("fl oz", "in"));

const mixedUnits = evaluateComputation({
  type: "arithmetic",
  operation: "subtract",
  operands: [
    val("volume", 11, "observed", "fl oz"),
    val("length", 4, "given_in_problem", "in"),
  ],
});
check(
  "incompatible arithmetic units are rejected",
  !mixedUnits.ok && mixedUnits.reason === "unit_mismatch",
);

const wrongUnit = verify(
  {
    ...bottleSubtract,
    correctAnswer: { type: "number", value: 7, unit: "in" },
  },
  bottle,
  "subtraction",
  "printed bottle volume: 11 fl oz",
);
check(
  "wrong answer unit is rejected",
  !wrongUnit.ok && wrongUnit.reason === "incorrect_answer",
);

// --- skills ----------------------------------------------------------------

const sneakerOk = verify(
  sneakerMultiply,
  sneaker,
  "multiplication",
  "8 visible eyelets",
);
check("multiplication computation aligns with multiplication skill", sneakerOk.ok);

const pizzaOk = verify(pizzaFraction, pizza, "fractions", "8 equal slices");
check("fraction computation aligns with fractions skill", pizzaOk.ok);

const mismatch = verify(
  {
    ...sneakerMultiply,
    skillCode: "fractions",
  },
  sneaker,
  "fractions",
  "8 visible eyelets",
);
check(
  "multiplication computation labelled fractions is rejected",
  !mismatch.ok && mismatch.reason === "skill_mismatch",
);

// --- grade -----------------------------------------------------------------

const grade3Ok = verify(
  bottleSubtract,
  bottle,
  "subtraction",
  "printed bottle volume: 11 fl oz",
  3,
);
check("Grade 3 appropriate remaining-amount problem passes", grade3Ok.ok);

const grade3Area = verify(
  {
    ...windowPerimeter,
    computation: {
      type: "geometry",
      operation: "area",
      shape: "rectangle",
      dimensions: [width, height],
    },
    correctAnswer: { type: "number", value: 216, unit: "in" },
    solution: "12 × 18 = 216 in.",
  },
  windowPane,
  "geometry",
  "pane width",
  3,
);
check(
  "Grade 3 area problem is rejected",
  !grade3Area.ok && grade3Area.reason === "grade_inappropriate",
);

const grade4Ok = verify(
  windowPerimeter,
  windowPane,
  "geometry",
  "pane width",
  4,
);
check("Grade 4 appropriate perimeter passes", grade4Ok.ok);

const bottleForm: ObjectAnalysis = {
  objectName: "protein bottle",
  category: "bottle",
  confidence: 0.9,
  visibleText: [],
  visibleMeasurements: [],
  countableProperties: [],
  shapeProperties: ["cylinder-like body", "circular top"],
  observableProperties: [],
};

const bottleIdentify = challenge({
  question: "What 3D shape is your protein bottle most like?",
  skillCode: "geometry",
  solution: "The bottle is most like a cylinder.",
  objectConnection:
    "Your protein bottle has a cylinder-like body, so that form is the 3D shape we name.",
  valuesUsed: [],
  shapesUsed: [
    {
      label: "bottle body",
      form: "cylinder",
      aspect: "solid",
      origin: "observed",
    },
  ],
  correctAnswer: { type: "choice", value: "cylinder", set: "solid" },
  computation: {
    type: "shape_identify",
    aspect: "solid",
    label: "cylinder",
  },
});

const bottleIdentifyOk = verify(
  bottleIdentify,
  bottleForm,
  "geometry",
  "cylinder-like body",
  3,
);
check(
  "qualitative cylinder identification verifies without a measurement",
  bottleIdentifyOk.ok,
);

const grade5Ok = verify(
  bottleSubtract,
  bottle,
  "subtraction",
  "printed bottle volume: 11 fl oz",
  5,
);
check("Grade 5 appropriate subtraction passes", grade5Ok.ok);

// --- object connection -----------------------------------------------------

const windowOk = verify(
  windowPerimeter,
  windowPane,
  "geometry",
  "pane width",
);
check("meaningful grounded objectConnection passes", windowOk.ok);

const generic = verify(
  {
    ...bottleSubtract,
    objectConnection: "This question is about your object.",
  },
  bottle,
  "subtraction",
  "printed bottle volume: 11 fl oz",
);
check(
  "generic objectConnection is rejected",
  !generic.ok && generic.reason === "weak_object_connection",
);

// --- solution consistency --------------------------------------------------

check(
  "solution containing 7 fl oz agrees",
  solutionAgreesWithAnswer("11 − 4 = 7 fl oz.", {
    type: "number",
    value: 7,
    unit: "fl oz",
  }),
);
check(
  "solution missing the answer is a mismatch",
  !solutionAgreesWithAnswer("Just subtract the numbers.", {
    type: "number",
    value: 7,
    unit: "fl oz",
  }),
);

const silentSolution = verify(
  {
    ...bottleSubtract,
    solution: "Look at the bottle and think about it.",
  },
  bottle,
  "subtraction",
  "printed bottle volume: 11 fl oz",
);
check(
  "solution that omits the verified answer is rejected",
  !silentSolution.ok && silentSolution.reason === "solution_mismatch",
);

// --- regeneration planning -------------------------------------------------

const pass = { ok: true as const, computedAnswer: { type: "number" as const, value: 7 } };
const failFirst = {
  ok: false as const,
  reason: "incorrect_answer" as const,
  detail: "wrong",
};

check(
  "first fail plans a regeneration",
  planAfterVerification(1, failFirst) === "regenerate",
);
check(
  "second fail gives up — no third attempt",
  planAfterVerification(2, failFirst) === "give_up",
);
check(
  "first pass is accepted",
  planAfterVerification(1, pass) === "accept",
);
check(
  "second pass is accepted",
  planAfterVerification(2, pass) === "accept",
);
check(
  "incorrect_answer guidance mentions recomputing",
  guidanceForFailure("incorrect_answer").includes("recompute"),
);
check(
  "ungrounded_value guidance mentions ObjectAnalysis",
  guidanceForFailure("ungrounded_value").includes("ObjectAnalysis"),
);
check(
  "unit_mismatch guidance mentions units",
  guidanceForFailure("unit_mismatch").toLowerCase().includes("unit"),
);

// --- integrated product examples -------------------------------------------

check("bottle + subtraction verifies", bottleOk.ok);
check("sneaker + multiplication verifies", sneakerOk.ok);
check("window + perimeter verifies", windowOk.ok);
check("pizza + fractions verifies", pizzaOk.ok);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log("\nall verification checks passed");
