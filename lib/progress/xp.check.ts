/**
 * Persistent XP policy, totals, and exactly-once award checks.
 *
 * Run with: npx tsx lib/progress/xp.check.ts
 */

import { getAdaptiveProfile } from "@/lib/progress/adaptation";
import {
  skillProgressFromAttempts,
  type SkillAttemptRow,
} from "@/lib/progress/mastery";
import {
  applyAwardedXp,
  canAcceptAttempt,
  progressAfterAttempt,
  progressFromAttempts,
  type StoredAttempt,
} from "@/lib/progress/outcome";
import {
  XP_CORRECT_ATTEMPT_1,
  XP_CORRECT_ATTEMPT_2,
  XP_CORRECT_ATTEMPT_3,
  XP_SOLUTION_REVEALED,
  totalXp,
  xpAwardForCorrectAttempt,
  xpDecisionForGrade,
  xpForCompletedSidequest,
  type QuestReward,
} from "@/lib/progress/xp";
import type { CorrectAnswer } from "@/lib/ai/schemas";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

const expected: CorrectAnswer = { type: "number", value: 7, unit: "fl oz" };

function attempt(
  attemptNumber: number,
  isCorrect: boolean,
): StoredAttempt {
  return { attemptNumber, isCorrect };
}

function history(
  challengeId: string,
  rows: StoredAttempt[],
  createdAt = "2026-09-14T00:00:00.000Z",
): SkillAttemptRow[] {
  return rows.map((row, index) => ({
    challengeId,
    isCorrect: row.isCorrect,
    attemptNumber: row.attemptNumber,
    createdAt: new Date(Date.parse(createdAt) + index * 1000).toISOString(),
  }));
}

type MemoryStore = {
  attempts: StoredAttempt[];
  rewards: QuestReward[];
};

function gradeInMemory(
  store: MemoryStore,
  submitted: StoredAttempt,
  loadedPrevious?: StoredAttempt[],
): { xp: number | null; persist: boolean } {
  const previous = loadedPrevious ?? [...store.attempts];
  const existingReward = store.rewards[0] ?? null;

  if (!canAcceptAttempt(previous)) {
    const decision = xpDecisionForGrade({
      previousAttempts: previous,
      nextAttempts: previous,
      existingReward,
    });
    return {
      xp: decision.reward?.xp ?? null,
      persist: decision.persist,
    };
  }

  const conflict = store.attempts.some(
    (row) => row.attemptNumber === submitted.attemptNumber,
  );
  if (!conflict) store.attempts.push(submitted);

  const decision = xpDecisionForGrade({
    previousAttempts: previous,
    nextAttempts: store.attempts,
    existingReward,
  });

  if (decision.persist && store.rewards.length === 0) {
    store.rewards.push(decision.reward);
  }

  return {
    xp: (store.rewards[0] ?? decision.reward)?.xp ?? null,
    persist: decision.persist,
  };
}

// --- policy amounts --------------------------------------------------------

check(
  "attempt 1 correct → 10",
  xpAwardForCorrectAttempt(1).xp === XP_CORRECT_ATTEMPT_1 &&
    xpAwardForCorrectAttempt(1).reason === "correct_attempt_1",
);
check(
  "attempt 2 correct → 7",
  xpAwardForCorrectAttempt(2).xp === XP_CORRECT_ATTEMPT_2 &&
    xpAwardForCorrectAttempt(2).reason === "correct_attempt_2",
);
check(
  "attempt 3 correct → 5",
  xpAwardForCorrectAttempt(3).xp === XP_CORRECT_ATTEMPT_3 &&
    xpAwardForCorrectAttempt(3).reason === "correct_attempt_3",
);
check(
  "third miss / solution → 2",
  xpForCompletedSidequest([
    attempt(1, false),
    attempt(2, false),
    attempt(3, false),
  ])?.xp === XP_SOLUTION_REVEALED &&
    xpForCompletedSidequest([
      attempt(1, false),
      attempt(2, false),
      attempt(3, false),
    ])?.reason === "solution_revealed",
);

check(
  "open first miss awards nothing yet",
  xpForCompletedSidequest([attempt(1, false)]) === null,
);
check(
  "two misses still award nothing",
  xpForCompletedSidequest([attempt(1, false), attempt(2, false)]) === null,
);

check(
  "completed Sidequest XP uses the first correct try, not a later client number",
  xpForCompletedSidequest([attempt(1, true), attempt(2, true)])?.xp === 10,
);

const firstTryView = progressAfterAttempt({
  isCorrect: true,
  attemptNumber: 1,
  hint1: null,
  hint2: null,
  solution: "Worked out.",
  expected,
});
check(
  "grade view for attempt 1 correct is 10",
  firstTryView.status === "correct" && firstTryView.xp === 10,
);

