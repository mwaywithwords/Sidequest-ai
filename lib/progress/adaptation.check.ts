/**
 * Deterministic adaptation-policy checks.
 *
 * Run with: npx tsx lib/progress/adaptation.check.ts
 */

import { finalizeChallenge } from "@/lib/ai/challenge-grounding";
import type { ObjectAnalysis, ReadySkillFit } from "@/lib/ai/schemas";
import { gradeViolation } from "@/lib/math/grade-rules";
import {
  adaptationGenerationGuidance,
  AUTO_MAX_DIFFICULTY,
  AUTO_MIN_DIFFICULTY,
  getAdaptiveProfile,
  gradeDefaultDifficulty,
  masteryBandFromScore,
  recentDifficultyAdjustment,
  recentOutcomesFromCompleted,
  recentTrendFromOutcomes,
  type AdaptiveProfile,
} from "@/lib/progress/adaptation";
import {
  completedSidequests,
  type SkillAttemptRow,
  type SkillProgressSnapshot,
} from "@/lib/progress/mastery";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

function progress(
  overrides: Partial<SkillProgressSnapshot>,
): SkillProgressSnapshot {
  return {
    totalAttempts: 0,
    correctAttempts: 0,
    masteryScore: 0,
    currentLevel: 1,
    ...overrides,
  };
}

function profile(
  overrides: Parameters<typeof getAdaptiveProfile>[0],
): AdaptiveProfile {
  return getAdaptiveProfile(overrides);
}

function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

const usableProperties = ["printed bottle volume: 11 fl oz"];

// --- mastery thresholds ----------------------------------------------------

check("40% is mastery 0.40, not 40", masteryBandFromScore(0.4) === "developing");
check("70% is mastery 0.70, not 70", masteryBandFromScore(0.7) === "developing");
check("mastery below 0.40 is support", masteryBandFromScore(0.399) === "support");
check("mastery above 0.70 is advancing", masteryBandFromScore(0.701) === "advancing");

// --- cold start ------------------------------------------------------------

const noHistoryGrade3 = profile({
  grade: 3,
  progress: null,
  recentOutcomes: [],
});
check(
  "no progress uses the Grade 3 default",
  noHistoryGrade3.targetDifficulty === gradeDefaultDifficulty(3),
);
check("no progress is not classified as struggling", noHistoryGrade3.masteryBand === "developing");
check("no progress uses standard hints", noHistoryGrade3.hintSupport === "standard");
check("no progress uses standard complexity", noHistoryGrade3.complexity === "standard");
check(
  "no progress has insufficient recent data",
  noHistoryGrade3.recentTrend === "insufficient_data",
);

const noHistoryGrade5 = profile({
  grade: 5,
  progress: null,
  recentOutcomes: [],
});
check(
  "no progress uses the Grade 5 default",
  noHistoryGrade5.targetDifficulty === 3,
);

const emptyRow = profile({
  grade: 4,
  progress: progress({
    totalAttempts: 0,
    correctAttempts: 0,
    masteryScore: 0,
    currentLevel: 1,
  }),
  recentOutcomes: [],
});
check(
  "an empty progress row is treated as no history, not support",
  emptyRow.masteryBand === "developing" &&
    emptyRow.targetDifficulty === gradeDefaultDifficulty(4) &&
    emptyRow.hintSupport === "standard",
);

const oneCorrect = profile({
  grade: 4,
  progress: progress({
    totalAttempts: 1,
    correctAttempts: 1,
    masteryScore: 1,
    currentLevel: 1,
  }),
  recentOutcomes: [true],
});
check("one correct Sidequest does not become advancing", oneCorrect.masteryBand === "developing");
check("one correct Sidequest keeps standard hints", oneCorrect.hintSupport === "standard");
check(
  "one correct Sidequest does not jump to difficulty 4",
  oneCorrect.targetDifficulty <= 3,
);
check(
  "one correct Sidequest stays within one of the Grade 4 default",
  Math.abs(oneCorrect.targetDifficulty - gradeDefaultDifficulty(4)) <= 1,
);

const oneUnsuccessful = profile({
  grade: 4,
  progress: progress({
    totalAttempts: 1,
    correctAttempts: 0,
    masteryScore: 0,
    currentLevel: 1,
  }),
  recentOutcomes: [false],
});
check(
  "one unsuccessful Sidequest does not become support",
  oneUnsuccessful.masteryBand === "developing",
);
check(
  "one unsuccessful Sidequest does not switch to strong hints",
  oneUnsuccessful.hintSupport === "standard",
);
check(
  "one unsuccessful Sidequest stays close to the grade default",
  Math.abs(oneUnsuccessful.targetDifficulty - gradeDefaultDifficulty(4)) <= 1,
);

