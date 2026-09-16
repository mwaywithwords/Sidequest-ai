/**
 * Quest reward persistence reads: missing rows vs schema/database failures.
 *
 * Run with: npx tsx lib/progress/rewards.check.ts
 *
 * These do not talk to Supabase. They confirm a missing table is never
 * treated as "this student has no reward," and Progress can still present
 * when the store is down.
 */

import { presentProgress } from "@/lib/progress/presentation";
import {
  existingRewardForGrade,
  interpretRewardRead,
  interpretXpTotal,
  presentationAwardedXp,
  progressXpTotal,
} from "@/lib/progress/reward-read";
import {
  progressFromAttempts,
  type StoredAttempt,
} from "@/lib/progress/outcome";
import { xpDecisionForGrade, type QuestReward } from "@/lib/progress/xp";
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

const schemaError = {
  code: "PGRST205",
  message: "Could not find the table 'public.quest_rewards' in the schema cache",
};

const databaseError = {
  code: "57P01",
  message: "the database system is shutting down",
};

const storedReward = { xp: 10, reason: "correct_attempt_1" as const };

const found = interpretRewardRead({
  data: storedReward,
  error: null,
});
const absent = interpretRewardRead({
  data: null,
  error: null,
});
const schemaFailure = interpretRewardRead({
  data: null,
  error: schemaError,
});
const databaseFailure = interpretRewardRead({
  data: null,
  error: databaseError,
});

check(
  "an existing quest reward is found",
  found.status === "found" &&
    found.reward.xp === 10 &&
    found.reward.reason === "correct_attempt_1",
);

check(
  "a missing reward row is absent, not a failure",
  absent.status === "absent",
);

check(
  "PGRST205 is a schema failure, not a missing reward row",
  schemaFailure.status === "unavailable" &&
    schemaFailure.failure === "schema" &&
    schemaFailure.code === "PGRST205" &&
    schemaFailure.status !== absent.status,
);

const missingRelation = interpretRewardRead({
  data: null,
  error: { code: "42P01", message: 'relation "quest_rewards" does not exist' },
});
check(
  "Postgres undefined_table is a schema failure",
  missingRelation.status === "unavailable" &&
    missingRelation.failure === "schema",
);

const missingCacheMessage = interpretRewardRead({
  data: null,
  error: {
    message: "Could not find the table 'public.quest_rewards' in the schema cache",
  },
});
check(
  "a missing table message is a schema failure even without the PostgREST code",
  missingCacheMessage.status === "unavailable" &&
    missingCacheMessage.failure === "schema",
);

check(
  "a generic database error is distinguishable from no row and from schema failure",
  databaseFailure.status === "unavailable" &&
    databaseFailure.failure === "database" &&
    databaseFailure.status !== absent.status &&
    (schemaFailure.status !== "unavailable" ||
      schemaFailure.failure !== databaseFailure.failure),
);

check(
  "schema failure is not treated as an ordinary no-reward result",
  presentationAwardedXp(schemaFailure) === 0 &&
    existingRewardForGrade(schemaFailure) === null &&
    schemaFailure.status !== "absent" &&
    schemaFailure.status !== "found",
);

check(
  "presentation XP uses the stored award when a row exists",
  presentationAwardedXp(found) === 10,
);

check(
  "presentation XP is 0 when there is no reward row",
  presentationAwardedXp(absent) === 0,
);

check(
  "presentation XP is 0 on a database failure and does not invent an amount",
  presentationAwardedXp(databaseFailure) === 0,
);

const schemaTotal = interpretXpTotal({ data: null, error: schemaError });
const emptyTotal = interpretXpTotal({ data: [], error: null });
const awardedTotal = interpretXpTotal({
  data: [{ xp: 10 }, { xp: 7 }],
  error: null,
});
const failedTotal = interpretXpTotal({ data: null, error: databaseError });

check(
  "XP totals sum stored rewards",
  awardedTotal.status === "ok" && awardedTotal.total === 17,
);

check(
  "no reward rows total 0 XP",
  emptyTotal.status === "ok" && emptyTotal.total === 0,
);

check(
  "schema failure of the XP total is distinguishable from an empty total",
  schemaTotal.status === "unavailable" &&
    schemaTotal.failure === "schema" &&
    emptyTotal.status === "ok" &&
    progressXpTotal(schemaTotal) === 0 &&
    progressXpTotal(emptyTotal) === 0,
);

check(
  "a database failure of the XP total is not an empty reward list",
  failedTotal.status === "unavailable" &&
    failedTotal.failure === "database" &&
    failedTotal.status !== emptyTotal.status,
);

const withReward = presentProgress({
  grade: 4,
  skillProgress: [
    {
      skillCode: "division",
      gradeLevel: 4,
      totalAttempts: 1,
      correctAttempts: 1,
      masteryScore: 1,
      currentLevel: 1,
      lastPracticedAt: "2026-09-14T00:00:00.000Z",
    },
  ],
  completedSidequestCount: 1,
  totalXp: progressXpTotal(awardedTotal),
  quests: [{ status: "ready", identifiedObject: "Soda can", completed: true }],
});

