/**
 * Semantic-object math: numberless ordinary objects still support a
 * Sidequest, and hypothetical numbers stay given_in_problem.
 *
 * Run with: npx tsx lib/ai/semantic-object-math.check.ts
 */

import {
  type ChallengeContext,
  type WireChallenge,
  finalizeChallenge,
} from "@/lib/ai/challenge-grounding";
import { buildContextualPayload } from "@/lib/ai/inspired-context";
import { recoverInvestigation } from "@/lib/ai/investigation-path";
import type {
  ObjectAnalysis,
  ReadySkillFit,
  UsedValue,
} from "@/lib/ai/schemas";
import {
  challengeMatchesObjectPurpose,
  inferSemanticPurpose,
} from "@/lib/ai/semantic-purpose";
import { finalizeSkillFit } from "@/lib/ai/skill-fit-finalize";
import { evaluateComputation } from "@/lib/math/evaluate";
import { verifyChallenge } from "@/lib/math/verify";
import { SKILL_IDS, type SkillId } from "@/lib/types";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

function reading(
  objectName: string,
  category: string,
  extras: Partial<ObjectAnalysis> = {},
): ObjectAnalysis {
  return {
    objectName,
    category,
    confidence: 0.9,
    visibleText: [],
    visibleMeasurements: [],
    countableProperties: [],
    shapeProperties: [],
    observableProperties: [],
    ...extras,
  };
}

const wallet = reading("wallet", "personal accessory", {
  shapeProperties: ["rectangular form", "symmetry"],
  observableProperties: ["card slots", "billfold"],
});

const sneaker = reading("sneaker", "footwear", {
  shapeProperties: ["left-right symmetry", "curved sole"],
  observableProperties: ["laces", "rubber outsole"],
});

const sandals = reading("sandals", "footwear", {
  shapeProperties: ["open toe", "flat sole"],
  observableProperties: ["straps"],
});

const cup = reading("cup", "kitchen tool", {
  shapeProperties: ["cylinder-like body", "circular rim"],
  observableProperties: ["open top", "smooth sides"],
});

const basketball = reading("basketball", "sports equipment", {
  shapeProperties: ["sphere", "circular panels", "curved surface"],
  observableProperties: ["orange pebbled surface"],
});

const book = reading("book", "reading material", {
  shapeProperties: ["rectangular cover", "parallel edges"],
  observableProperties: ["printed pages", "spine"],
});

function inspiredFit(
  skill: SkillId,
  topic: string,
  reason: string,
): ReadySkillFit {
  return {
    selectedSkillCode: skill,
    fitScore: 0.68,
    challengeMode: "inspired_math",
    canGenerateChallenge: true,
    usableProperties: [],
    reason: "The object's ordinary use can inspire this skill.",
    suggestedObjectCharacteristics: [],
    alternativeSkillCodes: [],
    anchors: [],
    evidenceRequest: null,
    inspirationContext: { topic, reason },
  };
}

function ctx(analysis: ObjectAnalysis, fit: ReadySkillFit): ChallengeContext {
  return {
    analysis,
    fit,
    skillId: fit.selectedSkillCode,
    grade: 4,
    studentEvidence: [],
    contextualGrounding: buildContextualPayload(
      analysis,
      fit.inspirationContext,
    ),
  };
}

function operand(
  label: string,
  value: number,
  origin: UsedValue["origin"],
  unit: string | null = null,
) {
  return { label, value, unit, origin };
}

function wire(overrides: Partial<WireChallenge>): WireChallenge {
  return {
    canGenerate: true,
    question: "Question",
    skillCode: "addition",
    solution: "The calculation is shown here.",
    hint1: "Use what the problem states.",
    hint2: "Do the operation carefully.",
    difficulty: 2,
    objectConnection: "This photographed object anchors the maths.",
    verificationStrategy: "Evaluate the structured computation.",
    valuesUsed: [],
    correctAnswer: {
      type: "number",
      value: 0,
      numerator: null,
      denominator: null,
      unit: null,
    },
    computation: {
      type: "arithmetic",
      operation: "add",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [],
    },
    ...overrides,
  };
}

function recoveredMode(analysis: ObjectAnalysis, skillId: SkillId) {
  return recoverInvestigation(
    {
      challengeMode: "poor_fit",
      reason: "No printed number.",
      evidenceRequest: null,
      inspirationContext: null,
    },
    analysis,
    skillId,
  ).resolved.challengeMode;
}

function verifyNamed(
  name: string,
  analysis: ObjectAnalysis,
  fit: ReadySkillFit,
  candidate: WireChallenge,
) {
  const context = ctx(analysis, fit);
  const finalized = finalizeChallenge(candidate, context);
  if (finalized.status !== "ok") {
    check(name, false);
    console.error(`  finalize status=${finalized.status}`);
    if (finalized.status === "generation_failure") {
      console.error(`  issue ${finalized.issue.path}: ${finalized.issue.code}`);
    }
    return;
  }

  const verified = verifyChallenge({
    challenge: finalized.challenge,
    analysis,
    fit,
    skillId: fit.selectedSkillCode,
    grade: context.grade,
    contextualGrounding: context.contextualGrounding,
  });

  check(name, verified.ok);
  if (!verified.ok) {
    console.error(`  verify ${verified.reason}: ${verified.detail}`);
  }
}

// ---------------------------------------------------------------------------
// Numberless objects are not rejected
// ---------------------------------------------------------------------------

for (const [objectName, analysis] of [
  ["wallet", wallet],
  ["sneaker", sneaker],
  ["sandals", sandals],
  ["cup", cup],
  ["basketball", basketball],
  ["book", book],
] as const) {
  for (const skillId of SKILL_IDS) {
    const declined = finalizeSkillFit(
      {
        challengeMode: "poor_fit",
        fitScore: 0.2,
        usableProperties: [],
        reason: "No numeric property was observed.",
        suggestedObjectCharacteristics: ["printed numbers"],
        alternativeSkillCodes: [],
        evidenceRequest: null,
        inspirationContext: null,
      },
      analysis,
      skillId,
    );

    check(
      `${objectName} + ${skillId}: no numeric property does not force poor_fit`,
      declined.status !== "poorFit" && declined.status !== "failed",
    );
  }
}