const twoMixed = profile({
  grade: 4,
  progress: progress({
    totalAttempts: 2,
    correctAttempts: 1,
    masteryScore: 0.5,
    currentLevel: 1,
  }),
  recentOutcomes: [true, false],
});
check("two mixed outcomes stay in developing", twoMixed.masteryBand === "developing");
check("two mixed outcomes are insufficient recent data", twoMixed.recentTrend === "insufficient_data");
check(
  "two mixed outcomes do not jump more than one from the grade default",
  Math.abs(twoMixed.targetDifficulty - gradeDefaultDifficulty(4)) <= 1,
);

const grade3OneCorrect = profile({
  grade: 3,
  progress: progress({
    totalAttempts: 1,
    correctAttempts: 1,
    masteryScore: 1,
    currentLevel: 1,
  }),
  recentOutcomes: [true],
});
check(
  "cold-start Grade 3 never jumps from default 2 to 4",
  grade3OneCorrect.targetDifficulty <= 3 &&
    Math.abs(grade3OneCorrect.targetDifficulty - 2) <= 1,
);

// --- support band ----------------------------------------------------------

const supportBase = profile({
  grade: 4,
  progress: progress({
    totalAttempts: 5,
    correctAttempts: 1,
    masteryScore: 0.2,
    currentLevel: 1,
  }),
  recentOutcomes: [false, false, false],
});
check("support band is mastery below 0.40", supportBase.masteryBand === "support");
check(
  "support target stays 1–2",
  inRange(supportBase.targetDifficulty, 1, 2),
);
check("support uses strong hints", supportBase.hintSupport === "strong");
check("support uses clean complexity", supportBase.complexity === "clean");
check("support with three misses is struggling", supportBase.recentTrend === "struggling");

const supportImproving = profile({
  grade: 4,
  progress: progress({
    totalAttempts: 5,
    correctAttempts: 1,
    masteryScore: 0.2,
    currentLevel: 2,
  }),
  recentOutcomes: [true, true, true],
});
check(
  "support improving trend cannot leave the 1–2 band",
  supportImproving.masteryBand === "support" &&
    supportImproving.recentTrend === "improving" &&
    supportImproving.targetDifficulty === 2,
);

const displayedScoreIgnored = profile({
  grade: 4,
  progress: progress({
    totalAttempts: 5,
    correctAttempts: 1,
    masteryScore: 1,
    currentLevel: 1,
  }),
  recentOutcomes: [false, false, false],
});
check(
  "adaptation uses solve-rate counts, not displayed mastery_score",
  displayedScoreIgnored.masteryBand === "support",
);

// --- developing band -------------------------------------------------------

const developingLow = profile({
  grade: 4,
  progress: progress({
    totalAttempts: 5,
    correctAttempts: 2,
    masteryScore: 0.4,
    currentLevel: 2,
  }),
  recentOutcomes: [true, false, true],
});
check("mastery exactly 0.40 is developing", developingLow.masteryBand === "developing");
check(
  "developing target stays 2–3 at the 0.40 boundary",
  inRange(developingLow.targetDifficulty, 2, 3),
);
check("developing uses standard hints", developingLow.hintSupport === "standard");
check("mixed recent results stay mixed", developingLow.recentTrend === "mixed");

const developingHigh = profile({
  grade: 4,
  progress: progress({
    totalAttempts: 10,
    correctAttempts: 7,
    masteryScore: 0.7,
    currentLevel: 3,
  }),
  recentOutcomes: [true, false, false],
});
check("mastery exactly 0.70 is developing", developingHigh.masteryBand === "developing");
check(
  "developing target stays 2–3 at the 0.70 boundary",
  inRange(developingHigh.targetDifficulty, 2, 3),
);

// --- advancing band --------------------------------------------------------

