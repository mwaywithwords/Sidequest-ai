/**
 * Deterministic presentation-repair checks.
 *
 * Run with: npx tsx lib/ai/challenge-repair.check.ts
 *
 * These do not call a model. They replay the wallet Grade 4 Addition
 * trace class and neighbouring presentation repairs.
 */

import {
  type ChallengeContext,
  type WireChallenge,
  finalizeChallenge,
} from "@/lib/ai/challenge-grounding";
import {
  applyDeterministicSolution,
  prepareCandidateChallenge,
} from "@/lib/ai/challenge-repair";
import { buildContextualPayload } from "@/lib/ai/inspired-context";
import type { ObjectAnalysis, ReadySkillFit, UsedValue } from "@/lib/ai/schemas";
import { verifyChallenge } from "@/lib/math/verify";
import type { Grade, SkillId } from "@/lib/types";

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
  shapeProperties: ["rectangular form"],
  observableProperties: ["card slots", "billfold"],
  typicalUses: ["holding cards", "holding money", "carrying small personal items"],
});

const cup = reading("cup", "kitchenware", {
  shapeProperties: ["cylinder"],
  observableProperties: ["open rim"],
});

const shoe = reading("sneaker", "footwear", {
  shapeProperties: ["curved sole"],
  observableProperties: ["laces"],
});

const basketball = reading("basketball", "sporting goods", {
  shapeProperties: ["sphere"],
  observableProperties: ["orange pebbled surface"],
});

const bottle: ObjectAnalysis = {
  objectName: "protein shake bottle",
  category: "packaged beverage",
  confidence: 0.92,
  visibleText: ["Premier Protein", "11 FL OZ"],
  visibleMeasurements: [
    { value: 11, unit: "fl oz", label: "printed bottle volume" },
  ],
  countableProperties: [],
  shapeProperties: ["rectangular carton with a screw cap"],
  observableProperties: ["purple plastic cap"],
};

function inspiredFit(skill: SkillId, topic: string, reason: string): ReadySkillFit {
  return {
    selectedSkillCode: skill,
    fitScore: 0.68,
    challengeMode: "inspired_math",
    canGenerateChallenge: true,
    usableProperties: [],
    reason,
    suggestedObjectCharacteristics: [],
    alternativeSkillCodes: [],
    anchors: [],
    evidenceRequest: null,
    inspirationContext: { topic, reason },
  };
}

