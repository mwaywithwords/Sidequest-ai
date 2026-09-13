/**
 * Decision and schema checks for Challenge Generation.
 *
 * Run with: npx tsx lib/ai/challenge-grounding.check.ts
 *
 * These do not call a model. They prove the four product examples ground,
 * that invented object facts are not repaired, and that ChallengeSchema
 * now requires origins plus a structured computation.
 */

import {
  type ChallengeContext,
  finalizeChallenge,
  hasGroundedAnchor,
  objectConnectionCitesAnchor,
  refersToObject,
  targetDifficulty,
  type WireChallenge,
} from "@/lib/ai/challenge-grounding";
import {
  ChallengeSchema,
  type ObjectAnalysis,
  type ReadySkillFit,
  UsedValueSchema,
} from "@/lib/ai/schemas";

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

function readyFit(
  skill: ReadySkillFit["selectedSkillCode"],
  mode: ReadySkillFit["challengeMode"],
  property: string,
): ReadySkillFit {
  return {
    selectedSkillCode: skill,
    fitScore: 0.8,
    challengeMode: mode,
    canGenerateChallenge: true,
    usableProperties: [property],
    reason: "A grounded path exists.",
    suggestedObjectCharacteristics: [],
    alternativeSkillCodes: [],
    anchors: [{ property, origin: "observed" }],
    evidenceRequest: null,
  };
}

function context(
  analysis: ObjectAnalysis,
  fit: ReadySkillFit,
): ChallengeContext {
  return {
    analysis,
    fit,
    skillId: fit.selectedSkillCode,
    grade: 4,
    studentEvidence: [],
  };
}

function operand(
  label: string,
  value: number,
  origin: "observed" | "student_provided" | "given_in_problem",
  unit: string | null = null,
) {
  return { label, value, unit, origin };
}

function baseWire(overrides: Partial<WireChallenge> = {}): WireChallenge {
  return {
    canGenerate: true,
    question:
      "The bottle in your photo contains 11 fluid ounces. If 4 fluid ounces are poured out, how many fluid ounces remain?",
    skillCode: "subtraction",
    solution: "Start with 11 fluid ounces. Take away 4. 11 − 4 = 7 fluid ounces.",
    hint1: "The label tells you how much the bottle held to start with.",
    hint2: "Take the amount poured out away from 11.",
    difficulty: 2,
    objectConnection:
      "Your bottle shows 11 fl oz, so that real measurement becomes the starting amount in the subtraction problem.",
    verificationStrategy:
      "Subtract the poured-out amount from the printed bottle volume.",
    valuesUsed: [
      operand("printed bottle volume", 11, "observed", "fl oz"),
      operand("amount poured out", 4, "given_in_problem", "fl oz"),
    ],
    correctAnswer: {
      type: "number",
      value: 7,
      numerator: null,
      denominator: null,
      unit: "fl oz",
    },
    computation: {
      type: "arithmetic",
      operation: "subtract",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("printed bottle volume", 11, "observed", "fl oz"),
        operand("amount poured out", 4, "given_in_problem", "fl oz"),
      ],
    },
    ...overrides,
  };
}

const bottleFit = readyFit(
  "subtraction",
  "grounded_scenario",
  "printed bottle volume: 11 fl oz",
);
const sneakerFit = readyFit(
  "multiplication",
  "grounded_scenario",
  "8 visible eyelets",
);
const windowFit = readyFit("geometry", "direct", "pane width");
const pizzaFit = readyFit("fractions", "grounded_scenario", "8 equal slices");

// --- schema contract -------------------------------------------------------

check(
  "valuesUsed without origin is invalid",
  !UsedValueSchema.safeParse({
    label: "printed bottle volume",
    value: 11,
    unit: "fl oz",
  }).success,
);

check(
  "valuesUsed with origin is valid",
  UsedValueSchema.safeParse({
    label: "printed bottle volume",
    value: 11,
    unit: "fl oz",
    origin: "observed",
  }).success,
);