check(
  "wallet purpose includes money and not an observed amount",
  inferSemanticPurpose(wallet).domains.includes("money") &&
    wallet.visibleMeasurements.length === 0,
);

check(
  "sneaker and sandals purpose includes walking",
  inferSemanticPurpose(sneaker).domains.includes("walking") &&
    inferSemanticPurpose(sandals).domains.includes("walking"),
);

check(
  "cup purpose includes liquid and invents no capacity",
  inferSemanticPurpose(cup).domains.includes("liquid") &&
    cup.visibleMeasurements.length === 0,
);

check(
  "basketball purpose includes scoring",
  inferSemanticPurpose(basketball).domains.includes("scoring"),
);

check(
  "book purpose includes reading",
  inferSemanticPurpose(book).domains.includes("reading"),
);

check(
  "wallet + addition recovers as inspired_math",
  recoveredMode(wallet, "addition") === "inspired_math",
);

check(
  "sneaker + multiplication recovers as inspired_math",
  recoveredMode(sneaker, "multiplication") === "inspired_math",
);

check(
  "cup + division recovers as inspired_math",
  recoveredMode(cup, "division") === "inspired_math",
);

check(
  "wallet + measurement still prefers investigation",
  recoveredMode(wallet, "measurement") === "investigation_math",
);

check(
  "wallet + geometry still uses visible rectangular form",
  recoveredMode(wallet, "geometry") === "object_math",
);

// ---------------------------------------------------------------------------
// Required object × skill challenges
// ---------------------------------------------------------------------------

const walletMoney = inspiredFit(
  "multiplication",
  "money, spending, and saving",
  "A wallet holds money.",
);

verifyNamed(
  "wallet × multiplication verifies with given_in_problem bills",
  wallet,
  walletMoney,
  wire({
    skillCode: "multiplication",
    question:
      "Imagine your wallet contains 6 bills worth 5 dollars each. How much money is that?",
    objectConnection:
      "Your wallet sent us to money, not a total printed on the wallet.",
    hint1: "Each bill is worth 5 dollars.",
    hint2: "Multiply 6 by 5.",
    valuesUsed: [
      operand("five-dollar bills", 6, "given_in_problem"),
      operand("dollars per bill", 5, "given_in_problem", "dollars"),
    ],
    correctAnswer: {
      type: "number",
      value: 30,
      numerator: null,
      denominator: null,
      unit: "dollars",
    },
    computation: {
      type: "arithmetic",
      operation: "multiply",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("five-dollar bills", 6, "given_in_problem"),
        operand("dollars per bill", 5, "given_in_problem", "dollars"),
      ],
    },
    solution: "6 × 5 = 30 dollars.",
  }),
);

verifyNamed(
  "wallet × subtraction verifies with a hypothetical target",
  wallet,
  inspiredFit(
    "subtraction",
    "money, spending, and saving",
    "A wallet holds money.",
  ),
  wire({
    skillCode: "subtraction",
    question:
      "Suppose your wallet has $20 in it. You want to have $125. How much more money would you need to add?",
    objectConnection:
      "Your wallet sent us to money and saving, not a total printed on the wallet.",
    hint1: "Start with the target amount.",
    hint2: "Subtract 20 from 125.",
    valuesUsed: [
      operand("target dollars", 125, "given_in_problem", "dollars"),
      operand("starting dollars", 20, "given_in_problem", "dollars"),
    ],
    correctAnswer: {
      type: "number",
      value: 105,
      numerator: null,
      denominator: null,
      unit: "dollars",
    },
    computation: {
      type: "arithmetic",
      operation: "subtract",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("target dollars", 125, "given_in_problem", "dollars"),
        operand("starting dollars", 20, "given_in_problem", "dollars"),
      ],
    },
    solution: "125 − 20 = 105 dollars.",
  }),
);

verifyNamed(
  "sneaker × multiplication verifies with hypothetical steps",
  sneaker,
  inspiredFit(
    "multiplication",
    "walking, steps, and pairs",
    "Sneakers are used for walking.",
  ),
  wire({
    skillCode: "multiplication",
    question:
      "Imagine you walk 12 steps in each lap with your sneaker. Suppose you complete 3 laps. How many steps is that?",
    objectConnection:
      "Your sneaker sent us to walking and steps, not a size printed in the shoe.",
    hint1: "Each lap has the same number of steps.",
    hint2: "Multiply 12 by 3.",
    valuesUsed: [
      operand("steps per lap", 12, "given_in_problem", "steps"),
      operand("laps", 3, "given_in_problem"),
    ],
    correctAnswer: {
      type: "number",
      value: 36,
      numerator: null,
      denominator: null,
      unit: "steps",
    },
    computation: {
      type: "arithmetic",
      operation: "multiply",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("steps per lap", 12, "given_in_problem", "steps"),
        operand("laps", 3, "given_in_problem"),
      ],
    },
    solution: "12 × 3 = 36 steps.",
  }),
);

verifyNamed(
  "sneaker × division verifies with steps split across walks",
  sneaker,
  inspiredFit(
    "division",
    "walking, steps, and pairs",
    "Sneakers are used for walking.",
  ),
  wire({
    skillCode: "division",
    question:
      "Suppose you take 40 steps in your sneaker and split them equally across 4 walks. How many steps is each walk?",
    objectConnection:
      "Your sneaker sent us to walking and steps, not a printed measurement.",
    hint1: "The steps are shared equally.",
    hint2: "Divide 40 by 4.",
    valuesUsed: [
      operand("total steps", 40, "given_in_problem", "steps"),
      operand("walks", 4, "given_in_problem"),
    ],
    correctAnswer: {
      type: "number",
      value: 10,
      numerator: null,
      denominator: null,
      unit: "steps",
    },
    computation: {
      type: "division",
      operation: "quotient",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("total steps", 40, "given_in_problem", "steps"),
        operand("walks", 4, "given_in_problem"),
      ],
    },
    solution: "40 ÷ 4 = 10 steps.",
  }),
);