const advancing = profile({
  grade: 5,
  progress: progress({
    totalAttempts: 8,
    correctAttempts: 7,
    masteryScore: 0.875,
    currentLevel: 3,
  }),
  recentOutcomes: [true, true, true],
});
check("mastery above 0.70 is advancing", advancing.masteryBand === "advancing");
check("advancing target stays 3–4", inRange(advancing.targetDifficulty, 3, 4));
check("advancing uses light hints", advancing.hintSupport === "light");
check("advancing uses challenging complexity", advancing.complexity === "challenging");
check(
  "strong recent advancing performance may rise by one inside the band",
  advancing.targetDifficulty === 4,
);

const advancingAtFive = profile({
  grade: 5,
  progress: progress({
    totalAttempts: 12,
    correctAttempts: 11,
    masteryScore: 0.917,
    currentLevel: 5,
  }),
  recentOutcomes: [true, true, true],
});
check(
  "mastery alone cannot auto-generate difficulty 5",
  advancingAtFive.targetDifficulty === 4,
);

// --- recent trends ---------------------------------------------------------

check(
  "last 3 successful is improving",
  recentTrendFromOutcomes([true, true, true]) === "improving",
);
check(
  "last 3 unsuccessful is struggling",
  recentTrendFromOutcomes([false, false, false]) === "struggling",
);
check(
  "mixed recent results are mixed",
  recentTrendFromOutcomes([true, false, true]) === "mixed",
);
check(
  "fewer than 3 recent results are insufficient",
  recentTrendFromOutcomes([true, false]) === "insufficient_data",
);
check("improving recent outcomes adjust +1", recentDifficultyAdjustment([true, true, true]) === 1);
check(
  "struggling recent outcomes adjust -1",
  recentDifficultyAdjustment([false, false, false]) === -1,
);
check(
  "mixed recent outcomes do not adjust",
  recentDifficultyAdjustment([true, true, false]) === 0,
);
check(
  "fewer than 3 recent outcomes do not adjust",
  recentDifficultyAdjustment([true, true]) === 0,
);

const olderLosses = profile({
  grade: 4,
  progress: progress({
    totalAttempts: 5,
    correctAttempts: 3,
    masteryScore: 0.6,
    currentLevel: 2,
  }),
  recentOutcomes: [false, false, true, true, true],
});
check(
  "only the last 3 completed Sidequests set the recent trend",
  olderLosses.recentTrend === "improving",
);

const threeSubmissionsOneQuest: SkillAttemptRow[] = [
  {
    challengeId: "c1",
    isCorrect: false,
    attemptNumber: 1,
    createdAt: "2026-09-12T00:00:00.000Z",
  },
  {
    challengeId: "c1",
    isCorrect: false,
    attemptNumber: 2,
    createdAt: "2026-09-12T00:00:01.000Z",
  },
  {
    challengeId: "c1",
    isCorrect: false,
    attemptNumber: 3,
    createdAt: "2026-09-12T00:00:02.000Z",
  },
  {
    challengeId: "c2",
    isCorrect: true,
    attemptNumber: 1,
    createdAt: "2026-09-12T00:00:03.000Z",
  },
];
check(
  "recent outcomes count completed Sidequests, not raw submissions",
  recentOutcomesFromCompleted(completedSidequests(threeSubmissionsOneQuest)).join(",") ===
    "false,true",
);

// --- bounds ----------------------------------------------------------------

const floor = profile({
  grade: 3,
  progress: progress({
    totalAttempts: 6,
    correctAttempts: 1,
    masteryScore: 0.166,
    currentLevel: 1,
  }),
  recentOutcomes: [false, false, false],
});
check("target never falls below 1", floor.targetDifficulty >= AUTO_MIN_DIFFICULTY);

const ceiling = profile({
  grade: 5,
  progress: progress({
    totalAttempts: 10,
    correctAttempts: 9,
    masteryScore: 0.9,
    currentLevel: 5,
  }),
  recentOutcomes: [true, true, true],
});
check("target never rises above 4", ceiling.targetDifficulty <= AUTO_MAX_DIFFICULTY);

const developingAtTwo = profile({
  grade: 4,
  progress: progress({
    totalAttempts: 6,
    correctAttempts: 3,
    masteryScore: 0.5,
    currentLevel: 2,
  }),
  recentOutcomes: [true, false, true],
});
const developingStreak = profile({
  grade: 4,
  progress: progress({
    totalAttempts: 6,
    correctAttempts: 3,
    masteryScore: 0.5,
    currentLevel: 2,
  }),
  recentOutcomes: [true, true, true],
});
check(
  "recent adjustment is at most one level",
  Math.abs(developingStreak.targetDifficulty - developingAtTwo.targetDifficulty) <= 1,
);

