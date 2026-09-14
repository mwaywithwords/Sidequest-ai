/**
 * Progress presentation checks.
 *
 * Run with: npx tsx lib/progress/presentation.check.ts
 */

import { copy } from "@/lib/copy";
import {
  countCompletedSidequests,
  countDiscoveredObjects,
  masteryPercent,
  mathExplorerLevel,
  presentProgress,
  type DiscoveryQuest,
  type PresentedProgress,
  type SkillProgressRecord,
} from "@/lib/progress/presentation";
import type { SkillAttemptRow } from "@/lib/progress/mastery";
import { SKILL_IDS } from "@/lib/types";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

function record(
  overrides: Partial<SkillProgressRecord> & Pick<SkillProgressRecord, "skillCode">,
): SkillProgressRecord {
  return {
    gradeLevel: 4,
    totalAttempts: 0,
    correctAttempts: 0,
    masteryScore: 0,
    currentLevel: 1,
    lastPracticedAt: null,
    ...overrides,
  };
}

function attempt(
  overrides: SkillAttemptRow,
): SkillAttemptRow {
  return overrides;
}

function payloadHas(progress: PresentedProgress, needle: string): boolean {
  return JSON.stringify(progress).toLowerCase().includes(needle.toLowerCase());
}

const empty = presentProgress({
  grade: 5,
  skillProgress: [],
  completedSidequestCount: 0,
  totalXp: 0,
  quests: [],
});

check("no progress still shows all seven skills", empty.skills.length === 7);
check(
  "no progress lists every catalogue skill",
  empty.skills.map((skill) => skill.skillId).join(",") === SKILL_IDS.join(","),
);
check("no progress starts at explorer level 1", empty.explorerLevel === 1);
check("no progress has zero completed Sidequests", empty.sidequestsCompleted === 0);
check("no progress has zero XP", empty.totalXp === 0);
check("no progress has zero discoveries", empty.objectsDiscovered === 0);
check("no progress is the empty map", empty.hasProgress === false);
check(
  "unpracticed skills are not shown as 0% failure",
  empty.skills.every(
    (skill) =>
      skill.practiced === false &&
      skill.masteryPercent === null &&
      !skill.status.includes("0%"),
  ),
);
check(
  "unpracticed copy stays inviting",
  empty.skills[0]?.status ===
    copy.progress.skillStatus.unpracticed("Addition"),
);

const zeroAttemptRow = presentProgress({
  grade: 4,
  skillProgress: [
    record({
      skillCode: "division",
      totalAttempts: 0,
      correctAttempts: 0,
      masteryScore: 0,
      currentLevel: 1,
    }),
  ],
  completedSidequestCount: 0,
  totalXp: 0,
  quests: [],
});
check(
  "a stored row with no completed Sidequests stays unexplored",
  zeroAttemptRow.skills.find((skill) => skill.skillId === "division")
    ?.masteryPercent === null &&
    zeroAttemptRow.skills.find((skill) => skill.skillId === "division")
      ?.practiced === false,
);

const oneSkill = presentProgress({
  grade: 4,
  skillProgress: [
    record({
      skillCode: "division",
      totalAttempts: 4,
      correctAttempts: 3,
      masteryScore: 0.75,
      currentLevel: 2,
      lastPracticedAt: "2026-09-12T12:00:00.000Z",
    }),
  ],
  completedSidequestCount: 4,
  totalXp: 34,
  quests: [
    {
      status: "ready",
      identifiedObject: "Soda can",
      completed: true,
    },
  ],
});

const division = oneSkill.skills.find((skill) => skill.skillId === "division");
const addition = oneSkill.skills.find((skill) => skill.skillId === "addition");

check("one practiced skill is marked practiced", division?.practiced === true);
check("one practiced skill shows a percentage", division?.masteryPercent === 75);
check(
  "high mastery uses the strong sentence",
  division?.status === copy.progress.skillStatus.strong("Division"),
);
check("unpracticed neighbours stay unpracticed", addition?.practiced === false);
check(
  "unpracticed neighbours still have no percentage",
  addition?.masteryPercent === null,
);
check("one practiced skill keeps the completed count", oneSkill.sidequestsCompleted === 4);
check("one practiced skill shows persisted XP", oneSkill.totalXp === 34);
check("one practiced skill can discover one object", oneSkill.objectsDiscovered === 1);
check("one practiced skill uses that skill's current_level", oneSkill.explorerLevel === 2);