verifyNamed(
  "sandals × addition verifies with hypothetical steps",
  sandals,
  inspiredFit(
    "addition",
    "walking, steps, and pairs",
    "Sandals are used for walking.",
  ),
  wire({
    skillCode: "addition",
    question:
      "Suppose you walk 18 steps in your sandals, then 14 more steps. How many steps is that altogether?",
    objectConnection:
      "Your sandals sent us to walking and steps, not a printed size.",
    hint1: "Add the two walks.",
    hint2: "18 + 14.",
    valuesUsed: [
      operand("first walk", 18, "given_in_problem", "steps"),
      operand("second walk", 14, "given_in_problem", "steps"),
    ],
    correctAnswer: {
      type: "number",
      value: 32,
      numerator: null,
      denominator: null,
      unit: "steps",
    },
    computation: {
      type: "arithmetic",
      operation: "add",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("first walk", 18, "given_in_problem", "steps"),
        operand("second walk", 14, "given_in_problem", "steps"),
      ],
    },
    solution: "18 + 14 = 32 steps.",
  }),
);

verifyNamed(
  "cup × multiplication verifies with hypothetical capacity",
  cup,
  inspiredFit(
    "multiplication",
    "liquid, pouring, and servings",
    "A cup is used for drinking.",
  ),
  wire({
    skillCode: "multiplication",
    question:
      "Suppose your cup holds 250 mL for this Sidequest. How much water would 4 cups hold?",
    objectConnection:
      "Your cup sent us to liquid and servings, not a capacity printed on the cup.",
    hint1: "Each cup holds the same amount.",
    hint2: "Multiply 250 by 4.",
    valuesUsed: [
      operand("cup amount", 250, "given_in_problem", "mL"),
      operand("cups", 4, "given_in_problem"),
    ],
    correctAnswer: {
      type: "number",
      value: 1000,
      numerator: null,
      denominator: null,
      unit: "mL",
    },
    computation: {
      type: "arithmetic",
      operation: "multiply",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("cup amount", 250, "given_in_problem", "mL"),
        operand("cups", 4, "given_in_problem"),
      ],
    },
    solution: "250 × 4 = 1000 mL.",
  }),
);

verifyNamed(
  "cup × division verifies with hypothetical servings",
  cup,
  inspiredFit(
    "division",
    "liquid, pouring, and servings",
    "A cup is used for pouring servings.",
  ),
  wire({
    skillCode: "division",
    question:
      "Suppose you pour 80 mL of water from a jug into your cup in 4 equal servings. How many mL is each serving?",
    objectConnection:
      "Your cup sent us to liquid and servings, not an observed capacity.",
    hint1: "The water is shared equally.",
    hint2: "Divide 80 by 4.",
    valuesUsed: [
      operand("total water", 80, "given_in_problem", "mL"),
      operand("servings", 4, "given_in_problem"),
    ],
    correctAnswer: {
      type: "number",
      value: 20,
      numerator: null,
      denominator: null,
      unit: "mL",
    },
    computation: {
      type: "division",
      operation: "quotient",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("total water", 80, "given_in_problem", "mL"),
        operand("servings", 4, "given_in_problem"),
      ],
    },
    solution: "80 ÷ 4 = 20 mL.",
  }),
);

verifyNamed(
  "basketball × arithmetic verifies with scoring, not a printed number",
  basketball,
  inspiredFit(
    "addition",
    "scoring, teams, and shots",
    "Basketball scoring is connected to the ball.",
  ),
  wire({
    skillCode: "addition",
    question:
      "In basketball, a free throw is worth 1 point and a shot from beyond the three-point line is worth 3 points. How many points is that altogether?",
    objectConnection:
      "Your basketball sent us to scoring, not a number printed on the ball.",
    valuesUsed: [
      operand("free throw points", 1, "contextual", "point"),
      operand("three-point shot", 3, "contextual", "points"),
    ],
    correctAnswer: {
      type: "number",
      value: 4,
      numerator: null,
      denominator: null,
      unit: "points",
    },
    computation: {
      type: "arithmetic",
      operation: "add",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("free throw points", 1, "contextual", "point"),
        operand("three-point shot", 3, "contextual", "points"),
      ],
    },
    solution: "1 + 3 = 4 points.",
  }),
);

verifyNamed(
  "book × fractions verifies with hypothetical pages",
  book,
  inspiredFit(
    "fractions",
    "reading, pages, and chapters",
    "Books are organised into pages.",
  ),
  wire({
    skillCode: "fractions",
    question:
      "Suppose your book has 12 pages and you read 4 of them. What fraction of the book remains?",
    objectConnection:
      "Your book sent us to reading and pages, not a page count on the cover.",
    hint1: "The whole book is 12 pages.",
    hint2: "8 pages remain, then write that as a fraction.",
    valuesUsed: [
      operand("pages", 12, "given_in_problem"),
      operand("pages read", 4, "given_in_problem"),
    ],
    correctAnswer: {
      type: "fraction",
      value: null,
      numerator: 2,
      denominator: 3,
      unit: null,
    },
    computation: {
      type: "fraction_remaining",
      operation: "",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: true,
      operands: [
        operand("pages", 12, "given_in_problem"),
        operand("pages read", 4, "given_in_problem"),
      ],
    },
    solution: "12 − 4 = 8, so 8/12 simplifies to 2/3.",
  }),
);

// ---------------------------------------------------------------------------
// Hypothetical framing vs invented object facts
// ---------------------------------------------------------------------------