check(
  "ChallengeSchema rejects a challenge with no computation",
  !ChallengeSchema.safeParse({
    question: "How many remain?",
    skillCode: "subtraction",
    correctAnswer: { type: "number", value: 7, unit: "fl oz" },
    solution: "11 − 4 = 7",
    hint1: "Start with the label.",
    hint2: "Subtract.",
    difficulty: 2,
    objectConnection: "Your bottle shows 11 fl oz.",
    valuesUsed: [
      {
        label: "printed bottle volume",
        value: 11,
        unit: "fl oz",
        origin: "observed",
      },
    ],
    verificationStrategy: "subtract",
  }).success,
);

check(
  "correctAnswer as a bare number is invalid",
  !ChallengeSchema.safeParse({
    question: "How many remain?",
    skillCode: "subtraction",
    correctAnswer: 7,
    solution: "11 − 4 = 7",
    hint1: "Start with the label.",
    hint2: "Subtract.",
    difficulty: 2,
    objectConnection: "Your bottle shows 11 fl oz.",
    valuesUsed: [
      {
        label: "printed bottle volume",
        value: 11,
        unit: "fl oz",
        origin: "observed",
      },
    ],
    verificationStrategy: "subtract",
    computation: {
      type: "arithmetic",
      operation: "subtract",
      operands: [
        {
          label: "printed bottle volume",
          value: 11,
          unit: "fl oz",
          origin: "observed",
        },
        {
          label: "amount poured out",
          value: 4,
          unit: "fl oz",
          origin: "given_in_problem",
        },
      ],
    },
  }).success,
);

// --- product examples ------------------------------------------------------

const bottleChallenge = finalizeChallenge(
  baseWire(),
  context(bottle, bottleFit),
);
check(
  "bottle + subtraction grounded_scenario is accepted",
  bottleChallenge.status === "ok" &&
    bottleChallenge.challenge.skillCode === "subtraction" &&
    bottleChallenge.challenge.computation.type === "arithmetic" &&
    bottleChallenge.challenge.valuesUsed.some(
      (value) => value.origin === "observed" && value.value === 11,
    ) &&
    bottleChallenge.challenge.valuesUsed.some(
      (value) => value.origin === "given_in_problem" && value.value === 4,
    ),
);

const sneakerWire = baseWire({
  question:
    "The sneaker in your photo has 8 visible eyelets. If 4 sneakers had the same number of eyelets, how many eyelets would that be altogether?",
  skillCode: "multiplication",
  solution: "Each sneaker has 8 eyelets. 4 groups of 8 is 32.",
  hint1: "You already counted the eyelets on this sneaker.",
  hint2: "Multiply the 8 eyelets by the 4 sneakers.",
  objectConnection:
    "Your sneaker shows 8 eyelets, so that real count is the group we scale up.",
  verificationStrategy: "Multiply the observed eyelet count by 4.",
  valuesUsed: [
    operand("8 visible eyelets", 8, "observed"),
    operand("number of sneakers", 4, "given_in_problem"),
  ],
  correctAnswer: {
    type: "number",
    value: 32,
    numerator: null,
    denominator: null,
    unit: null,
  },
  computation: {
    type: "arithmetic",
    operation: "multiply",
    shape: null,
    numerator: null,
    denominator: null,
    simplify: null,
    operands: [
      operand("8 visible eyelets", 8, "observed"),
      operand("number of sneakers", 4, "given_in_problem"),
    ],
  },
});

const sneakerChallenge = finalizeChallenge(
  sneakerWire,
  context(sneaker, sneakerFit),
);
check(
  "sneaker + multiplication grounded_scenario is accepted",
  sneakerChallenge.status === "ok" &&
    sneakerChallenge.challenge.computation.type === "arithmetic" &&
    sneakerChallenge.challenge.correctAnswer.type === "number" &&
    sneakerChallenge.challenge.correctAnswer.type === "number" &&
    sneakerChallenge.challenge.valuesUsed[0]?.origin === "observed",
);