const many = presentProgress({
  grade: 4,
  skillProgress: [
    record({
      skillCode: "addition",
      totalAttempts: 3,
      correctAttempts: 3,
      masteryScore: 1,
      currentLevel: 3,
      lastPracticedAt: "2026-09-12T10:00:00.000Z",
    }),
    record({
      skillCode: "fractions",
      totalAttempts: 5,
      correctAttempts: 2,
      masteryScore: 0.4,
      currentLevel: 1,
      lastPracticedAt: "2026-09-12T11:00:00.000Z",
    }),
    record({
      skillCode: "measurement",
      totalAttempts: 2,
      correctAttempts: 0,
      masteryScore: 0,
      currentLevel: 1,
      lastPracticedAt: "2026-09-12T09:00:00.000Z",
    }),
  ],
  completedSidequestCount: 10,
  totalXp: 79,
  quests: [
    { status: "ready", identifiedObject: "Pizza", completed: true },
    { status: "ready", identifiedObject: "Bottle", completed: true },
  ],
});

check("multiple practiced skills stay practiced", many.skills.filter((skill) => skill.practiced).length === 3);
check(
  "growing mastery uses the getting-stronger sentence",
  many.skills.find((skill) => skill.skillId === "fractions")?.status ===
    copy.progress.skillStatus.growing("Fractions"),
);
check(
  "low practiced mastery is not unexplored",
  many.skills.find((skill) => skill.skillId === "measurement")?.practiced ===
    true &&
    many.skills.find((skill) => skill.skillId === "measurement")?.masteryPercent ===
      0,
);
check(
  "low practiced mastery asks for another Sidequest",
  many.skills.find((skill) => skill.skillId === "measurement")?.status ===
    copy.progress.skillStatus.needsPractice("Measurement"),
);
check(
  "explorer level averages practiced current_levels",
  many.explorerLevel === 2,
);

check("0.62 becomes 62%", masteryPercent(0.62) === 62);
check("0.624 becomes 62%", masteryPercent(0.624) === 62);
check("0.625 becomes 63%", masteryPercent(0.625) === 63);
check("1 becomes 100%", masteryPercent(1) === 100);
check("0 becomes 0%", masteryPercent(0) === 0);

const threeTries: SkillAttemptRow[] = [
  attempt({
    challengeId: "c1",
    isCorrect: false,
    attemptNumber: 1,
    createdAt: "2026-09-12T00:00:00.000Z",
  }),
  attempt({
    challengeId: "c1",
    isCorrect: false,
    attemptNumber: 2,
    createdAt: "2026-09-12T00:00:01.000Z",
  }),
  attempt({
    challengeId: "c1",
    isCorrect: false,
    attemptNumber: 3,
    createdAt: "2026-09-12T00:00:02.000Z",
  }),
  attempt({
    challengeId: "c2",
    isCorrect: true,
    attemptNumber: 1,
    createdAt: "2026-09-12T00:00:03.000Z",
  }),
];

check(
  "completed Sidequests count finished challenges, not raw submissions",
  countCompletedSidequests(threeTries) === 2,
);
check(
  "an open first miss does not count as completed",
  countCompletedSidequests([
    attempt({
      challengeId: "open",
      isCorrect: false,
      attemptNumber: 1,
      createdAt: "2026-09-12T00:00:00.000Z",
    }),
  ]) === 0,
);

const discoveryQuests: DiscoveryQuest[] = [
  { status: "ready", identifiedObject: "Soda can", completed: true },
  { status: "ready", identifiedObject: "SODA CAN", completed: true },
  { status: "ready", identifiedObject: " soda can ", completed: true },
  { status: "rejected", identifiedObject: "Mystery blob", completed: false },
  { status: "failed", identifiedObject: "Blurry shoe", completed: false },
  { status: "ready", identifiedObject: "Window", completed: false },
  { status: "pending", identifiedObject: "Egg carton", completed: false },
];