const walletContainsFact = finalizeChallenge(
  wire({
    skillCode: "subtraction",
    question:
      "Your wallet contains $20. How much more money would you need to reach $125?",
    objectConnection: "Your wallet sent us to money and saving.",
    valuesUsed: [
      operand("target dollars", 125, "given_in_problem", "dollars"),
      operand("starting dollars", 20, "given_in_problem", "dollars"),
    ],
    correctAnswer: {
      type: "number",
      value: 105,
      numerator: null,
      denominator: null,
      unit: "dollars",
    },
    computation: {
      type: "arithmetic",
      operation: "subtract",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("target dollars", 125, "given_in_problem", "dollars"),
        operand("starting dollars", 20, "given_in_problem", "dollars"),
      ],
    },
    solution: "125 − 20 = 105 dollars.",
  }),
  ctx(
    wallet,
    inspiredFit("subtraction", "money, spending, and saving", "A wallet holds money."),
  ),
);

check(
  "PASS: unframed given_in_problem wallet amount is prefixed with Suppose",
  walletContainsFact.status === "ok" &&
    walletContainsFact.challenge.question.startsWith(
      "Suppose your wallet contains $20",
    ) &&
    walletContainsFact.repairs.includes("hypothetical_prefix"),
);

const walletContainsObserved = finalizeChallenge(
  wire({
    skillCode: "subtraction",
    question:
      "Your wallet contains $20. How much more money would you need to reach $125?",
    objectConnection: "Your wallet sent us to money and saving.",
    valuesUsed: [
      operand("target dollars", 125, "given_in_problem", "dollars"),
      operand("starting dollars", 20, "observed", "dollars"),
    ],
    correctAnswer: {
      type: "number",
      value: 105,
      numerator: null,
      denominator: null,
      unit: "dollars",
    },
    computation: {
      type: "arithmetic",
      operation: "subtract",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("target dollars", 125, "given_in_problem", "dollars"),
        operand("starting dollars", 20, "observed", "dollars"),
      ],
    },
    solution: "125 − 20 = 105 dollars.",
  }),
  ctx(
    wallet,
    inspiredFit("subtraction", "money, spending, and saving", "A wallet holds money."),
  ),
);

check(
  "FAIL: 'Your wallet contains $20' labeled observed when $20 was not observed",
  walletContainsObserved.status !== "ok",
);

const walletSuppose = finalizeChallenge(
  wire({
    skillCode: "subtraction",
    question:
      "Suppose your wallet contains $20. How much more money would you need to reach $125?",
    objectConnection: "Your wallet sent us to money and saving.",
    valuesUsed: [
      operand("target dollars", 125, "given_in_problem", "dollars"),
      operand("starting dollars", 20, "given_in_problem", "dollars"),
    ],
    correctAnswer: {
      type: "number",
      value: 105,
      numerator: null,
      denominator: null,
      unit: "dollars",
    },
    computation: {
      type: "arithmetic",
      operation: "subtract",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("target dollars", 125, "given_in_problem", "dollars"),
        operand("starting dollars", 20, "given_in_problem", "dollars"),
      ],
    },
    solution: "125 − 20 = 105 dollars.",
  }),
  ctx(
    wallet,
    inspiredFit("subtraction", "money, spending, and saving", "A wallet holds money."),
  ),
);

check(
  "PASS: 'Suppose your wallet contains $20' with given_in_problem",
  walletSuppose.status === "ok",
);

const cupHoldsFact = finalizeChallenge(
  wire({
    skillCode: "multiplication",
    question: "Your cup holds 500 mL. How much water would 2 cups hold?",
    objectConnection: "Your cup sent us to liquid and servings.",
    valuesUsed: [
      operand("cup amount", 500, "given_in_problem", "mL"),
      operand("cups", 2, "given_in_problem"),
    ],
    correctAnswer: {
      type: "number",
      value: 1000,
      numerator: null,
      denominator: null,
      unit: "mL",
    },
    computation: {
      type: "arithmetic",
      operation: "multiply",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("cup amount", 500, "given_in_problem", "mL"),
        operand("cups", 2, "given_in_problem"),
      ],
    },
    solution: "500 × 2 = 1000 mL.",
  }),
  ctx(
    cup,
    inspiredFit(
      "multiplication",
      "liquid, pouring, and servings",
      "A cup is used for drinking.",
    ),
  ),
);

check(
  "PASS: unframed given_in_problem cup capacity is prefixed with Suppose",
  cupHoldsFact.status === "ok" &&
    cupHoldsFact.challenge.question.startsWith("Suppose your cup holds 500 mL") &&
    cupHoldsFact.repairs.includes("hypothetical_prefix"),
);

const cupHoldsObserved = finalizeChallenge(
  wire({
    skillCode: "multiplication",
    question: "Your cup holds 500 mL. How much water would 2 cups hold?",
    objectConnection: "Your cup sent us to liquid and servings.",
    valuesUsed: [
      operand("cup amount", 500, "observed", "mL"),
      operand("cups", 2, "given_in_problem"),
    ],
    correctAnswer: {
      type: "number",
      value: 1000,
      numerator: null,
      denominator: null,
      unit: "mL",
    },
    computation: {
      type: "arithmetic",
      operation: "multiply",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("cup amount", 500, "observed", "mL"),
        operand("cups", 2, "given_in_problem"),
      ],
    },
    solution: "500 × 2 = 1000 mL.",
  }),
  ctx(
    cup,
    inspiredFit(
      "multiplication",
      "liquid, pouring, and servings",
      "A cup is used for drinking.",
    ),
  ),
);

check(
  "FAIL: 'Your cup holds 500 mL' labeled observed when capacity was not established",
  cupHoldsObserved.status !== "ok",
);

