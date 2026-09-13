/**
 * Inspired Math generation and origin-separation checks.
 *
 * Run with: npx tsx lib/ai/inspired-math.check.ts
 *
 * These do not call a model. They finalise and verify inspired challenges
 * against a contextual payload, and reject origin masquerades.
 */

import {
  type ChallengeContext,
  type WireChallenge,
  finalizeChallenge,
} from "@/lib/ai/challenge-grounding";
import { buildContextualPayload } from "@/lib/ai/inspired-context";
import type {
  ObjectAnalysis,
  ReadySkillFit,
  UsedValue,
} from "@/lib/ai/schemas";
import { verifyChallenge } from "@/lib/math/verify";
import type { SkillId } from "@/lib/types";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

const basketball: ObjectAnalysis = {
  objectName: "basketball",
  category: "sports equipment",
  confidence: 0.94,
  visibleText: [],
  visibleMeasurements: [],
  countableProperties: [],
  shapeProperties: ["sphere", "circular panels", "curved surface"],
  observableProperties: ["orange pebbled surface"],
};

const wallet: ObjectAnalysis = {
  objectName: "wallet",
  category: "personal accessory",
  confidence: 0.9,
  visibleText: [],
  visibleMeasurements: [],
  countableProperties: [],
  shapeProperties: ["rectangular form"],
  observableProperties: ["card slots"],
};

const book: ObjectAnalysis = {
  objectName: "book",
  category: "reading material",
  confidence: 0.9,
  visibleText: [],
  visibleMeasurements: [],
  countableProperties: [],
  shapeProperties: ["rectangular cover"],
  observableProperties: ["printed pages"],
};

const sneaker: ObjectAnalysis = {
  objectName: "sneaker",
  category: "footwear",
  confidence: 0.91,
  visibleText: [],
  visibleMeasurements: [],
  countableProperties: [],
  shapeProperties: ["left-right symmetry"],
  observableProperties: ["laces"],
};

function inspiredFit(skill: SkillId, topic: string, reason: string): ReadySkillFit {
  return {
    selectedSkillCode: skill,
    fitScore: 0.62,
    challengeMode: "inspired_math",
    canGenerateChallenge: true,
    usableProperties: [],
    reason: "The object's real-world context can inspire this skill.",
    suggestedObjectCharacteristics: [],
    alternativeSkillCodes: [],
    anchors: [],
    evidenceRequest: null,
    inspirationContext: { topic, reason },
  };
}