check(
  "the same object counted once, case-insensitively",
  countDiscoveredObjects(discoveryQuests) === 1,
);
check(
  "rejected and failed quests are not discoveries",
  countDiscoveredObjects([
    { status: "rejected", identifiedObject: "Can", completed: true },
    { status: "failed", identifiedObject: "Book", completed: true },
  ]) === 0,
);
check(
  "a ready object still in progress is not a discovery",
  countDiscoveredObjects([
    { status: "ready", identifiedObject: "Window", completed: false },
  ]) === 0,
);
check(
  "two different completed objects count as two",
  countDiscoveredObjects([
    { status: "ready", identifiedObject: "Pizza", completed: true },
    { status: "ready", identifiedObject: "Bottle", completed: true },
  ]) === 2,
);

check("explorer level never falls below 1", mathExplorerLevel([]) === 1);
check("explorer level never rises above 5", mathExplorerLevel([5, 5, 5]) === 5);
check("a single practiced level 4 stays 4", mathExplorerLevel([4]) === 4);
check("levels 1 and 5 present as 3", mathExplorerLevel([1, 5]) === 3);
check("invalid stored levels are ignored", mathExplorerLevel([0, 9]) === 1);

const grade3AdditionNowGrade5 = presentProgress({
  grade: 5,
  skillProgress: [
    record({
      skillCode: "addition",
      gradeLevel: 3,
      totalAttempts: 6,
      correctAttempts: 5,
      masteryScore: 0.833,
      currentLevel: 3,
      lastPracticedAt: "2026-09-01T00:00:00.000Z",
    }),
  ],
  completedSidequestCount: 6,
  totalXp: 0,
  quests: [
    { status: "ready", identifiedObject: "Egg carton", completed: true },
  ],
});
const grade5Addition = grade3AdditionNowGrade5.skills.find(
  (skill) => skill.skillId === "addition",
);
check(
  "Grade 5 Addition stays unpracticed when only Grade 3 Addition has progress",
  grade5Addition?.practiced === false &&
    grade5Addition.masteryPercent === null &&
    grade5Addition.status ===
      copy.progress.skillStatus.unpracticed("Addition"),
);
check(
  "lifetime completed Sidequests still include other-grade history",
  grade3AdditionNowGrade5.sidequestsCompleted === 6,
);
check(
  "historical Sidequests without XP stay valid at 0 XP",
  grade3AdditionNowGrade5.totalXp === 0 &&
    grade3AdditionNowGrade5.hasProgress === true,
);

const leaked = presentProgress({
  grade: 4,
  skillProgress: [
    record({
      skillCode: "geometry",
      totalAttempts: 1,
      correctAttempts: 1,
      masteryScore: 1,
      currentLevel: 1,
      lastPracticedAt: "2026-09-12T00:00:00.000Z",
    }),
  ],
  completedSidequestCount: 1,
  totalXp: 10,
  quests: [
    {
      status: "ready",
      identifiedObject: "Window pane",
      completed: true,
    },
  ],
});

const serialized = JSON.stringify(leaked);
check(
  "presentation has no profile or row UUIDs",
  !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
    serialized,
  ),
);
check("presentation does not name mastery bands", !payloadHas(leaked, "support"));
check("presentation does not say developing", !payloadHas(leaked, "developing"));
check("presentation does not say advancing", !payloadHas(leaked, "advancing"));
check("presentation does not say mastery band", !payloadHas(leaked, "masteryBand"));
check("presentation does not say current_level", !payloadHas(leaked, "current_level"));
check("presentation does not say mastery_score", !payloadHas(leaked, "mastery_score"));
check("presentation does not include submitted answers", !payloadHas(leaked, "submitted"));
check("presentation does not include correct answers", !payloadHas(leaked, "correct_answer"));
check(
  "presentation does not include generation metadata",
  !payloadHas(leaked, "generation_metadata"),
);
check(
  "presentation does not include XP reason codes",
  !payloadHas(leaked, "correct_attempt") && !payloadHas(leaked, "solution_revealed"),
);
check(
  "non-finite XP is shown as 0",
  presentProgress({
    grade: 4,
    skillProgress: [],
    completedSidequestCount: 0,
    totalXp: Number.NaN,
    quests: [],
  }).totalXp === 0,
);

if (failed > 0) {
  console.error(`\n${failed} presentation checks failed`);
  process.exit(1);
}

console.log("\nall presentation checks passed");