const cupSuppose = finalizeChallenge(
  wire({
    skillCode: "multiplication",
    question:
      "Suppose your cup holds 500 mL for this Sidequest. How much water would 2 cups hold?",
    objectConnection: "Your cup sent us to liquid and servings.",
    valuesUsed: [
      operand("cup amount", 500, "given_in_problem", "mL"),
      operand("cups", 2, "given_in_problem"),
    ],
    correctAnswer: {
      type: "number",
      value: 1000,
      numerator: null,
      denominator: null,
      unit: "mL",
    },
    computation: {
      type: "arithmetic",
      operation: "multiply",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("cup amount", 500, "given_in_problem", "mL"),
        operand("cups", 2, "given_in_problem"),
      ],
    },
    solution: "500 × 2 = 1000 mL.",
  }),
  ctx(
    cup,
    inspiredFit(
      "multiplication",
      "liquid, pouring, and servings",
      "A cup is used for drinking.",
    ),
  ),
);

check(
  "PASS: 'Suppose your cup holds 500 mL for this Sidequest' with given_in_problem",
  cupSuppose.status === "ok",
);

const walletApples = finalizeChallenge(
  wire({
    skillCode: "addition",
    question:
      "Suppose there are 8 apples and 4 more apples next to your wallet. How many apples is that?",
    objectConnection: "This question is about your wallet.",
    valuesUsed: [
      operand("apples", 8, "given_in_problem"),
      operand("more apples", 4, "given_in_problem"),
    ],
    correctAnswer: {
      type: "number",
      value: 12,
      numerator: null,
      denominator: null,
      unit: "apples",
    },
    computation: {
      type: "arithmetic",
      operation: "add",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("apples", 8, "given_in_problem"),
        operand("more apples", 4, "given_in_problem"),
      ],
    },
    solution: "8 + 4 = 12 apples.",
  }),
  ctx(
    wallet,
    inspiredFit("addition", "money, spending, and saving", "A wallet holds money."),
  ),
);

check(
  "FAIL: wallet → apples",
  walletApples.status !== "ok",
);

const shoePizza = finalizeChallenge(
  wire({
    skillCode: "addition",
    question:
      "Suppose there are 6 pizza slices next to your sneaker and 3 more slices. How many slices is that?",
    objectConnection: "This question is about your sneaker.",
    valuesUsed: [
      operand("pizza slices", 6, "given_in_problem"),
      operand("more slices", 3, "given_in_problem"),
    ],
    correctAnswer: {
      type: "number",
      value: 9,
      numerator: null,
      denominator: null,
      unit: "slices",
    },
    computation: {
      type: "arithmetic",
      operation: "add",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("pizza slices", 6, "given_in_problem"),
        operand("more slices", 3, "given_in_problem"),
      ],
    },
    solution: "6 + 3 = 9 slices.",
  }),
  ctx(
    sneaker,
    inspiredFit(
      "addition",
      "walking, steps, and pairs",
      "Sneakers are used for walking.",
    ),
  ),
);

check("FAIL: shoe → pizza slices", shoePizza.status !== "ok");

check(
  "PASS: wallet → money",
  challengeMatchesObjectPurpose(
    "Suppose your wallet has 20 dollars.",
    "Your wallet sent us to money.",
    wallet,
    { topic: "money, spending, and saving", reason: "A wallet holds money." },
  ),
);

check(
  "PASS: shoe → steps",
  challengeMatchesObjectPurpose(
    "Suppose you walk 20 steps in your sneaker.",
    "Your sneaker sent us to walking and steps.",
    sneaker,
    { topic: "walking, steps, and pairs", reason: "Sneakers are used for walking." },
  ),
);

check(
  "PASS: cup → liquid",
  challengeMatchesObjectPurpose(
    "Suppose your cup holds 250 mL of water.",
    "Your cup sent us to liquid and servings.",
    cup,
    {
      topic: "liquid, pouring, and servings",
      reason: "A cup is used for drinking.",
    },
  ),
);

check(
  "PASS: basketball → scoring",
  challengeMatchesObjectPurpose(
    "In basketball, a shot is worth 2 points.",
    "Your basketball sent us to scoring.",
    basketball,
    { topic: "scoring, teams, and shots", reason: "Basketball scoring." },
  ),
);

check(
  "PASS: wallet → bills without repeating wallet next to every number",
  challengeMatchesObjectPurpose(
    "Suppose the bills add 20 dollars and 50 dollars.",
    "Your wallet sent us to bills and dollars.",
    wallet,
    { topic: "money, spending, and saving", reason: "A wallet holds money." },
  ),
);

check(
  "PASS: wallet → spending",
  challengeMatchesObjectPurpose(
    "Suppose you spend 7 dollars from your wallet.",
    "Your wallet sent us to spending.",
    wallet,
    { topic: "money, spending, and saving", reason: "A wallet holds money." },
  ),
);

check(
  "PASS: wallet → saving",
  challengeMatchesObjectPurpose(
    "Suppose you save 15 dollars in your wallet.",
    "Your wallet sent us to saving.",
    wallet,
    { topic: "money, spending, and saving", reason: "A wallet holds money." },
  ),
);

check(
  "FAIL: basketball → pencils",
  !challengeMatchesObjectPurpose(
    "Suppose there are 8 pencils next to your basketball.",
    "This question is about your basketball.",
    basketball,
    { topic: "scoring, teams, and shots", reason: "Basketball scoring." },
  ),
);

const shoe = reading("shoe", "footwear", {
  shapeProperties: ["left-right symmetry"],
  observableProperties: ["laces"],
});

const ARITHMETIC_SKILLS = [
  "addition",
  "subtraction",
  "multiplication",
  "division",
  "fractions",
] as const;

for (const skillId of ARITHMETIC_SKILLS) {
  check(
    `wallet + ${skillId} resolves to inspired_math with no numeric anchor`,
    recoveredMode(wallet, skillId) === "inspired_math",
  );
}

for (const skillId of ["addition", "multiplication", "division"] as const) {
  check(
    `shoe + ${skillId} resolves to inspired_math with no numeric anchor`,
    recoveredMode(shoe, skillId) === "inspired_math",
  );
  check(
    `cup + ${skillId} resolves to inspired_math with no numeric anchor`,
    recoveredMode(cup, skillId) === "inspired_math",
  );
}