function objectFit(skill: SkillId, property: string): ReadySkillFit {
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

function ctx(
  analysis: ObjectAnalysis,
  fit: ReadySkillFit,
  grade: Grade = 4,
): ChallengeContext {
  return {
    analysis,
    fit,
    skillId: fit.selectedSkillCode,
    grade,
    studentEvidence: [],
    contextualGrounding:
      fit.challengeMode === "inspired_math"
        ? buildContextualPayload(analysis, fit.inspirationContext)
        : null,
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

function arithmeticWire(
  skillCode: SkillId,
  question: string,
  connection: string,
  values: ReturnType<typeof operand>[],
  operation: "add" | "subtract" | "multiply",
  answer: number,
  unit: string | null,
  extras: Partial<WireChallenge> = {},
): WireChallenge {
  return {
    canGenerate: true,
    question,
    skillCode,
    solution: extras.solution ?? "The calculation is shown here.",
    hint1: "Use the numbers in the question.",
    hint2: "Do the operation the skill names.",
    difficulty: 2,
    objectConnection: connection,
    verificationStrategy: "Evaluate the structured computation.",
    valuesUsed: values,
    shapesUsed: [],
    correctAnswer: {
      type: "number",
      value: answer,
      numerator: null,
      denominator: null,
      unit,
    },
    computation: {
      type: "arithmetic",
      operation,
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: values,
    },
    ...extras,
  };
}

function walletAddition(overrides: Partial<WireChallenge> = {}): WireChallenge {
  return arithmeticWire(
    "addition",
    "Suppose your wallet has $20 and you add $50. How much money do you have?",
    "Your wallet sent us to money, then imagined amounts to add.",
    [
      operand("starting dollars", 20, "given_in_problem", "dollars"),
      operand("added dollars", 50, "given_in_problem", "dollars"),
    ],
    "add",
    70,
    "dollars",
    overrides,
  );
}

function prepared(
  wire: WireChallenge,
  analysis: ObjectAnalysis,
  fit: ReadySkillFit,
  grade: Grade = 4,
) {
  const context = ctx(analysis, fit, grade);
  const finalized = prepareCandidateChallenge(wire, context);
  const verified =
    finalized.status === "ok"
      ? verifyChallenge({
          challenge: finalized.challenge,
          analysis,
          fit,
          skillId: fit.selectedSkillCode,
          grade,
          contextualGrounding: context.contextualGrounding,
        })
      : null;
  return { context, finalized, verified };
}

const walletFit = inspiredFit(
  "addition",
  "money, spending, and saving",
  "A wallet holds money.",
);

const silentWallet = prepared(
  walletAddition({ solution: "Add the two amounts together." }),
  wallet,
  walletFit,
);

check(
  "wallet Grade 4 addition repairs an omitted solution and verifies",
  silentWallet.finalized.status === "ok" &&
    silentWallet.finalized.repairs.includes("deterministic_solution") &&
    silentWallet.finalized.challenge.solution ===
      "Add $20 and $50. $20 + $50 = $70." &&
    silentWallet.verified?.ok === true,
);

check(
  "wallet solution repair does not change origins",
  silentWallet.finalized.status === "ok" &&
    silentWallet.finalized.challenge.valuesUsed.every(
      (value) => value.origin === "given_in_problem",
    ),
);

const unframedWallet = prepared(
  walletAddition({
    question: "Your wallet has $20 and you add $50. How much money do you have?",
    solution: "Add $20 and $50. $20 + $50 = $70.",
  }),
  wallet,
  walletFit,
);

check(
  "wallet unframed given_in_problem amounts get a Suppose prefix",
  unframedWallet.finalized.status === "ok" &&
    unframedWallet.finalized.repairs.includes("hypothetical_prefix") &&
    unframedWallet.finalized.framingRepair === "hypothetical_prefix" &&
    unframedWallet.finalized.challenge.question ===
      "Suppose your wallet has $20 and you add $50. How much money do you have?" &&
    unframedWallet.verified?.ok === true,
);

const unframedWalletGrade5 = prepared(
  walletAddition({
    question: "Your wallet has $20 and you add $50. How much money do you have?",
    solution: "Add $20 and $50. $20 + $50 = $70.",
  }),
  wallet,
  walletFit,
  5,
);

check(
  "wallet unframed Grade 5 addition is prefixed and verifies",
  unframedWalletGrade5.finalized.status === "ok" &&
    unframedWalletGrade5.finalized.framingRepair === "hypothetical_prefix" &&
    unframedWalletGrade5.finalized.challenge.question ===
      "Suppose your wallet has $20 and you add $50. How much money do you have?" &&
    unframedWalletGrade5.verified?.ok === true,
);

const unframedWalletExtraAnswer = prepared(
  walletAddition({
    question: "Your wallet has $20 and you add $50. How much money do you have?",
    solution: "Add $20 and $50. $20 + $50 = $70.",
    valuesUsed: [
      operand("starting dollars", 20, "given_in_problem", "dollars"),
      operand("added dollars", 50, "given_in_problem", "dollars"),
      operand("total", 70, "given_in_problem", "dollars"),
    ],
  }),
  wallet,
  walletFit,
);

check(
  "wallet framing repair uses source values, not a leftover answer",
  unframedWalletExtraAnswer.finalized.status === "ok" &&
    unframedWalletExtraAnswer.finalized.framingRepair === "hypothetical_prefix" &&
    unframedWalletExtraAnswer.finalized.challenge.question ===
      "Suppose your wallet has $20 and you add $50. How much money do you have?" &&
    unframedWalletExtraAnswer.verified?.ok === true,
);

check(
  "already framed wallet is not prefixed again",
  silentWallet.finalized.status === "ok" &&
    silentWallet.finalized.framingRepair === "repair_not_applicable" &&
    !silentWallet.finalized.repairs.includes("hypothetical_prefix") &&
    silentWallet.finalized.challenge.question.startsWith("Suppose your wallet"),
);

const bothRepairs = prepared(
  walletAddition({
    question: "Your wallet has $20 and you add $50. How much money do you have?",
    solution: "Add the two amounts together.",
  }),
  wallet,
  walletFit,
);

check(
  "wallet can apply both presentation repairs on one candidate",
  bothRepairs.finalized.status === "ok" &&
    bothRepairs.finalized.repairs.includes("hypothetical_prefix") &&
    bothRepairs.finalized.repairs.includes("deterministic_solution") &&
    bothRepairs.verified?.ok === true,
);

const walletSubtract = prepared(
  arithmeticWire(
    "subtraction",
    "Suppose your wallet has $125 and you spend $70. How much money remains?",
    "Your wallet sent us to money and spending.",
    [
      operand("starting dollars", 125, "given_in_problem", "dollars"),
      operand("amount spent", 70, "given_in_problem", "dollars"),
    ],
    "subtract",
    55,
    "dollars",
    { solution: "Take the smaller amount away." },
  ),
  wallet,
  inspiredFit("subtraction", "money, spending, and saving", "A wallet holds money."),
);

check(
  "wallet subtraction solution is generated from the computation",
  walletSubtract.finalized.status === "ok" &&
    walletSubtract.finalized.challenge.solution ===
      "Subtract $70 from $125. $125 − $70 = $55." &&
    walletSubtract.verified?.ok === true,
);

const walletMultiply = prepared(
  arithmeticWire(
    "multiplication",
    "Imagine your wallet contains 6 five-dollar bills. How much money is that?",
    "Your wallet sent us to money, then imagined bills to multiply.",
    [
      operand("number of bills", 6, "given_in_problem"),
      operand("dollars on each bill", 5, "given_in_problem", "dollars"),
    ],
    "multiply",
    30,
    "dollars",
    { solution: "Count the bills." },
  ),
  wallet,
  inspiredFit("multiplication", "money, spending, and saving", "A wallet holds money."),
);

check(
  "wallet multiplication solution is generated from the computation",
  walletMultiply.finalized.status === "ok" &&
    walletMultiply.finalized.challenge.solution ===
      "Multiply 6 by $5. 6 × $5 = $30." &&
    walletMultiply.verified?.ok === true,
);

const cupDivisionWire: WireChallenge = {
  canGenerate: true,
  question:
    "Suppose your cup holds 250 mL for this Sidequest. If you have 1,000 mL of water, how many cups could you fill?",
  skillCode: "division",
  solution: "Share the water equally.",
  hint1: "Each cup holds the same imagined amount.",
  hint2: "Divide 1,000 by 250.",
  difficulty: 2,
  objectConnection:
    "Your cup sent us to pouring and sharing a drink, not a number printed on the cup.",
  verificationStrategy: "Divide 1000 by 250.",
  valuesUsed: [
    operand("total water", 1000, "given_in_problem", "mL"),
    operand("cup amount", 250, "given_in_problem", "mL"),
  ],
  shapesUsed: [],
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
};

const cupDivision = prepared(
  cupDivisionWire,
  cup,
  inspiredFit("division", "liquid, pouring, and servings", "A cup holds a drink."),
);

check(
  "cup division solution is generated from the computation",
  cupDivision.finalized.status === "ok" &&
    cupDivision.finalized.challenge.solution ===
      "Divide 1,000 mL by 250 mL. 1,000 mL ÷ 250 mL = 4." &&
    cupDivision.verified?.ok === true,
);

const sneakerMultiply = prepared(
  arithmeticWire(
    "multiplication",
    "Imagine you walk 12 steps in each of 3 laps in your sneaker. How many steps is that?",
    "Your sneaker sent us to walking and steps.",
    [
      operand("steps in a lap", 12, "given_in_problem"),
      operand("laps", 3, "given_in_problem"),
    ],
    "multiply",
    36,
    null,
    { solution: "Count the laps." },
  ),
  shoe,
  inspiredFit("multiplication", "walking, steps, and pairs", "A sneaker is for walking."),
);

check(
  "sneaker multiplication solution is generated from the computation",
  sneakerMultiply.finalized.status === "ok" &&
    sneakerMultiply.finalized.challenge.solution ===
      "Multiply 12 by 3. 12 × 3 = 36." &&
    sneakerMultiply.verified?.ok === true,
);

const bottleSubtract = prepared(
  arithmeticWire(
    "subtraction",
    "The bottle in your photo contains 11 fluid ounces. If 4 fluid ounces are poured out, how many remain?",
    "Your bottle shows 11 fl oz, so that real measurement becomes the starting amount.",
    [
      operand("printed bottle volume", 11, "observed", "fl oz"),
      operand("amount poured out", 4, "given_in_problem", "fl oz"),
    ],
    "subtract",
    7,
    "fl oz",
    { solution: "Look at the bottle and think about it." },
  ),
  bottle,
  objectFit("subtraction", "printed bottle volume: 11 fl oz"),
);

check(
  "protein bottle subtraction solution is generated from the computation",
  bottleSubtract.finalized.status === "ok" &&
    bottleSubtract.finalized.challenge.solution ===
      "Subtract 4 fl oz from 11 fl oz. 11 fl oz − 4 fl oz = 7 fl oz." &&
    bottleSubtract.verified?.ok === true,
);

const multiStepWire: WireChallenge = {
  canGenerate: true,
  question:
    "Let's say your wallet has $50. You add $20. How much more would you need to reach $125?",
  skillCode: "subtraction",
  solution: "Work it out in two parts.",
  hint1: "First add the money already imagined in the wallet.",
  hint2: "Then subtract that total from 125.",
  difficulty: 2,
  objectConnection:
    "Your wallet sent us to money, then imagined amounts to add and a savings target.",
  verificationStrategy: "Add 50 and 20, then subtract that total from 125.",
  valuesUsed: [
    operand("starting dollars", 50, "given_in_problem", "dollars"),
    operand("added dollars", 20, "given_in_problem", "dollars"),
    operand("target dollars", 125, "given_in_problem", "dollars"),
  ],
  shapesUsed: [],
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
          { ...operand("starting dollars", 50, "given_in_problem", "dollars"), kind: "value", step: null },
          { ...operand("added dollars", 20, "given_in_problem", "dollars"), kind: "value", step: null },
        ],
      },
      {
        operation: "subtract",
        operands: [
          { ...operand("target dollars", 125, "given_in_problem", "dollars"), kind: "value", step: null },
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
};

const multiStep = prepared(
  multiStepWire,
  wallet,
  inspiredFit("subtraction", "money, spending, and saving", "A wallet holds money."),
);

check(
  "multi-step wallet solution explains each verified step",
  multiStep.finalized.status === "ok" &&
    multiStep.finalized.challenge.solution ===
      "Add $50 and $20. $50 + $20 = $70. Subtract $70 from $125. $125 − $70 = $55." &&
    multiStep.verified?.ok === true,
);

const cupFraming = prepared(
  arithmeticWire(
    "multiplication",
    "Your cup holds 500 mL. How much water would 2 cups hold?",
    "Your cup sent us to liquid and servings.",
    [
      operand("cup amount", 500, "given_in_problem", "mL"),
      operand("cups", 2, "given_in_problem"),
    ],
    "multiply",
    1000,
    "mL",
    { solution: "500 × 2 = 1000 mL." },
  ),
  cup,
  inspiredFit("multiplication", "liquid, pouring, and servings", "A cup is used for drinking."),
);

check(
  "cup unframed given_in_problem capacity gets a Suppose prefix",
  cupFraming.finalized.status === "ok" &&
    cupFraming.finalized.challenge.question.startsWith("Suppose your cup holds 500 mL") &&
    cupFraming.verified?.ok === true,
);

const shoeFraming = prepared(
  arithmeticWire(
    "multiplication",
    "Your sneaker takes 12 steps in each of 3 laps. How many steps is that?",
    "Your sneaker sent us to walking and steps.",
    [
      operand("steps in a lap", 12, "given_in_problem"),
      operand("laps", 3, "given_in_problem"),
    ],
    "multiply",
    36,
    null,
    { solution: "12 × 3 = 36." },
  ),
  shoe,
  inspiredFit("multiplication", "walking, steps, and pairs", "A sneaker is for walking."),
);

check(
  "shoe unframed given_in_problem steps get a Suppose prefix",
  shoeFraming.finalized.status === "ok" &&
    shoeFraming.finalized.challenge.question.startsWith(
      "Suppose your sneaker takes 12 steps",
    ) &&
    shoeFraming.verified?.ok === true,
);

const basketballFraming = prepared(
  arithmeticWire(
    "addition",
    "Your basketball team has 20 points and you add 50 points. How many points is that?",
    "Your basketball sent us to scoring and points.",
    [
      operand("starting points", 20, "given_in_problem", "points"),
      operand("added points", 50, "given_in_problem", "points"),
    ],
    "add",
    70,
    "points",
    { solution: "20 + 50 = 70 points." },
  ),
  basketball,
  inspiredFit("addition", "scoring, teams, and shots", "Basketball games have scores."),
);

check(
  "basketball unframed given_in_problem points get a Suppose prefix",
  basketballFraming.finalized.status === "ok" &&
    basketballFraming.finalized.challenge.question.startsWith(
      "Suppose your basketball team has 20 points",
    ) &&
    basketballFraming.verified?.ok === true,
);

const inventedObserved = prepareCandidateChallenge(
  walletAddition({
    question: "Your wallet contains $20. How much more money would you need to reach $70?",
    valuesUsed: [
      operand("starting dollars", 20, "observed", "dollars"),
      operand("added dollars", 50, "given_in_problem", "dollars"),
    ],
    computation: {
      type: "arithmetic",
      operation: "add",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("starting dollars", 20, "observed", "dollars"),
        operand("added dollars", 50, "given_in_problem", "dollars"),
      ],
    },
  }),
  ctx(wallet, walletFit),
);

check(
  "invented observed wallet amount still fails",
  inventedObserved.status === "generation_failure",
);

const contextualAsGiven = prepareCandidateChallenge(
  arithmeticWire(
    "addition",
    "Suppose a basketball free throw is worth 1 point and you add 3 points. How many points is that?",
    "Your basketball sent us to scoring.",
    [
      operand("free throw points", 1, "given_in_problem", "point"),
      operand("added points", 3, "given_in_problem", "points"),
    ],
    "add",
    4,
    "points",
    { solution: "1 + 3 = 4 points." },
  ),
  ctx(
    basketball,
    inspiredFit("addition", "scoring, teams, and shots", "Basketball games have scores."),
  ),
);

check(
  "contextual fact mislabeled given_in_problem still fails",
  contextualAsGiven.status === "generation_failure",
);

const walletApples = prepareCandidateChallenge(
  arithmeticWire(
    "addition",
    "Your wallet is next to 8 apples and 4 more apples. How many apples is that?",
    "This question is about your wallet.",
    [
      operand("apples", 8, "given_in_problem"),
      operand("more apples", 4, "given_in_problem"),
    ],
    "add",
    12,
    "apples",
    { solution: "8 + 4 = 12 apples." },
  ),
  ctx(wallet, walletFit),
);

check(
  "unrelated wallet → apples still fails and is not framed into a pass",
  walletApples.status !== "ok",
);

const wrongAnswer = prepared(
  walletAddition({
    correctAnswer: {
      type: "number",
      value: 80,
      numerator: null,
      denominator: null,
      unit: "dollars",
    },
    solution: "20 + 50 = 80 dollars.",
  }),
  wallet,
  walletFit,
);

check(
  "computation answer mismatch still fails",
  wrongAnswer.finalized.status === "ok" &&
    wrongAnswer.verified?.ok === false &&
    wrongAnswer.verified?.reason === "incorrect_answer" &&
    !wrongAnswer.finalized.repairs.includes("deterministic_solution"),
);

const wrongSkill = prepareCandidateChallenge(
  walletAddition({ skillCode: "subtraction" }),
  ctx(wallet, walletFit),
);

check("wrong skill still fails", wrongSkill.status === "generation_failure");

const gradeTooHard = prepared(
  arithmeticWire(
    "addition",
    "Suppose your wallet has $20,000 and you add $50,000. How much money do you have?",
    "Your wallet sent us to money.",
    [
      operand("starting dollars", 20000, "given_in_problem", "dollars"),
      operand("added dollars", 50000, "given_in_problem", "dollars"),
    ],
    "add",
    70000,
    "dollars",
    { solution: "20000 + 50000 = 70000 dollars." },
  ),
  wallet,
  walletFit,
  4,
);

check(
  "grade-inappropriate challenge still fails",
  gradeTooHard.finalized.status === "ok" &&
    gradeTooHard.verified?.ok === false &&
    gradeTooHard.verified?.reason === "grade_inappropriate",
);

const missingNumber = prepareCandidateChallenge(
  walletAddition({
    question: "Your wallet has some money and you add more. How much money do you have?",
  }),
  ctx(wallet, walletFit),
);

check(
  "missing hypothetical value in the question still fails",
  missingNumber.status === "generation_failure",
);

check(
  "framing repair cannot invent a missing number",
  missingNumber.status === "generation_failure" &&
    missingNumber.issue.code === "unframed_hypothetical",
);

const objectMathUnframed = finalizeChallenge(
  arithmeticWire(
    "subtraction",
    "The bottle in your photo contains 11 fluid ounces. 4 fluid ounces are poured out. How many remain?",
    "Your bottle shows 11 fl oz, so that real measurement becomes the starting amount.",
    [
      operand("printed bottle volume", 11, "observed", "fl oz"),
      operand("amount poured out", 4, "given_in_problem", "fl oz"),
    ],
    "subtract",
    7,
    "fl oz",
    { solution: "11 − 4 = 7 fl oz." },
  ),
  ctx(bottle, objectFit("subtraction", "printed bottle volume: 11 fl oz")),
);

check(
  "object_math mixed-origin unframed hypothetical is not prefixed",
  objectMathUnframed.status === "generation_failure",
);

const beverageCan: ObjectAnalysis = {
  objectName: "beverage can",
  category: "packaged beverage",
  confidence: 0.94,
  visibleText: ["222 mL"],
  visibleMeasurements: [
    { value: 222, unit: "mL", label: "printed can volume" },
  ],
  countableProperties: [],
  shapeProperties: ["cylinder"],
  observableProperties: ["pull tab"],
  typicalUses: [
    "drinking",
    "holding a flavored beverage",
    "single-serve beverage container",
  ],
};

const waterBottle: ObjectAnalysis = {
  objectName: "water bottle",
  category: "packaged beverage",
  confidence: 0.9,
  visibleText: ["12 FL OZ"],
  visibleMeasurements: [
    { value: 12, unit: "fl oz", label: "printed bottle volume" },
  ],
  countableProperties: [],
  shapeProperties: ["cylinder"],
  observableProperties: ["screw cap"],
};

function divisionWire(
  skillCode: SkillId,
  question: string,
  connection: string,
  dividend: ReturnType<typeof operand>,
  divisor: ReturnType<typeof operand>,
  answer: number,
  unit: string | null,
): WireChallenge {
  return {
    canGenerate: true,
    question,
    skillCode,
    solution: "Divide the two amounts.",
    hint1: "Use the numbers in the question.",
    hint2: "Share the amount into equal groups.",
    difficulty: 2,
    objectConnection: connection,
    verificationStrategy: "Evaluate the structured computation.",
    valuesUsed: [dividend, divisor],
    shapesUsed: [],
    correctAnswer: {
      type: "number",
      value: answer,
      numerator: null,
      denominator: null,
      unit,
    },
    computation: {
      type: "division",
      operation: "quotient",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [dividend, divisor],
    },
  };
}

const canAddition = prepared(
  arithmeticWire(
    "addition",
    "222 mL plus another 100 mL equals how much?",
    "Your can shows 222 mL, so that printed volume starts the addition.",
    [
      operand("printed can volume", 222, "observed", "mL"),
      operand("added volume", 100, "given_in_problem", "mL"),
    ],
    "add",
    322,
    "mL",
    { solution: "Add the two amounts." },
  ),
  beverageCan,
  objectFit("addition", "printed can volume: 222 mL"),
);

check(
  "beverage can Grade 4 addition repairs a missing object reference",
  canAddition.finalized.status === "ok" &&
    canAddition.finalized.repairs.includes("object_reference") &&
    canAddition.finalized.challenge.question.includes("can") &&
    canAddition.finalized.challenge.question.toLowerCase().includes("photo") &&
    canAddition.finalized.challenge.question.includes("222") &&
    canAddition.finalized.challenge.question.includes("100") &&
    canAddition.verified?.ok === true,
);

check(
  "can addition repair keeps observed 222 mL and given 100 mL",
  canAddition.finalized.status === "ok" &&
    canAddition.finalized.challenge.valuesUsed.some(
      (value) =>
        value.origin === "observed" &&
        value.value === 222 &&
        value.unit === "mL",
    ) &&
    canAddition.finalized.challenge.valuesUsed.some(
      (value) =>
        value.origin === "given_in_problem" &&
        value.value === 100 &&
        value.unit === "mL",
    ) &&
    canAddition.finalized.challenge.correctAnswer.type === "number" &&
    canAddition.finalized.challenge.correctAnswer.value === 322 &&
    canAddition.finalized.challenge.computation.type === "arithmetic",
);

check(
  "can addition repair does not invent a second observed can",
  canAddition.finalized.status === "ok" &&
    canAddition.finalized.challenge.valuesUsed.filter(
      (value) => value.origin === "observed",
    ).length === 1,
);

const canFramed = prepared(
  arithmeticWire(
    "addition",
    "If you add another 100 mL to 222 mL, how much is that altogether?",
    "Your can shows 222 mL, so that printed volume starts the addition.",
    [
      operand("printed can volume", 222, "observed", "mL"),
      operand("added volume", 100, "given_in_problem", "mL"),
    ],
    "add",
    322,
    "mL",
    { solution: "222 + 100 = 322 mL." },
  ),
  beverageCan,
  objectFit("addition", "printed can volume: 222 mL"),
);

check(
  "framed can addition gets a minimal attribution prefix",
  canFramed.finalized.status === "ok" &&
    canFramed.finalized.repairs.includes("object_reference") &&
    canFramed.finalized.challenge.question.startsWith(
      "The can in your photo contains 222 mL.",
    ) &&
    canFramed.finalized.challenge.question.includes("If you add another 100 mL") &&
    canFramed.verified?.ok === true,
);

const bottleSubtractMissingRef = prepared(
  arithmeticWire(
    "subtraction",
    "11 fl oz minus 4 fl oz equals how much?",
    "Your bottle shows 11 fl oz, so that real measurement becomes the starting amount.",
    [
      operand("printed bottle volume", 11, "observed", "fl oz"),
      operand("amount poured out", 4, "given_in_problem", "fl oz"),
    ],
    "subtract",
    7,
    "fl oz",
    { solution: "Subtract 4 from 11." },
  ),
  bottle,
  objectFit("subtraction", "printed bottle volume: 11 fl oz"),
);

check(
  "protein bottle subtraction repairs a missing object reference",
  bottleSubtractMissingRef.finalized.status === "ok" &&
    bottleSubtractMissingRef.finalized.repairs.includes("object_reference") &&
    bottleSubtractMissingRef.finalized.challenge.question.includes("bottle") &&
    bottleSubtractMissingRef.verified?.ok === true,
);

const canMultiply = prepared(
  arithmeticWire(
    "multiplication",
    "222 mL times 3 equals how much?",
    "Your can shows 222 mL, so that printed volume is the group we scale up.",
    [
      operand("printed can volume", 222, "observed", "mL"),
      operand("number of cans", 3, "given_in_problem"),
    ],
    "multiply",
    666,
    "mL",
    { solution: "Multiply 222 by 3." },
  ),
  beverageCan,
  objectFit("multiplication", "printed can volume: 222 mL"),
);

check(
  "can multiplication repairs a missing object reference",
  canMultiply.finalized.status === "ok" &&
    canMultiply.finalized.repairs.includes("object_reference") &&
    canMultiply.finalized.challenge.question.includes("222") &&
    canMultiply.finalized.challenge.question.includes("3") &&
    canMultiply.verified?.ok === true,
);

const bottleDivide = prepared(
  divisionWire(
    "division",
    "12 fl oz split into 3 equal groups equals how much each?",
    "Your bottle shows 12 fl oz, so that printed volume is shared into groups.",
    operand("printed bottle volume", 12, "observed", "fl oz"),
    operand("number of groups", 3, "given_in_problem"),
    4,
    "fl oz",
  ),
  waterBottle,
  objectFit("division", "printed bottle volume: 12 fl oz"),
);

check(
  "bottle division repairs a missing object reference",
  bottleDivide.finalized.status === "ok" &&
    bottleDivide.finalized.repairs.includes("object_reference") &&
    bottleDivide.finalized.challenge.question.includes("12") &&
    bottleDivide.finalized.challenge.question.includes("3") &&
    bottleDivide.verified?.ok === true,
);

const multiStepMisaligned = prepared(
  {
    ...multiStepWire,
    valuesUsed: [
      operand("starting dollars", 50, "given_in_problem", "dollars"),
      operand("added dollars", 20, "given_in_problem", "dollars"),
      operand("running total", 70, "given_in_problem", "dollars"),
      operand("final amount", 55, "given_in_problem", "dollars"),
    ],
  },
  wallet,
  inspiredFit("subtraction", "money, spending, and saving", "A wallet holds money."),
);

check(
  "multi-step valuesUsed drops intermediates and restores source operands",
  multiStepMisaligned.finalized.status === "ok" &&
    multiStepMisaligned.finalized.repairs.includes("values_used") &&
    multiStepMisaligned.finalized.challenge.valuesUsed.some(
      (value) => value.value === 125 && value.origin === "given_in_problem",
    ) &&
    !multiStepMisaligned.finalized.challenge.valuesUsed.some(
      (value) => value.value === 70,
    ) &&
    !multiStepMisaligned.finalized.challenge.valuesUsed.some(
      (value) => value.value === 55,
    ) &&
    multiStepMisaligned.verified?.ok === true,
);

const inventedCanVolume = prepareCandidateChallenge(
  arithmeticWire(
    "addition",
    "250 mL plus another 100 mL equals how much?",
    "Your can shows 250 mL.",
    [
      operand("printed can volume", 250, "observed", "mL"),
      operand("added volume", 100, "given_in_problem", "mL"),
    ],
    "add",
    350,
    "mL",
  ),
  ctx(beverageCan, objectFit("addition", "printed can volume: 222 mL")),
);

check(
  "invented observed 250 mL still fails when ObjectAnalysis says 222 mL",
  inventedCanVolume.status === "generation_failure" &&
    inventedCanVolume.issue.code === "ungrounded_observed_value",
);

const observedMissingFromQuestion = prepareCandidateChallenge(
  arithmeticWire(
    "addition",
    "100 mL plus another 50 mL equals how much?",
    "Your can shows 222 mL.",
    [
      operand("printed can volume", 222, "observed", "mL"),
      operand("added volume", 100, "given_in_problem", "mL"),
    ],
    "add",
    322,
    "mL",
  ),
  ctx(beverageCan, objectFit("addition", "printed can volume: 222 mL")),
);

check(
  "observed value not present in the question is not repaired",
  observedMissingFromQuestion.status === "generation_failure",
);

const differentObjectRepair = prepared(
  arithmeticWire(
    "addition",
    "222 mL plus another 100 mL equals how much?",
    "Your can shows 222 mL, so that printed volume starts the addition.",
    [
      operand("printed can volume", 222, "observed", "mL"),
      operand("added volume", 100, "given_in_problem", "mL"),
    ],
    "add",
    322,
    "mL",
  ),
  beverageCan,
  objectFit("addition", "printed can volume: 222 mL"),
);

check(
  "object reference repair uses the photographed can, not a different object",
  differentObjectRepair.finalized.status === "ok" &&
    differentObjectRepair.finalized.challenge.question.toLowerCase().includes("can") &&
    !differentObjectRepair.finalized.challenge.question.toLowerCase().includes("bottle") &&
    !differentObjectRepair.finalized.challenge.question.toLowerCase().includes("sneaker"),
);

const sourceMismatch = prepareCandidateChallenge(
  {
    ...multiStepWire,
    valuesUsed: [
      operand("starting dollars", 50, "given_in_problem", "dollars"),
      operand("added dollars", 20, "given_in_problem", "dollars"),
      operand("target dollars", 125, "given_in_problem", "cents"),
    ],
    computation: {
      ...multiStepWire.computation,
      operands: [
        operand("starting dollars", 50, "given_in_problem", "dollars"),
        operand("added dollars", 20, "given_in_problem", "dollars"),
        operand("target dollars", 125, "given_in_problem", "dollars"),
      ],
    },
  },
  ctx(
    wallet,
    inspiredFit("subtraction", "money, spending, and saving", "A wallet holds money."),
  ),
);

check(
  "computation/valuesUsed unit disagreement still fails",
  sourceMismatch.status === "generation_failure" &&
    sourceMismatch.issue.code === "computation_value_mismatch",
);

const givenMissing = prepareCandidateChallenge(
  arithmeticWire(
    "addition",
    "222 mL plus some more equals how much?",
    "Your can shows 222 mL.",
    [
      operand("printed can volume", 222, "observed", "mL"),
      operand("added volume", 100, "given_in_problem", "mL"),
    ],
    "add",
    322,
    "mL",
  ),
  ctx(beverageCan, objectFit("addition", "printed can volume: 222 mL")),
);

check(
  "given value missing from the question still fails",
  givenMissing.status === "generation_failure",
);

const canApples = prepareCandidateChallenge(
  arithmeticWire(
    "addition",
    "There are 8 apples and 4 more apples. How many apples is that?",
    "This question is about your can.",
    [
      operand("apples", 8, "given_in_problem"),
      operand("more apples", 4, "given_in_problem"),
    ],
    "add",
    12,
    "apples",
  ),
  ctx(beverageCan, objectFit("addition", "printed can volume: 222 mL")),
);

check(
  "irrelevant apple problem still fails for a beverage can",
  canApples.status !== "ok",
);

if (silentWallet.finalized.status === "ok") {
  const untouched = applyDeterministicSolution({
    ...silentWallet.finalized.challenge,
    solution: "Add $20 and $50. $20 + $50 = $70.",
  });
  check(
    "an already-deterministic solution is left in place",
    untouched.repaired === false,
  );
}

if (failed > 0) {
  console.error(`\n${failed} challenge-repair check(s) failed`);
  process.exit(1);
}

console.log("\nall challenge-repair checks passed");