function ctx(
  analysis: ObjectAnalysis,
  fit: ReadySkillFit,
): ChallengeContext {
  return {
    analysis,
    fit,
    skillId: fit.selectedSkillCode,
    grade: 4,
    studentEvidence: [],
    contextualGrounding: buildContextualPayload(analysis, fit.inspirationContext),
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
    hint1: "Use the basketball scoring facts.",
    hint2: "Add the two point values.",
    difficulty: 2,
    objectConnection: "Your basketball sent us to basketball scoring.",
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

function accepted(name: string, result: { status: string }) {
  if (result.status !== "ok") {
    console.error(`  ${name} status=${result.status}`);
  }

  check(name, result.status === "ok");
}

const basketballFit = inspiredFit(
  "addition",
  "basketball scores",
  "Scoring values are connected to basketball.",
);
const basketballCtx = ctx(basketball, basketballFit);
const basketballPayload = basketballCtx.contextualGrounding;

check(
  "basketball payload includes scoring values and not a celebrity default",
  basketballPayload !== null &&
    basketballPayload !== undefined &&
    basketballPayload.facts.some((fact) => fact.value === 1) &&
    basketballPayload.facts.some((fact) => fact.value === 3) &&
    !basketballPayload.facts.some((fact) => fact.value === 23),
);

const addition = finalizeChallenge(
  wire({
    skillCode: "addition",
    question:
      "In basketball, a free throw is worth 1 point and a shot from beyond the three-point line is worth 3 points. How many points is that altogether?",
    objectConnection:
      "Your basketball sent us to basketball scoring, not a number printed on the ball.",
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
  basketballCtx,
);

accepted("basketball + addition is accepted", addition);

const subtractionFit = inspiredFit(
  "subtraction",
  "basketball scores",
  "Score differences are basketball subtraction.",
);
const subtraction = finalizeChallenge(
  wire({
    skillCode: "subtraction",
    question:
      "In basketball, a three-point shot is worth 3 points and a free throw is worth 1 point. How many more points is the three-point shot?",
    hint1: "Compare the two scoring values.",
    hint2: "Subtract 1 from 3.",
    objectConnection:
      "Your basketball sent us to basketball scoring values.",
    valuesUsed: [
      operand("three-point shot", 3, "contextual", "points"),
      operand("free throw points", 1, "contextual", "point"),
    ],
    correctAnswer: {
      type: "number",
      value: 2,
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
        operand("three-point shot", 3, "contextual", "points"),
        operand("free throw points", 1, "contextual", "point"),
      ],
    },
    solution: "3 − 1 = 2 points.",
  }),
  ctx(basketball, subtractionFit),
);

accepted("basketball + subtraction is accepted", subtraction);

const multiplicationFit = inspiredFit(
  "multiplication",
  "basketball quarters",
  "Quarters and scoring can scale.",
);
const multiplication = finalizeChallenge(
  wire({
    skillCode: "multiplication",
    question:
      "In basketball, a shot from beyond the three-point line is worth 3 points. Suppose a team makes that shot in all 4 quarters. How many points is that?",
    hint1: "Use the three-point value.",
    hint2: "Multiply 3 by 4.",
    objectConnection:
      "Your basketball sent us to basketball scores and quarters.",
    valuesUsed: [
      operand("three-point shot", 3, "contextual", "points"),
      operand("quarters in a game", 4, "contextual"),
    ],
    correctAnswer: {
      type: "number",
      value: 12,
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
        operand("three-point shot", 3, "contextual", "points"),
        operand("quarters in a game", 4, "contextual"),
      ],
    },
    solution: "3 × 4 = 12 points.",
  }),
  ctx(basketball, multiplicationFit),
);

accepted("basketball + multiplication is accepted", multiplication);

const divisionFit = inspiredFit(
  "division",
  "basketball scores",
  "Equal scoring groups are basketball division.",
);
const division = finalizeChallenge(
  wire({
    skillCode: "division",
    question:
      "In basketball, a shot from inside the three-point line is worth 2 points. Suppose a player scored 12 points using only those shots. How many shots is that?",
    hint1: "Each shot is worth 2 points.",
    hint2: "Divide 12 by 2.",
    objectConnection:
      "Your basketball sent us to basketball scoring, then imagined a total.",
    valuesUsed: [
      operand("points scored", 12, "given_in_problem", "points"),
      operand("two-point shot", 2, "contextual", "points"),
    ],
    correctAnswer: {
      type: "number",
      value: 6,
      numerator: null,
      denominator: null,
      unit: "shots",
    },
    computation: {
      type: "division",
      operation: "quotient",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("points scored", 12, "given_in_problem", "points"),
        operand("two-point shot", 2, "contextual", "points"),
      ],
    },
    solution: "12 ÷ 2 = 6 shots.",
  }),
  ctx(basketball, divisionFit),
);

accepted("basketball + division is accepted", division);

const fractionsFit = inspiredFit(
  "fractions",
  "basketball quarters",
  "A game divided into quarters supports fractions.",
);
const fractions = finalizeChallenge(
  wire({
    skillCode: "fractions",
    question:
      "A basketball game is divided into 4 quarters. Suppose 1 quarter has been played. What fraction of the game remains?",
    hint1: "Start with all 4 quarters.",
    hint2: "3 quarters are still left.",
    objectConnection:
      "Your basketball sent us to the quarters of a basketball game.",
    valuesUsed: [
      operand("quarters in a game", 4, "contextual"),
      operand("quarters played", 1, "given_in_problem"),
    ],
    correctAnswer: {
      type: "fraction",
      value: null,
      numerator: 3,
      denominator: 4,
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
        operand("quarters in a game", 4, "contextual"),
        operand("quarters played", 1, "given_in_problem"),
      ],
    },
    solution: "4 − 1 = 3, so 3/4 of the game remains.",
  }),
  ctx(basketball, fractionsFit),
);

accepted("basketball + fractions is accepted", fractions);

const geometryFit = inspiredFit(
  "geometry",
  "basketball court geometry",
  "Court rectangles can inspire perimeter.",
);
const geometry = finalizeChallenge(
  wire({
    skillCode: "geometry",
    question:
      "Your basketball sent us to court geometry. Suppose a rectangular paint area on a basketball court is 12 feet long and 8 feet wide. What is its perimeter?",
    hint1: "Perimeter adds all four sides.",
    hint2: "Add 12 and 8, then double.",
    objectConnection:
      "Your basketball sent us to basketball court geometry, not a length printed on the ball.",
    valuesUsed: [
      operand("paint length", 12, "given_in_problem", "ft"),
      operand("paint width", 8, "given_in_problem", "ft"),
    ],
    correctAnswer: {
      type: "number",
      value: 40,
      numerator: null,
      denominator: null,
      unit: "ft",
    },
    computation: {
      type: "geometry",
      operation: "perimeter",
      shape: "rectangle",
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("paint length", 12, "given_in_problem", "ft"),
        operand("paint width", 8, "given_in_problem", "ft"),
      ],
    },
    solution: "2 × (12 + 8) = 40 ft.",
  }),
  ctx(basketball, geometryFit),
);