for (const skillId of ["addition", "subtraction", "multiplication"] as const) {
  check(
    `basketball + ${skillId} resolves to inspired_math with no numeric anchor`,
    recoveredMode(basketball, skillId) === "inspired_math",
  );
}

check(
  "book + addition resolves to inspired_math with no numeric anchor",
  recoveredMode(book, "addition") === "inspired_math",
);

check(
  "book + fractions resolves to inspired_math with no numeric anchor",
  recoveredMode(book, "fractions") === "inspired_math",
);

check(
  "wallet + geometry is object_math from rectangular form",
  recoveredMode(wallet, "geometry") === "object_math",
);

check(
  "basketball + geometry is object_math from sphere/circular form",
  recoveredMode(basketball, "geometry") === "object_math",
);

const investigationWallet = finalizeSkillFit(
  {
    challengeMode: "investigation_math",
    fitScore: 0.35,
    usableProperties: [],
    reason: "No amount is visible.",
    suggestedObjectCharacteristics: [],
    alternativeSkillCodes: [],
    evidenceRequest: {
      type: "student_count",
      prompt: "Count one group of parts on your wallet.",
      targetProperty: "visible count",
      reason: "A real number from your object lets us do this mission.",
    },
    inspirationContext: null,
  },
  wallet,
  "addition",
);

check(
  "wallet + addition does not stay investigation_math when the money domain exists",
  investigationWallet.status === "ok" &&
    investigationWallet.fit.challengeMode === "inspired_math",
);

verifyNamed(
  "wallet + addition end-to-end: suppose $20 then add $50",
  wallet,
  inspiredFit(
    "addition",
    "money, spending, and saving",
    "A wallet holds money.",
  ),
  wire({
    skillCode: "addition",
    question:
      "Suppose your wallet has $20 and you add $50. How much money would you have?",
    objectConnection:
      "Your wallet sent us to money, then imagined amounts to add, not a total printed on the wallet.",
    hint1: "Start with the amount supposed to be in the wallet.",
    hint2: "Add 20 and 50.",
    valuesUsed: [
      operand("starting dollars", 20, "given_in_problem", "dollars"),
      operand("added dollars", 50, "given_in_problem", "dollars"),
    ],
    correctAnswer: {
      type: "number",
      value: 70,
      numerator: null,
      denominator: null,
      unit: "dollars",
    },
    computation: {
      type: "arithmetic",
      operation: "add",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("starting dollars", 20, "given_in_problem", "dollars"),
        operand("added dollars", 50, "given_in_problem", "dollars"),
      ],
    },
    solution: "20 + 50 = 70 dollars.",
  }),
);

verifyNamed(
  "wallet + multiplication end-to-end: 6 five-dollar bills",
  wallet,
  inspiredFit(
    "multiplication",
    "money, spending, and saving",
    "A wallet holds money.",
  ),
  wire({
    skillCode: "multiplication",
    question:
      "Imagine your wallet has 6 five-dollar bills. How much money is that?",
    objectConnection:
      "Your wallet sent us to money, then imagined bills to multiply, not a total printed on the wallet.",
    hint1: "Each bill is worth five dollars.",
    hint2: "Multiply 6 by 5.",
    valuesUsed: [
      operand("five-dollar bills", 6, "given_in_problem"),
      operand("dollars per bill", 5, "given_in_problem", "dollars"),
    ],
    correctAnswer: {
      type: "number",
      value: 30,
      numerator: null,
      denominator: null,
      unit: "dollars",
    },
    computation: {
      type: "arithmetic",
      operation: "multiply",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("five-dollar bills", 6, "given_in_problem"),
        operand("dollars per bill", 5, "given_in_problem", "dollars"),
      ],
    },
    solution: "6 × 5 = 30 dollars.",
  }),
);

verifyNamed(
  "cup + division end-to-end: 1,000 mL into 250 mL cups",
  cup,
  inspiredFit(
    "division",
    "liquid, pouring, and servings",
    "A cup is used for pouring servings.",
  ),
  wire({
    skillCode: "division",
    question:
      "Suppose your cup holds 250 mL for this Sidequest. If you have 1,000 mL of water, how many cups could you fill?",
    objectConnection:
      "Your cup sent us to liquid and servings, not a capacity printed on the cup.",
    hint1: "Each cup holds the same imagined amount.",
    hint2: "Divide 1,000 by 250.",
    valuesUsed: [
      operand("total water", 1000, "given_in_problem", "mL"),
      operand("cup amount", 250, "given_in_problem", "mL"),
    ],
    correctAnswer: {
      type: "number",
      value: 4,
      numerator: null,
      denominator: null,
      unit: null,
    },
    computation: {
      type: "division",
      operation: "quotient",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("total water", 1000, "given_in_problem", "mL"),
        operand("cup amount", 250, "given_in_problem", "mL"),
      ],
    },
    solution: "1,000 ÷ 250 = 4 cups.",
  }),
);

verifyNamed(
  "wallet + division end-to-end with given_in_problem money",
  wallet,
  inspiredFit("division", "money, spending, and saving", "A wallet holds money."),
  wire({
    skillCode: "division",
    question:
      "Suppose your wallet has $20 and you share it equally among 4 people. How many dollars does each person get?",
    objectConnection: "Your wallet sent us to money, then imagined sharing.",
    hint1: "The money is shared equally.",
    hint2: "Divide 20 by 4.",
    valuesUsed: [
      operand("starting dollars", 20, "given_in_problem", "dollars"),
      operand("people", 4, "given_in_problem"),
    ],
    correctAnswer: {
      type: "number",
      value: 5,
      numerator: null,
      denominator: null,
      unit: "dollars",
    },
    computation: {
      type: "division",
      operation: "quotient",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("starting dollars", 20, "given_in_problem", "dollars"),
        operand("people", 4, "given_in_problem"),
      ],
    },
    solution: "20 ÷ 4 = 5 dollars.",
  }),
);