const windowWire = baseWire({
  question:
    "One pane of the window in your photo is 12 inches wide and 18 inches tall. If you traced all the way around that pane, how many inches would you travel?",
  skillCode: "geometry",
  solution:
    "A rectangle has two widths and two heights. 12 + 12 + 18 + 18 = 60 inches.",
  hint1: "A rectangle's perimeter is all four sides added together.",
  hint2: "Add 12 twice and 18 twice.",
  difficulty: 3,
  objectConnection:
    "Your window pane is 12 inches by 18 inches, so those real measurements become the sides of the perimeter.",
  verificationStrategy: "Add the four sides of the rectangle.",
  valuesUsed: [
    operand("pane width", 12, "observed", "in"),
    operand("pane height", 18, "observed", "in"),
  ],
  correctAnswer: {
    type: "number",
    value: 60,
    numerator: null,
    denominator: null,
    unit: "in",
  },
  computation: {
    type: "geometry",
    operation: "perimeter",
    shape: "rectangle",
    numerator: null,
    denominator: null,
    simplify: null,
    operands: [
      operand("pane width", 12, "observed", "in"),
      operand("pane height", 18, "observed", "in"),
    ],
  },
});

const windowChallenge = finalizeChallenge(
  windowWire,
  context(windowPane, windowFit),
);
check(
  "geometry window with established dimensions is accepted",
  windowChallenge.status === "ok" &&
    windowChallenge.challenge.computation.type === "geometry" &&
    windowChallenge.challenge.computation.type === "geometry" &&
    windowChallenge.challenge.valuesUsed.every(
      (value) => value.origin === "observed",
    ),
);

const pizzaWire = baseWire({
  question:
    "The pizza in your photo is cut into 8 equal slices. If you eat 3 slices, what fraction of the pizza is still in the box?",
  skillCode: "fractions",
  solution: "The whole pizza is 8 eighths. 3 slices are eaten, so 5 eighths remain.",
  hint1: "The whole pizza is 8 equal parts.",
  hint2: "Take the 3 eaten slices away from 8 and write that as a fraction.",
  objectConnection:
    "Your pizza shows 8 equal slices, so that real count is the whole we break into eighths.",
  verificationStrategy: "Subtract eaten slices from 8 and write the remainder over 8.",
  valuesUsed: [
    operand("8 equal slices", 8, "observed"),
    operand("slices eaten", 3, "given_in_problem"),
  ],
  correctAnswer: {
    type: "fraction",
    value: null,
    numerator: 5,
    denominator: 8,
    unit: null,
  },
  computation: {
    type: "fraction_remaining",
    operation: "remaining_parts",
    shape: null,
    numerator: null,
    denominator: null,
    simplify: false,
    operands: [
      operand("8 equal slices", 8, "observed"),
      operand("slices eaten", 3, "given_in_problem"),
    ],
  },
});

const pizzaChallenge = finalizeChallenge(pizzaWire, context(pizza, pizzaFit));
check(
  "fractions pizza with an observed whole is accepted",
  pizzaChallenge.status === "ok" &&
    pizzaChallenge.challenge.correctAnswer.type === "fraction" &&
    pizzaChallenge.challenge.computation.type === "fraction_remaining",
);

// --- invented facts are not repaired ---------------------------------------

const smuggledCapacity = finalizeChallenge(
  baseWire({
    question:
      "The bottle in your photo contains 12 fluid ounces. If 4 fluid ounces are poured out, how many remain?",
  }),
  context(bottle, bottleFit),
);
check(
  "a 12 fl oz capacity smuggled as given_in_problem is a generation failure",
  smuggledCapacity.status === "generation_failure",
);

const inventedCapacity = finalizeChallenge(
  baseWire({
    question:
      "The bottle in your photo contains 12 fluid ounces. If 4 fluid ounces are poured out, how many remain?",
    valuesUsed: [
      operand("printed bottle volume", 12, "observed", "fl oz"),
      operand("amount poured out", 4, "given_in_problem", "fl oz"),
    ],
    computation: {
      type: "arithmetic",
      operation: "subtract",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("printed bottle volume", 12, "observed", "fl oz"),
        operand("amount poured out", 4, "given_in_problem", "fl oz"),
      ],
    },
  }),
  context(bottle, bottleFit),
);
check(
  "an invented 12 fl oz is a generation failure, not a repaired 11",
  inventedCapacity.status === "generation_failure",
);