const revealedView = progressAfterAttempt({
  isCorrect: false,
  attemptNumber: 3,
  hint1: null,
  hint2: null,
  solution: "Worked out.",
  expected,
});
check(
  "grade view for a revealed solution includes +2 XP",
  revealedView.status === "complete" && revealedView.xp === 2,
);

// --- totals ----------------------------------------------------------------

check("no rewards is 0 XP", totalXp([]) === 0);
check(
  "XP totals sum completed Sidequests",
  totalXp([{ xp: 10 }, { xp: 7 }, { xp: 2 }]) === 19,
);
check("negative stored XP is ignored", totalXp([{ xp: 10 }, { xp: -4 }]) === 10);
check(
  "fractional XP is floored per row",
  totalXp([{ xp: 10.9 }, { xp: 7 }]) === 17,
);

// --- award once / duplicates ----------------------------------------------

const firstTry = gradeInMemory({ attempts: [], rewards: [] }, attempt(1, true));
check("first completing submit persists 10 XP", firstTry.persist && firstTry.xp === 10);

const doubleSubmit = { attempts: [] as StoredAttempt[], rewards: [] as QuestReward[] };
const first = gradeInMemory(doubleSubmit, attempt(1, true));
const second = gradeInMemory(doubleSubmit, attempt(1, true));
check("double Submit awards XP on the first write", first.persist && first.xp === 10);
check(
  "double Submit does not persist a second reward",
  second.persist === false &&
    second.xp === 10 &&
    doubleSubmit.rewards.length === 1,
);

const uniqueConflict = { attempts: [attempt(1, true)], rewards: [] as QuestReward[] };
const raced = gradeInMemory(uniqueConflict, attempt(1, true), []);
check(
  "unique constraint conflict still awards once from the open previous state",
  uniqueConflict.rewards.length === 1 && raced.persist && raced.xp === 10,
);

const alreadyAwarded = {
  attempts: [attempt(1, true)],
  rewards: [{ xp: 10, reason: "correct_attempt_1" as const }],
};
const conflictAfterAward = gradeInMemory(alreadyAwarded, attempt(1, true), []);
check(
  "unique constraint conflict after a stored reward does not write again",
  conflictAfterAward.persist === false &&
    alreadyAwarded.rewards.length === 1 &&
    conflictAfterAward.xp === 10,
);

const replayFinished = {
  attempts: [attempt(1, true)],
  rewards: [{ xp: 10, reason: "correct_attempt_1" as const }],
};
const replay = gradeInMemory(replayFinished, attempt(1, true));
check(
  "server action replay of a finished Sidequest does not persist XP",
  replay.persist === false && replay.xp === 10 && replayFinished.rewards.length === 1,
);

const revisit = {
  attempts: [attempt(1, false), attempt(2, false), attempt(3, false)],
  rewards: [{ xp: 2, reason: "solution_revealed" as const }],
};
const revisited = gradeInMemory(revisit, attempt(3, false));
check(
  "revisiting a completed challenge does not award XP twice",
  revisited.persist === false && revisited.xp === 2 && revisit.rewards.length === 1,
);

const historical = {
  attempts: [attempt(1, true)],
  rewards: [] as QuestReward[],
};
const historicalReplay = gradeInMemory(historical, attempt(1, true));
check(
  "historical Sidequests without XP remain valid and are not backfilled",
  historicalReplay.persist === false &&
    historicalReplay.xp === null &&
    historical.rewards.length === 0,
);

const refreshView = applyAwardedXp(
  progressFromAttempts({
    attempts: [attempt(1, true)],
    hint1: null,
    hint2: null,
    solution: "Worked out.",
    expected,
  }),
  10,
);
check(
  "refresh after success shows the stored 10 XP",
  refreshView.status === "correct" && refreshView.xp === 10,
);

const historicalView = progressFromAttempts({
  attempts: [attempt(1, true)],
  hint1: null,
  hint2: null,
  solution: "Worked out.",
  expected,
  awardedXp: 0,
});
check(
  "existing historical Sidequests without XP still load as correct",
  historicalView.status === "correct" && historicalView.xp === 0,
);

const secondTryStore = {
  attempts: [attempt(1, false)],
  rewards: [] as QuestReward[],
};
check(
  "attempt 2 correct persists 7 XP",
  gradeInMemory(secondTryStore, attempt(2, true)).xp === 7 &&
    secondTryStore.rewards[0]?.reason === "correct_attempt_2",
);

const thirdTryStore = {
  attempts: [attempt(1, false), attempt(2, false)],
  rewards: [] as QuestReward[],
};
check(
  "attempt 3 correct persists 5 XP",
  gradeInMemory(thirdTryStore, attempt(3, true)).xp === 5,
);