verifyNamed(
  "wallet + fractions end-to-end with given_in_problem money",
  wallet,
  inspiredFit(
    "fractions",
    "money, spending, and saving",
    "A wallet holds money.",
  ),
  wire({
    skillCode: "fractions",
    question:
      "Suppose your wallet has $80 and you spend 1/4 of it. How much money did you spend?",
    objectConnection: "Your wallet sent us to money, then imagined a portion.",
    hint1: "The whole amount is 80 dollars.",
    hint2: "Find one fourth of 80.",
    valuesUsed: [
      operand("starting dollars", 80, "given_in_problem", "dollars"),
    ],
    correctAnswer: {
      type: "number",
      value: 20,
      numerator: null,
      denominator: null,
      unit: "dollars",
    },
    computation: {
      type: "fraction_of",
      operation: "",
      shape: null,
      numerator: 1,
      denominator: 4,
      simplify: null,
      operands: [
        operand("starting dollars", 80, "given_in_problem", "dollars"),
      ],
    },
    solution: "1/4 of 80 is 20 dollars.",
  }),
);

verifyNamed(
  "shoe + addition end-to-end with hypothetical steps",
  shoe,
  inspiredFit("addition", "walking, steps, and pairs", "A shoe is used for walking."),
  wire({
    skillCode: "addition",
    question:
      "Suppose you walk 18 steps in your shoe, then 14 more steps. How many steps is that altogether?",
    objectConnection: "Your shoe sent us to walking and steps, not a printed size.",
    hint1: "Add the two walks.",
    hint2: "18 + 14.",
    valuesUsed: [
      operand("first walk", 18, "given_in_problem", "steps"),
      operand("second walk", 14, "given_in_problem", "steps"),
    ],
    correctAnswer: {
      type: "number",
      value: 32,
      numerator: null,
      denominator: null,
      unit: "steps",
    },
    computation: {
      type: "arithmetic",
      operation: "add",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("first walk", 18, "given_in_problem", "steps"),
        operand("second walk", 14, "given_in_problem", "steps"),
      ],
    },
    solution: "18 + 14 = 32 steps.",
  }),
);

verifyNamed(
  "book + addition end-to-end with hypothetical pages",
  book,
  inspiredFit("addition", "reading, pages, and chapters", "Books are organised into pages."),
  wire({
    skillCode: "addition",
    question:
      "Suppose your book has 12 pages and you add 8 more pages of notes. How many pages is that altogether?",
    objectConnection: "Your book sent us to reading and pages, not a printed page count.",
    hint1: "Add the two amounts of pages.",
    hint2: "12 + 8.",
    valuesUsed: [
      operand("pages", 12, "given_in_problem"),
      operand("note pages", 8, "given_in_problem"),
    ],
    correctAnswer: {
      type: "number",
      value: 20,
      numerator: null,
      denominator: null,
      unit: null,
    },
    computation: {
      type: "arithmetic",
      operation: "add",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("pages", 12, "given_in_problem"),
        operand("note pages", 8, "given_in_problem"),
      ],
    },
    solution: "12 + 8 = 20 pages.",
  }),
);

verifyNamed(
  "shoe + multiplication end-to-end with hypothetical steps",
  shoe,
  inspiredFit(
    "multiplication",
    "walking, steps, and pairs",
    "A shoe is used for walking.",
  ),
  wire({
    skillCode: "multiplication",
    question:
      "Imagine you walk 12 steps in each lap with your shoe. Suppose you complete 3 laps. How many steps is that?",
    objectConnection:
      "Your shoe sent us to walking and steps, not a size printed in the shoe.",
    hint1: "Each lap has the same number of steps.",
    hint2: "Multiply 12 by 3.",
    valuesUsed: [
      operand("steps per lap", 12, "given_in_problem", "steps"),
      operand("laps", 3, "given_in_problem"),
    ],
    correctAnswer: {
      type: "number",
      value: 36,
      numerator: null,
      denominator: null,
      unit: "steps",
    },
    computation: {
      type: "arithmetic",
      operation: "multiply",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("steps per lap", 12, "given_in_problem", "steps"),
        operand("laps", 3, "given_in_problem"),
      ],
    },
    solution: "12 × 3 = 36 steps.",
  }),
);

verifyNamed(
  "shoe + division end-to-end with hypothetical steps",
  shoe,
  inspiredFit("division", "walking, steps, and pairs", "A shoe is used for walking."),
  wire({
    skillCode: "division",
    question:
      "Suppose you take 40 steps in your shoe and split them equally across 4 walks. How many steps is each walk?",
    objectConnection:
      "Your shoe sent us to walking and steps, not a printed measurement.",
    hint1: "The steps are shared equally.",
    hint2: "Divide 40 by 4.",
    valuesUsed: [
      operand("total steps", 40, "given_in_problem", "steps"),
      operand("walks", 4, "given_in_problem"),
    ],
    correctAnswer: {
      type: "number",
      value: 10,
      numerator: null,
      denominator: null,
      unit: "steps",
    },
    computation: {
      type: "division",
      operation: "quotient",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("total steps", 40, "given_in_problem", "steps"),
        operand("walks", 4, "given_in_problem"),
      ],
    },
    solution: "40 ÷ 4 = 10 steps.",
  }),
);

verifyNamed(
  "cup + addition end-to-end with hypothetical servings",
  cup,
  inspiredFit(
    "addition",
    "liquid, pouring, and servings",
    "A cup is used for drinking.",
  ),
  wire({
    skillCode: "addition",
    question:
      "Suppose you pour 120 mL into your cup, then add 80 mL more. How many mL is that altogether?",
    objectConnection:
      "Your cup sent us to liquid and servings, not a capacity printed on the cup.",
    hint1: "Add the two pours.",
    hint2: "120 + 80.",
    valuesUsed: [
      operand("first pour", 120, "given_in_problem", "mL"),
      operand("second pour", 80, "given_in_problem", "mL"),
    ],
    correctAnswer: {
      type: "number",
      value: 200,
      numerator: null,
      denominator: null,
      unit: "mL",
    },
    computation: {
      type: "arithmetic",
      operation: "add",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("first pour", 120, "given_in_problem", "mL"),
        operand("second pour", 80, "given_in_problem", "mL"),
      ],
    },
    solution: "120 + 80 = 200 mL.",
  }),
);

