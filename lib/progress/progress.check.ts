/**
 * Attempt, hint, and skill-progress checks.
 *
 * Run with: npx tsx lib/progress/progress.check.ts
 */

import type { CorrectAnswer } from "@/lib/ai/schemas";
import {
  clampLevel,
  completedSidequests,
  levelFromHistory,
  masteryScore,
  shouldCountTowardProgress,
  skillProgressFromAttempts,
  type SkillAttemptRow,
} from "@/lib/progress/mastery";
import {
  canAcceptAttempt,
  hintUsedForAttempt,
  isChallengeComplete,
  MAX_ANSWER_ATTEMPTS,
  nextAttemptNumber,
  progressAfterAttempt,
  progressFromAttempts,
  questIsGradeable,
  toStudentGradeView,
  VISUAL_XP,
} from "@/lib/progress/outcome";

let failed = 0;

function eligibilityReason(
  input: Parameters<typeof questIsGradeable>[0],
): string | null {
  const result = questIsGradeable(input);
  return result.ok ? null : result.reason;
}

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

const expected: CorrectAnswer = { type: "number", value: 7, unit: "fl oz" };

const firstMiss = progressAfterAttempt({
  isCorrect: false,
  attemptNumber: 1,
  hint1: "Hint one",
  hint2: "Hint two",
  solution: "7 minus the leftover.",
  expected,
});

const secondMiss = progressAfterAttempt({
  isCorrect: false,
  attemptNumber: 2,
  hint1: "Hint one",
  hint2: "Hint two",
  solution: "7 minus the leftover.",
  expected,
});

const thirdMiss = progressAfterAttempt({
  isCorrect: false,
  attemptNumber: 3,
  hint1: "Hint one",
  hint2: "Hint two",
  solution: "7 minus the leftover.",
  expected,
});

const firstHit = progressAfterAttempt({
  isCorrect: true,
  attemptNumber: 1,
  hint1: "Hint one",
  hint2: "Hint two",
  solution: "7 minus the leftover.",
  expected,
});

const laterHit = progressAfterAttempt({
  isCorrect: true,
  attemptNumber: 2,
  hint1: "Hint one",
  hint2: "Hint two",
  solution: "7 minus the leftover.",
  expected,
});

check("first incorrect attempt is still open", firstMiss.status === "incorrect");
check(
  "Hint 1 follows the first miss",
  firstMiss.status === "incorrect" && firstMiss.hint === "Hint one",
);
check(
  "Hint 2 follows the second miss",
  secondMiss.status === "incorrect" && secondMiss.hint === "Hint two",
);
check("third miss completes the Sidequest", thirdMiss.status === "complete");
check(
  "third miss reveals the solution, not the raw answer object",
  thirdMiss.status === "complete" &&
    thirdMiss.solution === "7 minus the leftover." &&
    thirdMiss.revealedAnswer === "7 fl oz" &&
    !("correct_answer" in thirdMiss) &&
    !("correctAnswer" in thirdMiss),
);
check("correct first attempt awards visual XP", firstHit.status === "correct" && firstHit.xp === VISUAL_XP);
check(
  "correct after one miss still succeeds",
  laterHit.status === "correct" && laterHit.attemptNumber === 2,
);

check("next attempt after none is 1", nextAttemptNumber([]) === 1);
check(
  "next attempt after 1 and 2 is 3",
  nextAttemptNumber([
    { attemptNumber: 1, isCorrect: false },
    { attemptNumber: 2, isCorrect: false },
  ]) === 3,
);

const threeMisses = [
  { attemptNumber: 1, isCorrect: false },
  { attemptNumber: 2, isCorrect: false },
  { attemptNumber: 3, isCorrect: false },
];

check("three misses complete the challenge", isChallengeComplete(threeMisses));
check("a fourth attempt is refused", canAcceptAttempt(threeMisses) === false);
check(
  "a correct attempt also completes",
  isChallengeComplete([{ attemptNumber: 1, isCorrect: true }]),
);
check(
  "no attempt is accepted after a correct one",
  canAcceptAttempt([{ attemptNumber: 1, isCorrect: true }]) === false,
);

check("first attempt without opening a hint is not hint_used", hintUsedForAttempt(1, false) === false);
check("first attempt after opening Hint 1 is hint_used", hintUsedForAttempt(1, true) === true);
check(
  "later attempts stay hint_used because Hint 1 remains visible",
  hintUsedForAttempt(2, false) === true,
);

check(
  "restoring two misses shows Hint 2",
  progressFromAttempts({
    attempts: [
      { attemptNumber: 1, isCorrect: false },
      { attemptNumber: 2, isCorrect: false },
    ],
    hint1: "Hint one",
    hint2: "Hint two",
    solution: "Worked out.",
    expected,
  }).status === "incorrect" &&
    progressFromAttempts({
      attempts: [
        { attemptNumber: 1, isCorrect: false },
        { attemptNumber: 2, isCorrect: false },
      ],
      hint1: "Hint one",
      hint2: "Hint two",
      solution: "Worked out.",
      expected,
    }).status === "incorrect",
);

const restoredSecond = progressFromAttempts({
  attempts: [
    { attemptNumber: 1, isCorrect: false },
    { attemptNumber: 2, isCorrect: false },
  ],
  hint1: "Hint one",
  hint2: "Hint two",
  solution: "Worked out.",
  expected,
});