const revealStore = {
  attempts: [attempt(1, false), attempt(2, false)],
  rewards: [] as QuestReward[],
};
check(
  "third miss persists 2 XP",
  gradeInMemory(revealStore, attempt(3, false)).xp === 2 &&
    revealStore.rewards[0]?.reason === "solution_revealed",
);

const inProgress = { attempts: [] as StoredAttempt[], rewards: [] as QuestReward[] };
const miss = gradeInMemory(inProgress, attempt(1, false));
check(
  "an incomplete miss does not persist XP",
  miss.persist === false && miss.xp === null && inProgress.rewards.length === 0,
);

check(
  "decision refuses persist when a reward already exists",
  xpDecisionForGrade({
    previousAttempts: [],
    nextAttempts: [attempt(1, true)],
    existingReward: { xp: 10, reason: "correct_attempt_1" },
  }).persist === false,
);

check(
  "decision persists when the Sidequest just completed",
  xpDecisionForGrade({
    previousAttempts: [],
    nextAttempts: [attempt(1, true)],
    existingReward: null,
  }).persist === true,
);

check(
  "decision does not persist a revisit of a completed Sidequest",
  xpDecisionForGrade({
    previousAttempts: [attempt(1, true)],
    nextAttempts: [attempt(1, true)],
    existingReward: null,
  }).persist === false,
);

// --- mastery / adaptation stay independent --------------------------------

const solvedHistory = history("c1", [attempt(1, true)]);
const mastery = skillProgressFromAttempts(solvedHistory);
check("XP does not change mastery_score", mastery.masteryScore === 1);
check("XP does not change current_level", mastery.currentLevel === 1);
check("XP does not change completed Sidequest counts", mastery.totalAttempts === 1);

const adaptiveWithoutXp = getAdaptiveProfile({
  grade: 4,
  progress: mastery,
  recentOutcomes: [true],
});
check(
  "adaptation has no XP field",
  !("xp" in adaptiveWithoutXp) &&
    !("totalXp" in adaptiveWithoutXp) &&
    adaptiveWithoutXp.masteryBand === "developing",
);

const revealHistory = history("c2", [
  attempt(1, false),
  attempt(2, false),
  attempt(3, false),
]);
const revealMastery = skillProgressFromAttempts(revealHistory);
check(
  "a +2 XP reveal still counts as an unsolved Sidequest for mastery",
  revealMastery.correctAttempts === 0 &&
    revealMastery.totalAttempts === 1 &&
    xpForCompletedSidequest([
      attempt(1, false),
      attempt(2, false),
      attempt(3, false),
    ])?.xp === 2,
);

const mixedHistory = [
  ...history("a", [attempt(1, true)]),
  ...history("b", [attempt(1, false), attempt(2, true)], "2026-09-14T00:01:00.000Z"),
  ...history(
    "c",
    [attempt(1, false), attempt(2, false), attempt(3, false)],
    "2026-09-14T00:02:00.000Z",
  ),
];
const mixedMastery = skillProgressFromAttempts(mixedHistory);
const mixedXp = totalXp([
  xpForCompletedSidequest([attempt(1, true)])!,
  xpForCompletedSidequest([attempt(1, false), attempt(2, true)])!,
  xpForCompletedSidequest([
    attempt(1, false),
    attempt(2, false),
    attempt(3, false),
  ])!,
]);
check("mixed XP total is 10 + 7 + 2", mixedXp === 19);
check(
  "mixed XP total does not change mastery 2/3",
  mixedMastery.correctAttempts === 2 &&
    mixedMastery.totalAttempts === 3 &&
    mixedMastery.masteryScore === 2 / 3,
);

const sameAdaptive = getAdaptiveProfile({
  grade: 4,
  progress: mixedMastery,
  recentOutcomes: [true, true, false],
});
const sameAdaptiveAgain = getAdaptiveProfile({
  grade: 4,
  progress: mixedMastery,
  recentOutcomes: [true, true, false],
});
check(
  "the same mastery history still produces the same adaptive profile after XP",
  sameAdaptive.targetDifficulty === sameAdaptiveAgain.targetDifficulty &&
    sameAdaptive.hintSupport === sameAdaptiveAgain.hintSupport &&
    sameAdaptive.complexity === sameAdaptiveAgain.complexity,
);

check(
  "xpDecisionForGrade does not take a client XP amount",
  !("xp" in { previousAttempts: [], nextAttempts: [], existingReward: null }),
);

if (failed > 0) {
  console.error(`\n${failed} XP checks failed`);
  process.exit(1);
}

console.log("\nall XP checks passed");