verifyNamed(
  "basketball + subtraction end-to-end with a hypothetical score",
  basketball,
  inspiredFit(
    "subtraction",
    "scoring, teams, and shots",
    "Basketball scoring is connected to the ball.",
  ),
  wire({
    skillCode: "subtraction",
    question:
      "Suppose your team has 18 points with the basketball. If the other team has 11 points, how many more points do you have?",
    objectConnection:
      "Your basketball sent us to scoring, not a number printed on the ball.",
    hint1: "Start with your team's points.",
    hint2: "Subtract 11 from 18.",
    valuesUsed: [
      operand("our points", 18, "given_in_problem", "points"),
      operand("their points", 11, "given_in_problem", "points"),
    ],
    correctAnswer: {
      type: "number",
      value: 7,
      numerator: null,
      denominator: null,
      unit: "points",
    },
    computation: {
      type: "arithmetic",
      operation: "subtract",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("our points", 18, "given_in_problem", "points"),
        operand("their points", 11, "given_in_problem", "points"),
      ],
    },
    solution: "18 − 11 = 7 points.",
  }),
);

verifyNamed(
  "basketball + multiplication end-to-end with hypothetical shots",
  basketball,
  inspiredFit(
    "multiplication",
    "scoring, teams, and shots",
    "Basketball scoring is connected to the ball.",
  ),
  wire({
    skillCode: "multiplication",
    question:
      "Suppose you make 4 shots with your basketball and each shot is worth 2 points. How many points is that?",
    objectConnection:
      "Your basketball sent us to scoring, not a number printed on the ball.",
    hint1: "Each shot is worth the same.",
    hint2: "Multiply 4 by 2.",
    valuesUsed: [
      operand("shots", 4, "given_in_problem"),
      operand("points per shot", 2, "given_in_problem", "points"),
    ],
    correctAnswer: {
      type: "number",
      value: 8,
      numerator: null,
      denominator: null,
      unit: "points",
    },
    computation: {
      type: "arithmetic",
      operation: "multiply",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("shots", 4, "given_in_problem"),
        operand("points per shot", 2, "given_in_problem", "points"),
      ],
    },
    solution: "4 × 2 = 8 points.",
  }),
);

// ---------------------------------------------------------------------------
// Multi-step arithmetic
// ---------------------------------------------------------------------------

const multiStep = {
  type: "multi_step_arithmetic" as const,
  steps: [
    {
      operation: "add" as const,
      operands: [
        {
          kind: "value" as const,
          label: "starting dollars",
          value: 50,
          unit: "dollars",
          origin: "given_in_problem" as const,
        },
        {
          kind: "value" as const,
          label: "added dollars",
          value: 20,
          unit: "dollars",
          origin: "given_in_problem" as const,
        },
      ],
    },
    {
      operation: "subtract" as const,
      operands: [
        {
          kind: "value" as const,
          label: "target dollars",
          value: 125,
          unit: "dollars",
          origin: "given_in_problem" as const,
        },
        { kind: "step_result" as const, step: 0 },
      ],
    },
  ],
};

const evaluated = evaluateComputation(multiStep);
check(
  "multi-step 50 + 20, then 125 − 70 independently equals 55",
  evaluated.ok &&
    evaluated.answer.type === "number" &&
    evaluated.answer.value === 55,
);

verifyNamed(
  "wallet multi-step subtraction verifies every step independently",
  wallet,
  inspiredFit(
    "subtraction",
    "money, spending, and saving",
    "A wallet holds money.",
  ),
  wire({
    skillCode: "subtraction",
    question:
      "Imagine your wallet has $50. You add another $20. How much more would you need to reach $125?",
    objectConnection:
      "Your wallet sent us to money, then imagined amounts to add and a savings target.",
    hint1: "First add the money already imagined in the wallet.",
    hint2: "Then subtract that total from 125.",
    valuesUsed: [
      operand("starting dollars", 50, "given_in_problem", "dollars"),
      operand("added dollars", 20, "given_in_problem", "dollars"),
      operand("target dollars", 125, "given_in_problem", "dollars"),
    ],
    correctAnswer: {
      type: "number",
      value: 55,
      numerator: null,
      denominator: null,
      unit: "dollars",
    },
    computation: {
      type: "multi_step_arithmetic",
      operation: "subtract",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("starting dollars", 50, "given_in_problem", "dollars"),
        operand("added dollars", 20, "given_in_problem", "dollars"),
        operand("target dollars", 125, "given_in_problem", "dollars"),
      ],
      steps: [
        {
          operation: "add",
          operands: [
            {
              ...operand("starting dollars", 50, "given_in_problem", "dollars"),
              kind: "value",
              step: null,
            },
            {
              ...operand("added dollars", 20, "given_in_problem", "dollars"),
              kind: "value",
              step: null,
            },
          ],
        },
        {
          operation: "subtract",
          operands: [
            {
              ...operand("target dollars", 125, "given_in_problem", "dollars"),
              kind: "value",
              step: null,
            },
            {
              label: "prior total",
              value: 0,
              unit: "dollars",
              origin: "given_in_problem",
              kind: "step_result",
              step: 0,
            },
          ],
        },
      ],
    },
    solution: "50 + 20 = 70, then 125 − 70 = 55 dollars.",
  }),
);

if (failed > 0) {
  console.error(`\n${failed} semantic-object math check(s) failed`);
  process.exit(1);
}

console.log("\nall semantic-object math checks passed");