check(
  "restored second miss carries Hint 2",
  restoredSecond.status === "incorrect" && restoredSecond.hint === "Hint two",
);

const firstSuccess: SkillAttemptRow[] = [
  {
    challengeId: "c1",
    isCorrect: true,
    attemptNumber: 1,
    createdAt: "2026-09-12T00:00:00.000Z",
  },
];

const firstSuccessProgress = skillProgressFromAttempts(firstSuccess);
check("first successful Sidequest is one completed attempt", firstSuccessProgress.totalAttempts === 1);
check("first successful Sidequest is one correct", firstSuccessProgress.correctAttempts === 1);
check("first successful mastery is 1", firstSuccessProgress.masteryScore === 1);
check("level stays at 1 before the sample threshold", firstSuccessProgress.currentLevel === 1);

const firstReveal: SkillAttemptRow[] = [
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
];

const firstRevealProgress = skillProgressFromAttempts(firstReveal);
check("unsuccessful completed Sidequest still counts once", firstRevealProgress.totalAttempts === 1);
check("unsuccessful completed Sidequest is not correct", firstRevealProgress.correctAttempts === 0);
check("first unsuccessful mastery is 0", firstRevealProgress.masteryScore === 0);

const threeTriesOneQuest: SkillAttemptRow[] = [
  ...firstReveal,
  {
    challengeId: "c1",
    isCorrect: false,
    attemptNumber: 3,
    createdAt: "2026-09-12T00:00:02.000Z",
  },
];

check(
  "three submissions on one challenge still count as one Sidequest",
  skillProgressFromAttempts(threeTriesOneQuest).totalAttempts === 1,
);

check(
  "a completing insert is counted when the challenge was open",
  shouldCountTowardProgress(
    [
      { attemptNumber: 1, isCorrect: false },
      { attemptNumber: 2, isCorrect: false },
    ],
    { attemptNumber: 3, isCorrect: false },
  ),
);
check(
  "a repeated completing insert is not counted again",
  shouldCountTowardProgress(threeMisses, { attemptNumber: 3, isCorrect: false }) ===
    false,
);

check("mastery of 2/4 is 0.5", masteryScore(2, 4) === 0.5);
check("mastery of none is 0", masteryScore(0, 0) === 0);
check("mastery is clamped to 1", masteryScore(4, 3) === 1);

check("level stays inside 1–5", clampLevel(0) === 1 && clampLevel(9) === 5);

check(
  "level does not change after two lucky solves",
  levelFromHistory([true, true]) === 1,
);

const threeWins = levelFromHistory([true, true, true]);
check("three solves at mastery 1.0 raise the level once", threeWins === 2);

const threeLosses = levelFromHistory([false, false, false]);
check("three reveals at mastery 0 stay at level 1", threeLosses === 1);

const climb = levelFromHistory([true, true, true, true, true, true]);
check(
  "sustained high mastery climbs then stops at 5",
  climb === 5,
);

const dropAfterRise = levelFromHistory([
  true,
  true,
  true,
  false,
  false,
  false,
  false,
]);
check("level can fall after enough low-mastery completions", dropAfterRise < 3);

check(
  "another profile cannot grade an unowned quest",
  questIsGradeable({
    exists: true,
    owned: false,
    status: "ready",
    challengeCount: 1,
  }).ok === false,
);
check(
  "a pending quest cannot be graded",
  eligibilityReason({
    exists: true,
    owned: true,
    status: "pending",
    challengeCount: 1,
  }) === "not_ready",
);
check(
  "a rejected quest cannot be graded",
  eligibilityReason({
    exists: true,
    owned: true,
    status: "rejected",
    challengeCount: 1,
  }) === "not_ready",
);
check(
  "a failed quest cannot be graded",
  eligibilityReason({
    exists: true,
    owned: true,
    status: "failed",
    challengeCount: 1,
  }) === "not_ready",
);
check(
  "zero or many challenges cannot be graded",
  eligibilityReason({
    exists: true,
    owned: true,
    status: "ready",
    challengeCount: 0,
  }) === "no_challenge",
);
check(
  "an owned ready quest with one challenge can be graded",
  questIsGradeable({
    exists: true,
    owned: true,
    status: "ready",
    challengeCount: 1,
  }).ok === true,
);

check(
  "completed Sidequests ignore in-progress challenges",
  completedSidequests([
    {
      challengeId: "open",
      isCorrect: false,
      attemptNumber: 1,
      createdAt: "2026-09-12T00:00:00.000Z",
    },
    {
      challengeId: "done",
      isCorrect: true,
      attemptNumber: 1,
      createdAt: "2026-09-12T00:00:01.000Z",
    },
  ]).map((quest) => quest.challengeId).join(",") === "done",
);

check("max attempts is the centralized three", MAX_ANSWER_ATTEMPTS === 3);

check(
  "student grade view hides invalid reason codes",
  !("reason" in toStudentGradeView({ status: "invalid", reason: "malformed" })),
);

const replayA = skillProgressFromAttempts(firstSuccess);
const replayB = skillProgressFromAttempts(firstSuccess);
check(
  "replaying the same history does not change totals or level",
  replayA.totalAttempts === replayB.totalAttempts &&
    replayA.currentLevel === replayB.currentLevel &&
    replayA.masteryScore === replayB.masteryScore,
);

if (failed > 0) {
  console.error(`\n${failed} progress checks failed`);
  process.exit(1);
}

console.log("\nall progress checks passed");