accepted("basketball + geometry is accepted", geometry);

const walletFit = inspiredFit(
  "subtraction",
  "money and budgeting",
  "Spending from a wallet is subtraction.",
);
const walletChallenge = finalizeChallenge(
  wire({
    skillCode: "subtraction",
    question:
      "Imagine your wallet has 20 dollars and you spend 7 dollars. How many dollars remain?",
    hint1: "Start with the amount in the wallet.",
    hint2: "Subtract 7 from 20.",
    objectConnection:
      "Your wallet sent us to money and spending, not a total printed on the wallet.",
    valuesUsed: [
      operand("starting dollars", 20, "given_in_problem", "dollars"),
      operand("amount spent", 7, "given_in_problem", "dollars"),
    ],
    correctAnswer: {
      type: "number",
      value: 13,
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
        operand("starting dollars", 20, "given_in_problem", "dollars"),
        operand("amount spent", 7, "given_in_problem", "dollars"),
      ],
    },
    solution: "20 − 7 = 13 dollars.",
  }),
  ctx(wallet, walletFit),
);

accepted("wallet + subtraction is accepted", walletChallenge);

const bookFit = inspiredFit(
  "multiplication",
  "pages and chapters",
  "Chapters and pages can scale.",
);
const bookChallenge = finalizeChallenge(
  wire({
    skillCode: "multiplication",
    question:
      "Suppose your book has 8 chapters and each chapter has 4 pages of pictures. How many picture pages is that altogether?",
    hint1: "Each chapter has the same number of picture pages.",
    hint2: "Multiply 8 by 4.",
    objectConnection:
      "Your book sent us to chapters and pages, not a page count visible on the cover.",
    valuesUsed: [
      operand("chapters", 8, "given_in_problem"),
      operand("picture pages per chapter", 4, "given_in_problem"),
    ],
    correctAnswer: {
      type: "number",
      value: 32,
      numerator: null,
      denominator: null,
      unit: "pages",
    },
    computation: {
      type: "arithmetic",
      operation: "multiply",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("chapters", 8, "given_in_problem"),
        operand("picture pages per chapter", 4, "given_in_problem"),
      ],
    },
    solution: "8 × 4 = 32 pages.",
  }),
  ctx(book, bookFit),
);

accepted("book + multiplication is accepted", bookChallenge);

const sneakerFit = inspiredFit(
  "addition",
  "pairs and shoe sizing",
  "Pairs give a grouping number.",
);
const sneakerChallenge = finalizeChallenge(
  wire({
    skillCode: "addition",
    question:
      "Sneakers come as a pair of 2 shoes. Suppose you get 2 more sneakers. How many sneakers is that altogether?",
    hint1: "Start with the pair.",
    hint2: "Add 2 and 2.",
    objectConnection:
      "Your sneaker sent us to pairs of sneakers, not a size printed in the shoe.",
    valuesUsed: [
      operand("shoes in a pair", 2, "contextual"),
      operand("extra sneakers", 2, "given_in_problem"),
    ],
    correctAnswer: {
      type: "number",
      value: 4,
      numerator: null,
      denominator: null,
      unit: "sneakers",
    },
    computation: {
      type: "arithmetic",
      operation: "add",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("shoes in a pair", 2, "contextual"),
        operand("extra sneakers", 2, "given_in_problem"),
      ],
    },
    solution: "2 + 2 = 4 sneakers.",
  }),
  ctx(sneaker, sneakerFit),
);

accepted("sneaker + addition is accepted", sneakerChallenge);

function verified(name: string, finalised: ReturnType<typeof finalizeChallenge>, context: ChallengeContext) {
  if (finalised.status !== "ok") {
    check(name, false);
    return;
  }

  const result = verifyChallenge({
    challenge: finalised.challenge,
    analysis: context.analysis,
    fit: context.fit,
    skillId: context.skillId,
    grade: context.grade,
    contextualGrounding: context.contextualGrounding,
  });

  if (!result.ok) {
    console.error(`  ${name} reason=${result.reason} detail=${result.detail}`);
  }

  check(name, result.ok);
}

verified("basketball + addition verifies", addition, basketballCtx);
verified(
  "wallet + subtraction verifies",
  walletChallenge,
  ctx(wallet, walletFit),
);

const inventedDiameter = finalizeChallenge(
  wire({
    skillCode: "addition",
    question:
      "Your basketball has a diameter of 10 inches. If you add 2 more inches, how wide is it?",
    valuesUsed: [
      operand("basketball diameter", 10, "observed", "in"),
      operand("extra inches", 2, "given_in_problem", "in"),
    ],
    correctAnswer: {
      type: "number",
      value: 12,
      numerator: null,
      denominator: null,
      unit: "in",
    },
    computation: {
      type: "arithmetic",
      operation: "add",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("basketball diameter", 10, "observed", "in"),
        operand("extra inches", 2, "given_in_problem", "in"),
      ],
    },
    solution: "10 + 2 = 12 inches.",
    objectConnection: "Your basketball shows a 10 inch diameter.",
  }),
  basketballCtx,
);