const pepsiGeneric = finalizeChallenge(
  baseWire({
    question: "Sam owns 4 Pepsi cans and buys 3 more. How many cans does Sam have?",
    skillCode: "addition",
    valuesUsed: [
      operand("cans Sam owns", 4, "given_in_problem"),
      operand("cans Sam buys", 3, "given_in_problem"),
    ],
    computation: {
      type: "arithmetic",
      operation: "add",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("cans Sam owns", 4, "given_in_problem"),
        operand("cans Sam buys", 3, "given_in_problem"),
      ],
    },
    objectConnection: "This problem is about your bottle.",
    correctAnswer: {
      type: "number",
      value: 7,
      numerator: null,
      denominator: null,
      unit: null,
    },
  }),
  context(bottle, readyFit("addition", "grounded_scenario", "printed bottle volume: 11 fl oz")),
);
check(
  "a worksheet problem with no observed anchor is poor_fit",
  pepsiGeneric.status === "poor_fit",
);

const unusedAnchor = finalizeChallenge(
  baseWire({
    question:
      "The bottle in your photo is cool. If you had 4 bottles and then 3 more, how many bottles is that?",
    skillCode: "addition",
    valuesUsed: [
      operand("printed bottle volume", 11, "observed", "fl oz"),
      operand("bottles you had", 4, "given_in_problem"),
      operand("bottles more", 3, "given_in_problem"),
    ],
    computation: {
      type: "arithmetic",
      operation: "add",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("bottles you had", 4, "given_in_problem"),
        operand("bottles more", 3, "given_in_problem"),
      ],
    },
    objectConnection: "Your bottle shows 11 fl oz.",
    correctAnswer: {
      type: "number",
      value: 7,
      numerator: null,
      denominator: null,
      unit: null,
    },
  }),
  context(bottle, readyFit("addition", "grounded_scenario", "printed bottle volume: 11 fl oz")),
);
check(
  "mentioning an observed value that never enters the computation is poor_fit",
  unusedAnchor.status === "poor_fit",
);

const fakeEvidence = finalizeChallenge(
  baseWire({
    valuesUsed: [
      operand("shoe size", 7, "student_provided"),
      operand("amount poured out", 4, "given_in_problem", "fl oz"),
    ],
    computation: {
      type: "arithmetic",
      operation: "subtract",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("shoe size", 7, "student_provided"),
        operand("amount poured out", 4, "given_in_problem", "fl oz"),
      ],
    },
  }),
  context(bottle, bottleFit),
);
check(
  "fabricated student_provided evidence is a generation failure",
  fakeEvidence.status === "generation_failure",
);

const realEvidence = finalizeChallenge(
  baseWire({
    question:
      "You measured one side of the table in your photo as 48 inches. If you marked off 12 inches, how many inches would be left?",
    skillCode: "subtraction",
    solution: "48 − 12 = 36 inches.",
    hint1: "You already measured the side.",
    hint2: "Take 12 away from 48.",
    objectConnection:
      "You measured 48 inches on the table, so that real length is the starting amount.",
    valuesUsed: [
      operand("table length", 48, "student_provided", "in"),
      operand("marked off", 12, "given_in_problem", "in"),
    ],
    computation: {
      type: "arithmetic",
      operation: "subtract",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("table length", 48, "student_provided", "in"),
        operand("marked off", 12, "given_in_problem", "in"),
      ],
    },
    correctAnswer: {
      type: "number",
      value: 36,
      numerator: null,
      denominator: null,
      unit: "in",
    },
  }),
  {
    ...context(bottle, bottleFit),
    skillId: "subtraction",
    studentEvidence: [{ property: "table length", value: 48, unit: "in" }],
  },
);
check(
  "real student_provided evidence may anchor a challenge",
  realEvidence.status === "ok",
);

const wrongSkill = finalizeChallenge(
  baseWire({ skillCode: "addition" }),
  context(bottle, bottleFit),
);
check(
  "a skillCode that does not match the selected skill is a generation failure",
  wrongSkill.status === "generation_failure",
);