// --- current_level ---------------------------------------------------------

const respectsLevel = profile({
  grade: 4,
  progress: progress({
    totalAttempts: 6,
    correctAttempts: 3,
    masteryScore: 0.5,
    currentLevel: 3,
  }),
  recentOutcomes: [true, false, true],
});
check(
  "developing students keep current_level when it is already in band",
  respectsLevel.targetDifficulty === 3,
);

const noJump = profile({
  grade: 5,
  progress: progress({
    totalAttempts: 5,
    correctAttempts: 4,
    masteryScore: 0.8,
    currentLevel: 1,
  }),
  recentOutcomes: [true, true, true],
});
check(
  "current_level 1 cannot jump to difficulty 4",
  noJump.targetDifficulty !== 4 && noJump.targetDifficulty <= 3,
);
check(
  "high mastery at level 1 still increases gradually",
  noJump.targetDifficulty === 3,
);

const gradualDown = profile({
  grade: 4,
  progress: progress({
    totalAttempts: 6,
    correctAttempts: 1,
    masteryScore: 0.166,
    currentLevel: 4,
  }),
  recentOutcomes: [true, false, true],
});
check(
  "a high current_level decreases gradually toward support",
  gradualDown.targetDifficulty === 3,
);

const gradualDownStreak = profile({
  grade: 4,
  progress: progress({
    totalAttempts: 6,
    correctAttempts: 1,
    masteryScore: 0.166,
    currentLevel: 4,
  }),
  recentOutcomes: [false, false, false],
});
check(
  "recent struggles may drop one more level, still inside the band",
  gradualDownStreak.targetDifficulty === 2,
);

// --- grounding stays independent -------------------------------------------

const advancingProfile = advancing;
check(
  "adaptation profile does not carry usableProperties",
  !("usableProperties" in advancingProfile),
);
check(
  "adaptation profile does not create observed values",
  !("valuesUsed" in advancingProfile) &&
    !("observed" in advancingProfile) &&
    usableProperties[0] === "printed bottle volume: 11 fl oz",
);

const guidance = adaptationGenerationGuidance(advancingProfile);
check(
  "generation guidance still requires grounding over difficulty",
  guidance.includes("OBJECT GROUNDING BEATS DIFFICULTY"),
);
check(
  "generation guidance does not mention student-facing mastery percentages",
  !guidance.includes("0.875") && !guidance.includes("87.5"),
);

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

const bottleFit: ReadySkillFit = {
  selectedSkillCode: "subtraction",
  fitScore: 0.8,
  challengeMode: "object_math",
  canGenerateChallenge: true,
  usableProperties,
  reason: "The printed volume can start a subtraction problem.",
  suggestedObjectCharacteristics: [],
  alternativeSkillCodes: [],
  anchors: [{ property: "printed bottle volume: 11 fl oz", origin: "observed" }],
  evidenceRequest: null,
  inspirationContext: null,
};

