/**
 * Combined quest-generation section checks.
 *
 * Run with: npx tsx lib/ai/quest-generation.check.ts
 *
 * These do not call a model. They prove the four investigation outcomes
 * still parse into application schemas, that discovery is required only
 * on a ready challenge path, and that a malformed section fails closed.
 */

import type { WireChallenge } from "@/lib/ai/challenge-grounding";
import type { WireDiscovery } from "@/lib/ai/discovery-grounding";
import { finalizeQuestGeneration } from "@/lib/ai/quest-generation-finalize";
import type { ObjectAnalysis } from "@/lib/ai/schemas";
import type { SkillFitWire } from "@/lib/ai/skill-fit-finalize";

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

function investigation(
  overrides: Partial<SkillFitWire> = {},
): SkillFitWire {
  return {
    challengeMode: "object_math",
    fitScore: 0.8,
    usableProperties: ["printed bottle volume: 11 fl oz"],
    reason: "The printed volume anchors subtraction.",
    suggestedObjectCharacteristics: [],
    alternativeSkillCodes: [],
    evidenceRequest: null,
    inspirationContext: null,
    ...overrides,
  };
}

function discovery(overrides: Partial<WireDiscovery> = {}): WireDiscovery {
  return {
    title: "Made to carry a drink",
    text: "Drink bottles are designed to hold liquids securely while being easy to carry. Their shape and labels also help people quickly see how much they contain.",
    category: "design",
    factSupport: "well_known",
    ...overrides,
  };
}

function operand(
  label: string,
  value: number,
  origin: "observed" | "given_in_problem",
  unit: string | null = null,
) {
  return { label, value, unit, origin };
}

function challenge(overrides: Partial<WireChallenge> = {}): WireChallenge {
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

const objectMath = finalizeQuestGeneration(
  {
    investigation: investigation(),
    discovery: discovery(),
    challenge: challenge(),
  },
  { analysis: bottle, skillId: "subtraction", grade: 4 },
);

check(
  "object_math returns a separately validated fit, discovery, and challenge",
  objectMath.status === "ok" &&
    objectMath.fit.challengeMode === "object_math" &&
    objectMath.discovery.title === "Made to carry a drink" &&
    objectMath.challenge.correctAnswer.type === "number" &&
    objectMath.challenge.correctAnswer.type === "number" &&
    objectMath.challenge.correctAnswer.value === 7,
);

const needsEvidence = finalizeQuestGeneration(
  {
    investigation: investigation({
      challengeMode: "investigation_math",
      usableProperties: [],
      reason: "A size label would unlock subtraction.",
      evidenceRequest: {
        type: "second_photo",
        prompt: "Find the size label inside your sneaker and take a picture of it.",
        targetProperty: "shoe size",
        reason:
          "The shoe size gives us a real number we can use for your subtraction Sidequest.",
      },
    }),
    discovery: null,
    challenge: null,
  },
  { analysis: sneaker, skillId: "subtraction", grade: 4 },
);

check(
  "investigation_math does not require discovery or a challenge",
  needsEvidence.status === "needsEvidence" &&
    needsEvidence.fit.evidenceRequest.targetProperty === "shoe size",
);

const blankReading: ObjectAnalysis = {
  objectName: "unmarked object",
  category: "unknown",
  confidence: 0.6,
  visibleText: [],
  visibleMeasurements: [],
  countableProperties: [],
  shapeProperties: [],
  observableProperties: [],
};

const poorFit = finalizeQuestGeneration(
  {
    investigation: investigation({
      challengeMode: "poor_fit",
      fitScore: 0.1,
      usableProperties: [],
      reason: "No honest path remained after the three investigations.",
      suggestedObjectCharacteristics: ["a printed quantity"],
      alternativeSkillCodes: ["geometry"],
    }),
    discovery: null,
    challenge: null,
  },
  { analysis: blankReading, skillId: "subtraction", grade: 4 },
);

check(
  "genuine poor_fit is accepted without discovery or a challenge",
  poorFit.status === "poorFit" &&
    poorFit.fit.challengeMode === "poor_fit" &&
    poorFit.failure.reason === "poor_skill_fit",
);

const inspired = finalizeQuestGeneration(
  {
    investigation: investigation({
      challengeMode: "inspired_math",
      usableProperties: ["rectangular carton with a screw cap"],
      reason: "Money context can support addition.",
      inspirationContext: {
        topic: "money, dollars, and budgeting",
        reason: "A bottle can sit next to a spending story only if we stay honest.",
      },
    }),
    discovery: discovery(),
    challenge: challenge({
      canGenerate: false,
      question: "",
      skillCode: "addition",
      solution: "",
      hint1: "",
      hint2: "",
      difficulty: 0,
      objectConnection: "",
      verificationStrategy: "",
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
        operands: [
          operand("placeholder", 0, "given_in_problem"),
          operand("placeholder", 0, "given_in_problem"),
        ],
      },
    }),
  },
  { analysis: bottle, skillId: "addition", grade: 4 },
);

check(
  "inspired_math with canGenerate false is a poor-fit decline, not a ready quest",
  inspired.status === "poorFit" && inspired.failure.reason === "poor_skill_fit",
);

const missingDiscovery = finalizeQuestGeneration(
  {
    investigation: investigation(),
    discovery: null,
    challenge: challenge(),
  },
  { analysis: bottle, skillId: "subtraction", grade: 4 },
);

check(
  "a ready path without discovery fails closed",
  missingDiscovery.status === "failed" &&
    missingDiscovery.failure.reason === "generation_failure",
);

const missingChallenge = finalizeQuestGeneration(
  {
    investigation: investigation(),
    discovery: discovery(),
    challenge: null,
  },
  { analysis: bottle, skillId: "subtraction", grade: 4 },
);

check(
  "a ready path without a challenge fails closed",
  missingChallenge.status === "failed" &&
    missingChallenge.failure.reason === "generation_failure",
);

const malformedInvestigation = finalizeQuestGeneration(
  {
    investigation: investigation({
      challengeMode: "object_math",
      fitScore: 1.5,
      usableProperties: ["printed bottle volume: 11 fl oz"],
      reason: "The printed volume anchors subtraction.",
    }),
    discovery: discovery(),
    challenge: challenge(),
  },
  { analysis: bottle, skillId: "subtraction", grade: 4 },
);

check(
  "a malformed investigation section fails closed",
  malformedInvestigation.status === "failed" &&
    malformedInvestigation.failure.reason === "generation_failure",
);

const inventedObserved = finalizeQuestGeneration(
  {
    investigation: investigation(),
    discovery: discovery(),
    challenge: challenge({
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
      correctAnswer: {
        type: "number",
        value: 8,
        numerator: null,
        denominator: null,
        unit: "fl oz",
      },
    }),
  },
  { analysis: bottle, skillId: "subtraction", grade: 4 },
);

check(
  "an invented observed value fails generation finalization",
  inventedObserved.status === "failed",
);

if (failed > 0) {
  console.error(`\n${failed} quest generation check(s) failed`);
  process.exit(1);
}

console.log("\nall quest generation checks passed");