const declined = finalizeChallenge(
  baseWire({ canGenerate: false }),
  context(bottle, bottleFit),
);
check(
  "canGenerate false is poor_fit, not a forced question",
  declined.status === "poor_fit",
);

const noObject = finalizeChallenge(
  baseWire({
    question:
      "A container holds 11 fluid ounces. If 4 fluid ounces are poured out, how many remain?",
  }),
  context(bottle, bottleFit),
);
check(
  "a question that never refers to the photographed object fails",
  noObject.status === "generation_failure",
);

const unframedGiven = finalizeChallenge(
  baseWire({
    question:
      "The bottle in your photo contains 11 fluid ounces. 4 fluid ounces are poured out. How many remain?",
  }),
  context(bottle, bottleFit),
);
check(
  "a given_in_problem value that is not framed as hypothetical fails",
  unframedGiven.status === "generation_failure",
);

const mismatchedOrigin = finalizeChallenge(
  baseWire({
    valuesUsed: [
      operand("printed bottle volume", 11, "given_in_problem", "fl oz"),
      operand("amount poured out", 4, "given_in_problem", "fl oz"),
    ],
    computation: {
      type: "arithmetic",
      operation: "subtract",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("printed bottle volume", 11, "given_in_problem", "fl oz"),
        operand("amount poured out", 4, "given_in_problem", "fl oz"),
      ],
    },
  }),
  context(bottle, bottleFit),
);
check(
  "labelling a real object fact as given_in_problem is a generation failure",
  mismatchedOrigin.status === "generation_failure",
);

const blankQuestion = finalizeChallenge(
  baseWire({ question: "   " }),
  context(bottle, bottleFit),
);
check(
  "a blank question is a generation failure, not a filled-in prompt",
  blankQuestion.status === "generation_failure",
);

// --- helpers ---------------------------------------------------------------

check(
  "hasGroundedAnchor is true when one observed value exists",
  hasGroundedAnchor([
    {
      label: "printed bottle volume",
      value: 11,
      unit: "fl oz",
      origin: "observed",
    },
    {
      label: "amount poured out",
      value: 4,
      unit: "fl oz",
      origin: "given_in_problem",
    },
  ]),
);

check(
  "hasGroundedAnchor is false when every value is hypothetical",
  !hasGroundedAnchor([
    { label: "cans", value: 4, origin: "given_in_problem" },
    { label: "more cans", value: 3, origin: "given_in_problem" },
  ]),
);

check(
  "refersToObject accepts the object name",
  refersToObject("Look at your protein shake bottle.", bottle),
);
check(
  "refersToObject accepts a distinctive token from the name",
  refersToObject("The bottle in your photo holds 11 fluid ounces.", bottle),
);
check(
  "refersToObject rejects a generic worksheet stem",
  !refersToObject("Sam owns 4 cans and buys 3 more.", bottle),
);

check(
  "objectConnection must cite the real anchor",
  objectConnectionCitesAnchor(
    "Your bottle shows 11 fl oz, so that measurement starts the problem.",
    [
      {
        label: "printed bottle volume",
        value: 11,
        unit: "fl oz",
        origin: "observed",
      },
    ],
  ),
);
check(
  "objectConnection that only names the object is not enough",
  !objectConnectionCitesAnchor("This problem is about your bottle.", [
    {
      label: "printed bottle volume",
      value: 11,
      unit: "fl oz",
      origin: "observed",
    },
  ]),
);

check("targetDifficulty uses progress level when present", targetDifficulty(4, {
  currentLevel: 5,
  masteryScore: 0.8,
  totalAttempts: 10,
  correctAttempts: 8,
}) === 5);
check("targetDifficulty defaults grade 3 to 2", targetDifficulty(3, null) === 2);
check("targetDifficulty defaults grade 5 to 3", targetDifficulty(5, null) === 3);

if (bottleChallenge.status === "ok") {
  check(
    "accepted bottle challenge persists only schema fields",
    Object.keys(bottleChallenge.challenge)
      .sort()
      .join(",") ===
      "computation,correctAnswer,difficulty,hint1,hint2,objectConnection,question,skillCode,solution,valuesUsed,verificationStrategy",
  );
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log("\nall challenge checks passed");