check(
  "Progress with an existing quest reward shows the stored XP",
  withReward.totalXp === 17 &&
    withReward.hasProgress === true &&
    withReward.sidequestsCompleted === 1,
);

const noReward = presentProgress({
  grade: 4,
  skillProgress: [
    {
      skillCode: "division",
      gradeLevel: 4,
      totalAttempts: 1,
      correctAttempts: 1,
      masteryScore: 1,
      currentLevel: 1,
      lastPracticedAt: "2026-09-14T00:00:00.000Z",
    },
  ],
  completedSidequestCount: 1,
  totalXp: progressXpTotal(emptyTotal),
  quests: [{ status: "ready", identifiedObject: "Soda can", completed: true }],
});

check(
  "Progress with no reward row still renders mastery and completed Sidequests",
  noReward.totalXp === 0 &&
    noReward.hasProgress === true &&
    noReward.sidequestsCompleted === 1 &&
    noReward.skills.some((skill) => skill.skillId === "division" && skill.practiced),
);

const historical = presentProgress({
  grade: 4,
  skillProgress: [
    {
      skillCode: "addition",
      gradeLevel: 4,
      totalAttempts: 2,
      correctAttempts: 2,
      masteryScore: 1,
      currentLevel: 2,
      lastPracticedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  completedSidequestCount: 2,
  totalXp: 0,
  quests: [
    { status: "ready", identifiedObject: "Egg carton", completed: true },
    { status: "ready", identifiedObject: "Window", completed: true },
  ],
});

check(
  "historical Sidequests that predate rewards remain valid at 0 XP",
  historical.hasProgress === true &&
    historical.totalXp === 0 &&
    historical.sidequestsCompleted === 2 &&
    historical.objectsDiscovered === 2,
);

const storeDown = presentProgress({
  grade: 4,
  skillProgress: [
    {
      skillCode: "measurement",
      gradeLevel: 4,
      totalAttempts: 3,
      correctAttempts: 2,
      masteryScore: 2 / 3,
      currentLevel: 1,
      lastPracticedAt: "2026-09-14T00:00:00.000Z",
    },
  ],
  completedSidequestCount: 3,
  totalXp: progressXpTotal(schemaTotal),
  quests: [{ status: "ready", identifiedObject: "Ruler", completed: true }],
});

check(
  "My Progress renders when the reward store is down and does not invent XP",
  storeDown.hasProgress === true &&
    storeDown.totalXp === 0 &&
    storeDown.sidequestsCompleted === 3 &&
    storeDown.skills.find((skill) => skill.skillId === "measurement")
      ?.practiced === true,
);

const loadedWithReward = progressFromAttempts({
  attempts: [attempt(1, true)],
  hint1: "Hint one",
  hint2: "Hint two",
  solution: "Worked out.",
  expected,
  awardedXp: presentationAwardedXp(found),
});
check(
  "a loaded Sidequest with a stored reward shows that XP",
  loadedWithReward.status === "correct" && loadedWithReward.xp === 10,
);

const loadedWithoutReward = progressFromAttempts({
  attempts: [attempt(1, true)],
  hint1: "Hint one",
  hint2: "Hint two",
  solution: "Worked out.",
  expected,
  awardedXp: presentationAwardedXp(absent),
});
check(
  "a loaded Sidequest with no reward row stays correct at 0 XP",
  loadedWithoutReward.status === "correct" && loadedWithoutReward.xp === 0,
);

const loadedWhenStoreDown = progressFromAttempts({
  attempts: [attempt(1, true)],
  hint1: "Hint one",
  hint2: "Hint two",
  solution: "Worked out.",
  expected,
  awardedXp: presentationAwardedXp(schemaFailure),
});
check(
  "a loaded Sidequest still renders when reward read fails and does not invent XP",
  loadedWhenStoreDown.status === "correct" && loadedWhenStoreDown.xp === 0,
);

const alreadyAwarded: QuestReward = {
  xp: 10,
  reason: "correct_attempt_1",
};
check(
  "a stored reward blocks a second persist",
  xpDecisionForGrade({
    previousAttempts: [attempt(1, true)],
    nextAttempts: [attempt(1, true)],
    existingReward: existingRewardForGrade(found),
  }).persist === false &&
    existingRewardForGrade(found)?.xp === alreadyAwarded.xp,
);

check(
  "refresh of a completed Sidequest with a stored reward does not persist again",
  xpDecisionForGrade({
    previousAttempts: [attempt(1, true)],
    nextAttempts: [attempt(1, true)],
    existingReward: existingRewardForGrade(
      interpretRewardRead({ data: storedReward, error: null }),
    ),
  }).persist === false,
);

check(
  "historical completed Sidequests without a reward row are not backfilled",
  xpDecisionForGrade({
    previousAttempts: [attempt(1, true)],
    nextAttempts: [attempt(1, true)],
    existingReward: existingRewardForGrade(absent),
  }).persist === false,
);

check(
  "an unreadable stored row is not treated as absent",
  interpretRewardRead({
    data: { xp: 10, reason: "client_granted" },
    error: null,
  }).status === "unavailable",
);

if (failed > 0) {
  console.error(`\n${failed} reward-read checks failed`);
  process.exit(1);
}

console.log("\nall reward-read checks passed");