const inventedAtTarget = finalizeChallenge(
  {
    canGenerate: true,
    question:
      "The bottle in your photo contains 12 fluid ounces. If 4 fluid ounces are poured out, how many remain?",
    skillCode: "subtraction",
    solution: "12 − 4 = 8",
    hint1: "Start with the label.",
    hint2: "Subtract the poured amount.",
    difficulty: advancingProfile.targetDifficulty,
    objectConnection: "Your bottle shows 12 fl oz.",
    verificationStrategy: "subtract",
    valuesUsed: [
      {
        label: "printed bottle volume",
        value: 12,
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
    correctAnswer: {
      type: "number",
      value: 8,
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
        {
          label: "printed bottle volume",
          value: 12,
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
  },
  {
    analysis: bottle,
    fit: bottleFit,
    skillId: "subtraction",
    grade: 5,
    studentEvidence: [],
  },
);
check(
  "grounding is still required at an advancing target difficulty",
  inventedAtTarget.status === "generation_failure",
);

const groundedSimple = finalizeChallenge(
  {
    canGenerate: true,
    question:
      "The bottle in your photo contains 11 fluid ounces. If 4 fluid ounces are poured out, how many fluid ounces remain?",
    skillCode: "subtraction",
    solution: "Start with 11 fluid ounces. Take away 4. 11 − 4 = 7 fluid ounces.",
    hint1: "The label tells you how much the bottle held to start with.",
    hint2: "Take the amount poured out away from 11.",
    difficulty: advancingProfile.targetDifficulty,
    objectConnection:
      "Your bottle shows 11 fl oz, so that real measurement becomes the starting amount in the subtraction problem.",
    verificationStrategy:
      "Subtract the poured-out amount from the printed bottle volume.",
    valuesUsed: [
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
  },
  {
    analysis: bottle,
    fit: bottleFit,
    skillId: "subtraction",
    grade: 5,
    studentEvidence: [],
  },
);
check(
  "a simple grounded problem is still accepted for a high-mastery student",
  groundedSimple.status === "ok",
);

// --- grade rules still win -------------------------------------------------

const conversion = {
  type: "conversion" as const,
  operation: "multiply" as const,
  value: {
    label: "printed bottle volume",
    value: 11,
    unit: "fl oz",
    origin: "observed" as const,
  },
  factor: {
    label: "ounces in a cup",
    value: 8,
    unit: "fl oz",
    origin: "given_in_problem" as const,
  },
};
const grade3Advancing = profile({
  grade: 3,
  progress: progress({
    totalAttempts: 8,
    correctAttempts: 7,
    masteryScore: 0.875,
    currentLevel: 3,
  }),
  recentOutcomes: [true, true, true],
});
check(
  "an advancing Grade 3 student can still be given a higher target",
  inRange(grade3Advancing.targetDifficulty, 3, 4),
);
check(
  "adaptive target does not allow Grade 3 conversions",
  gradeViolation(
    3,
    conversion,
    [conversion.value, conversion.factor],
    { type: "number", value: 88, unit: "fl oz" },
  ) !== null,
);

const decimalAnswer = { type: "number" as const, value: 2.5, unit: "fl oz" };
check(
  "adaptive target does not allow Grade 3 decimals",
  gradeViolation(
    3,
    {
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
          value: 8.5,
          unit: "fl oz",
          origin: "given_in_problem",
        },
      ],
    },
    [
      {
        label: "printed bottle volume",
        value: 11,
        unit: "fl oz",
        origin: "observed",
      },
      {
        label: "amount poured out",
        value: 8.5,
        unit: "fl oz",
        origin: "given_in_problem",
      },
    ],
    decimalAnswer,
  ) !== null,
);

const wideFraction = gradeViolation(
  3,
  {
    type: "fraction_of",
    quantity: {
      label: "printed bottle volume",
      value: 11,
      unit: "fl oz",
      origin: "observed",
    },
    numerator: 1,
    denominator: 12,
  },
  [
    {
      label: "printed bottle volume",
      value: 11,
      unit: "fl oz",
      origin: "observed",
    },
  ],
  { type: "number", value: 11 / 12, unit: "fl oz" },
);
check(
  "adaptive target does not bypass Grade 3 fraction denominator limits",
  wideFraction !== null,
);

const grade3Area = gradeViolation(
  3,
  {
    type: "geometry",
    operation: "area",
    shape: "rectangle",
    dimensions: [
      { label: "pane width", value: 12, unit: "in", origin: "observed" },
      { label: "pane height", value: 18, unit: "in", origin: "observed" },
    ],
  },
  [
    { label: "pane width", value: 12, unit: "in", origin: "observed" },
    { label: "pane height", value: 18, unit: "in", origin: "observed" },
  ],
  { type: "number", value: 216, unit: "sq in" },
);
check("adaptive target does not allow unsupported Grade 3 area", grade3Area !== null);

check(
  "grade guidance is part of generation notes",
  guidance.includes("GRADE RULES BEAT DIFFICULTY"),
);

const sameA = profile({
  grade: 4,
  progress: progress({
    totalAttempts: 6,
    correctAttempts: 3,
    masteryScore: 0.5,
    currentLevel: 2,
  }),
  recentOutcomes: [true, false, true],
});
const sameB = profile({
  grade: 4,
  progress: progress({
    totalAttempts: 6,
    correctAttempts: 3,
    masteryScore: 0.5,
    currentLevel: 2,
  }),
  recentOutcomes: [true, false, true],
});
check(
  "the same inputs always produce the same profile",
  sameA.targetDifficulty === sameB.targetDifficulty &&
    sameA.masteryBand === sameB.masteryBand &&
    sameA.recentTrend === sameB.recentTrend,
);

if (failed > 0) {
  console.error(`\n${failed} adaptation checks failed`);
  process.exit(1);
}

console.log("\nall adaptation checks passed");