check(
  "invented basketball diameter labeled observed is rejected",
  inventedDiameter.status === "generation_failure",
);

const inventedSize = finalizeChallenge(
  wire({
    skillCode: "addition",
    question:
      "Your sneaker is size 8. Suppose you find a size 2 bigger. What size is that?",
    valuesUsed: [
      operand("shoe size", 8, "observed"),
      operand("sizes bigger", 2, "given_in_problem"),
    ],
    correctAnswer: {
      type: "number",
      value: 10,
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
        operand("shoe size", 8, "observed"),
        operand("sizes bigger", 2, "given_in_problem"),
      ],
    },
    solution: "8 + 2 = 10.",
    objectConnection: "Your sneaker shows size 8.",
  }),
  ctx(sneaker, sneakerFit),
);

check(
  "invented shoe size labeled observed is rejected",
  inventedSize.status === "generation_failure",
);

const jerseyAsObserved = finalizeChallenge(
  wire({
    skillCode: "addition",
    question:
      "Michael Jordan wore number 23. Suppose another player wears 12. What is the total?",
    valuesUsed: [
      operand("Jordan jersey", 23, "observed"),
      operand("other jersey", 12, "given_in_problem"),
    ],
    correctAnswer: {
      type: "number",
      value: 35,
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
        operand("Jordan jersey", 23, "observed"),
        operand("other jersey", 12, "given_in_problem"),
      ],
    },
    solution: "23 + 12 = 35.",
    objectConnection: "Your basketball shows jersey number 23.",
  }),
  basketballCtx,
);

check(
  "contextual jersey number labeled observed is rejected",
  jerseyAsObserved.status === "generation_failure",
);

const apples = finalizeChallenge(
  wire({
    skillCode: "addition",
    question: "Sarah has 8 apples and 4 are given to her. How many apples is that?",
    valuesUsed: [
      operand("apples Sarah has", 8, "given_in_problem"),
      operand("apples given", 4, "given_in_problem"),
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
        operand("apples Sarah has", 8, "given_in_problem"),
        operand("apples given", 4, "given_in_problem"),
      ],
    },
    solution: "8 + 4 = 12 apples.",
    objectConnection: "This question is about your basketball.",
  }),
  basketballCtx,
);

check(
  "unrelated apples problem anchored to basketball is rejected",
  apples.status === "generation_failure" || apples.status === "poor_fit",
);

const missingContextual = finalizeChallenge(
  wire({
    skillCode: "addition",
    question:
      "Michael Jordan famously wore 23. Suppose another player wears number 12. What is the total of the jersey numbers?",
    valuesUsed: [
      operand("Jordan jersey", 23, "contextual"),
      operand("other jersey", 12, "given_in_problem"),
    ],
    correctAnswer: {
      type: "number",
      value: 35,
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
        operand("Jordan jersey", 23, "contextual"),
        operand("other jersey", 12, "given_in_problem"),
      ],
    },
    solution: "23 + 12 = 35.",
    objectConnection:
      "Your basketball sent us to jersey numbers from basketball.",
  }),
  basketballCtx,
);

check(
  "contextual number missing from contextual grounding is rejected",
  missingContextual.status === "generation_failure",
);

const unstatedHypothetical = finalizeChallenge(
  wire({
    skillCode: "addition",
    question:
      "In basketball, a free throw is worth 1 point. How many points is that plus another score?",
    valuesUsed: [
      operand("free throw points", 1, "contextual", "point"),
      operand("other score", 6, "given_in_problem", "points"),
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
      operation: "add",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("free throw points", 1, "contextual", "point"),
        operand("other score", 6, "given_in_problem", "points"),
      ],
    },
    solution: "1 + 6 = 7 points.",
    objectConnection: "Your basketball sent us to basketball scoring.",
  }),
  basketballCtx,
);

check(
  "hypothetical value not stated in the question is rejected",
  unstatedHypothetical.status === "generation_failure",
);

if (addition.status === "ok") {
  const withoutPayload = verifyChallenge({
    challenge: addition.challenge,
    analysis: basketball,
    fit: basketballFit,
    skillId: "addition",
    grade: 4,
    contextualGrounding: null,
  });

  check(
    "contextual values fail verification when the payload is missing",
    !withoutPayload.ok && withoutPayload.reason === "ungrounded_value",
  );
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log("\nall inspired-math checks passed");
