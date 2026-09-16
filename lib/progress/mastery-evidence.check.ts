/**
 * Displayed skill-mastery evidence checks.
 *
 * Run with: npx tsx lib/progress/mastery-evidence.check.ts
 */

import type { Computation } from "@/lib/ai/schemas";
import { masteryPercent } from "@/lib/progress/presentation";
import {
  applyMasteryGate,
  displayedSkillMastery,
  evidenceCap,
  performanceMastery,
  structureKeyFromComputation,
  varietyScoreFromKeys,
  type ChallengeMasteryFacts,
} from "@/lib/progress/mastery-evidence";
import type { SkillAttemptRow } from "@/lib/progress/mastery";
import { presentProgress } from "@/lib/progress/presentation";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

function operand(value: number, label = "n") {
  return {
    label,
    value,
    origin: "observed" as const,
  };
}

function addComputation(values: number[]): Computation {
  return {
    type: "arithmetic",
    operation: "add",
    operands: values.map((value, index) => operand(value, `n${index}`)),
  };
}

function multiStepAddThenMultiply(): Computation {
  return {
    type: "multi_step_arithmetic",
    steps: [
      {
        operation: "add",
        operands: [
          { kind: "value", ...operand(12, "a") },
          { kind: "value", ...operand(8, "b") },
        ],
      },
      {
        operation: "multiply",
        operands: [
          { kind: "step_result", step: 0 },
          { kind: "value", ...operand(3, "c") },
        ],
      },
    ],
  };
}

function challenge(
  id: string,
  difficulty: number,
  computation: Computation,
): ChallengeMasteryFacts {
  const valuesUsed =
    computation.type === "arithmetic"
      ? computation.operands
      : [operand(12), operand(8)];
  return {
    id,
    difficulty,
    generationMetadata: {
      valuesUsed,
      computation,
      verificationStrategy: "recompute",
    },
  };
}

function attempt(
  challengeId: string,
  attemptNumber: number,
  isCorrect: boolean,
  createdAt: string,
): SkillAttemptRow {
  return { challengeId, isCorrect, attemptNumber, createdAt };
}

function percent(score: number): number {
  return masteryPercent(score);
}

const smallAdd = addComputation([8, 7]);
const mediumAdd = addComputation([40, 35]);
const largeAdd = addComputation([120, 80]);
const smallAddSameStructure = addComputation([9, 6]);

check(
  "same addition structure shares a key regardless of object-like labels",
  structureKeyFromComputation(smallAdd) ===
    structureKeyFromComputation(smallAddSameStructure),
);
check(
  "small and medium addition are different structure keys",
  structureKeyFromComputation(smallAdd) !==
    structureKeyFromComputation(mediumAdd),
);
check(
  "multi-step arithmetic is a different structure from one-step addition",
  structureKeyFromComputation(multiStepAddThenMultiply()) !==
    structureKeyFromComputation(smallAdd),
);
check(
  "structure keys are pipe-separated and omit object names",
  structureKeyFromComputation(smallAdd) === "arithmetic|add|one_step|n2|small" &&
    !structureKeyFromComputation(smallAdd).includes("wallet") &&
    !structureKeyFromComputation(smallAdd).includes("shoe"),
);
check("one structure key scores 0.40 variety", varietyScoreFromKeys(["a"]) === 0.4);
check("two structure keys score 0.70 variety", varietyScoreFromKeys(["a", "b"]) === 0.7);
check("three structure keys score 1.00 variety", varietyScoreFromKeys(["a", "b", "c"]) === 1);
check("duplicate keys do not inflate variety", varietyScoreFromKeys(["a", "a", "a"]) === 0.4);

check("0 completed Sidequests cap at 0", evidenceCap(0) === 0);
check("1 completed Sidequest caps at 20%", evidenceCap(1) === 0.2);
check("2 completed Sidequests cap at 40%", evidenceCap(2) === 0.4);
check("3 completed Sidequests cap at 60%", evidenceCap(3) === 0.6);
check("4 completed Sidequests cap at 80%", evidenceCap(4) === 0.8);
check("5 completed Sidequests cap at 100% possible", evidenceCap(5) === 1);
check("10 completed Sidequests still cap at 1", evidenceCap(10) === 1);

check(
  "a perfect performance without the gate cannot display 100",
  percent(applyMasteryGate(1, 1, false)) === 99,
);

const studentA = displayedSkillMastery({
  grade: 4,
  attempts: [attempt("a1", 1, true, "2026-09-15T00:00:00.000Z")],
  challenges: [challenge("a1", 3, smallAdd)],
});
check("Student A evidence cap is 20%", studentA.evidenceCap === 0.2);
check("Student A displayed mastery is 20%", percent(studentA.score) === 20);
check("Student A is never 56%", percent(studentA.score) !== 56);
check("Student A is never 100%", percent(studentA.score) !== 100 && studentA.gatePassed === false);

const studentBAttempts = [1, 2, 3, 4, 5].map((n) =>
  attempt(`b${n}`, 1, true, `2026-09-15T00:0${n}:00.000Z`),
);
const studentB = displayedSkillMastery({
  grade: 4,
  attempts: studentBAttempts,
  challenges: [
    challenge("b1", 3, smallAdd),
    challenge("b2", 3, mediumAdd),
    challenge("b3", 4, largeAdd),
    challenge("b4", 4, multiStepAddThenMultiply()),
    challenge("b5", 3, smallAdd),
  ],
});
check("Student B can reach 100%", studentB.gatePassed && percent(studentB.score) === 100);
check("Student B used three or more structure keys", studentB.structureKeys.length >= 3);
check("Student B has two or more expected-difficulty solves", studentB.solvedAtExpected >= 2);

const studentC = displayedSkillMastery({
  grade: 4,
  attempts: [
    attempt("c1", 2, true, "2026-09-15T00:01:00.000Z"),
    attempt("c1", 1, false, "2026-09-15T00:00:50.000Z"),
    attempt("c2", 2, true, "2026-09-15T00:02:00.000Z"),
    attempt("c2", 1, false, "2026-09-15T00:01:50.000Z"),
    attempt("c3", 3, true, "2026-09-15T00:03:00.000Z"),
    attempt("c3", 1, false, "2026-09-15T00:02:50.000Z"),
    attempt("c3", 2, false, "2026-09-15T00:02:55.000Z"),
    attempt("c4", 2, true, "2026-09-15T00:04:00.000Z"),
    attempt("c4", 1, false, "2026-09-15T00:03:50.000Z"),
    attempt("c5", 3, true, "2026-09-15T00:05:00.000Z"),
    attempt("c5", 1, false, "2026-09-15T00:04:50.000Z"),
    attempt("c5", 2, false, "2026-09-15T00:04:55.000Z"),
  ],
  challenges: [
    challenge("c1", 3, smallAdd),
    challenge("c2", 3, mediumAdd),
    challenge("c3", 4, largeAdd),
    challenge("c4", 4, multiStepAddThenMultiply()),
    challenge("c5", 3, smallAdd),
  ],
});
check(
  "Student C is below Student B because independence is weaker",
  percent(studentC.score) < percent(studentB.score) &&
    studentC.accuracyScore < studentB.accuracyScore,
);
check("Student C displayed mastery is 84%", percent(studentC.score) === 84);

const studentD = displayedSkillMastery({
  grade: 4,
  attempts: [
    attempt("d1", 1, true, "2026-09-15T00:01:00.000Z"),
    attempt("d2", 1, true, "2026-09-15T00:02:00.000Z"),
    attempt("d3", 1, false, "2026-09-15T00:03:00.000Z"),
    attempt("d3", 2, false, "2026-09-15T00:03:01.000Z"),
    attempt("d3", 3, false, "2026-09-15T00:03:02.000Z"),
    attempt("d4", 1, false, "2026-09-15T00:04:00.000Z"),
    attempt("d4", 2, false, "2026-09-15T00:04:01.000Z"),
    attempt("d4", 3, false, "2026-09-15T00:04:02.000Z"),
    attempt("d5", 1, false, "2026-09-15T00:05:00.000Z"),
    attempt("d5", 2, false, "2026-09-15T00:05:01.000Z"),
    attempt("d5", 3, false, "2026-09-15T00:05:02.000Z"),
  ],
  challenges: [
    challenge("d1", 3, smallAdd),
    challenge("d2", 3, mediumAdd),
    challenge("d3", 3, largeAdd),
    challenge("d4", 3, multiStepAddThenMultiply()),
    challenge("d5", 3, smallAdd),
  ],
});
check("Student D has full evidence from five completions", studentD.evidenceCap === 1);
check("Student D stays substantially below Students B and C", percent(studentD.score) < percent(studentC.score) && percent(studentD.score) < 70 && studentD.gatePassed === false);
check("Student D displayed mastery is 57%", percent(studentD.score) === 57);
check("Student D variety ignores unsolved reveals", studentD.structureKeys.length === 2);

const studentEAttempts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) =>
  attempt(`e${n}`, 1, true, `2026-09-15T00:${String(n).padStart(2, "0")}:00.000Z`),
);
const studentE = displayedSkillMastery({
  grade: 4,
  attempts: studentEAttempts,
  challenges: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) =>
    challenge(`e${n}`, 2, addComputation([4 + n, 3])),
  ),
});
check(
  "Student E does not reach 100% without structure variety",
  percent(studentE.score) < 100 &&
    studentE.gatePassed === false &&
    studentE.structureKeys.length === 1,
);
check("Student E displayed mastery is 70%", percent(studentE.score) === 70);

const studentFStrong = displayedSkillMastery({
  grade: 4,
  attempts: studentBAttempts,
  challenges: [
    challenge("b1", 3, smallAdd),
    challenge("b2", 3, mediumAdd),
    challenge("b3", 4, largeAdd),
    challenge("b4", 4, multiStepAddThenMultiply()),
    challenge("b5", 3, smallAdd),
  ],
});
const studentFLater = displayedSkillMastery({
  grade: 4,
  attempts: [
    ...studentBAttempts,
    attempt("f6", 1, false, "2026-09-16T00:01:00.000Z"),
    attempt("f6", 2, false, "2026-09-16T00:01:01.000Z"),
    attempt("f6", 3, false, "2026-09-16T00:01:02.000Z"),
    attempt("f7", 1, false, "2026-09-16T00:02:00.000Z"),
    attempt("f7", 2, false, "2026-09-16T00:02:01.000Z"),
    attempt("f7", 3, false, "2026-09-16T00:02:02.000Z"),
    attempt("f8", 1, false, "2026-09-16T00:03:00.000Z"),
    attempt("f8", 2, false, "2026-09-16T00:03:01.000Z"),
    attempt("f8", 3, false, "2026-09-16T00:03:02.000Z"),
  ],
  challenges: [
    challenge("b1", 3, smallAdd),
    challenge("b2", 3, mediumAdd),
    challenge("b3", 4, largeAdd),
    challenge("b4", 4, multiStepAddThenMultiply()),
    challenge("b5", 3, smallAdd),
    challenge("f6", 3, smallAdd),
    challenge("f7", 3, mediumAdd),
    challenge("f8", 3, largeAdd),
  ],
});
check("Student F starts at 100% after strong history", percent(studentFStrong.score) === 100);
check(
  "Student F mastery decreases after repeated reveals",
  percent(studentFLater.score) < percent(studentFStrong.score) &&
    studentFLater.gatePassed === false,
);
check("Student F later displayed mastery is 83%", percent(studentFLater.score) === 83);

const twoCompleted = displayedSkillMastery({
  grade: 4,
  attempts: [
    attempt("t1", 1, true, "2026-09-15T00:01:00.000Z"),
    attempt("t2", 1, true, "2026-09-15T00:02:00.000Z"),
  ],
  challenges: [
    challenge("t1", 4, smallAdd),
    challenge("t2", 4, mediumAdd),
  ],
});
check("2 completed Sidequests never display more than 40%", percent(twoCompleted.score) <= 40);

const threeCompleted = displayedSkillMastery({
  grade: 4,
  attempts: [
    attempt("u1", 1, true, "2026-09-15T00:01:00.000Z"),
    attempt("u2", 1, true, "2026-09-15T00:02:00.000Z"),
    attempt("u3", 1, true, "2026-09-15T00:03:00.000Z"),
  ],
  challenges: [
    challenge("u1", 4, smallAdd),
    challenge("u2", 4, mediumAdd),
    challenge("u3", 4, largeAdd),
  ],
});
check("3 completed Sidequests never display more than 60%", percent(threeCompleted.score) <= 60);

const fourCompleted = displayedSkillMastery({
  grade: 4,
  attempts: [
    attempt("v1", 1, true, "2026-09-15T00:01:00.000Z"),
    attempt("v2", 1, true, "2026-09-15T00:02:00.000Z"),
    attempt("v3", 1, true, "2026-09-15T00:03:00.000Z"),
    attempt("v4", 1, true, "2026-09-15T00:04:00.000Z"),
  ],
  challenges: [
    challenge("v1", 4, smallAdd),
    challenge("v2", 4, mediumAdd),
    challenge("v3", 4, largeAdd),
    challenge("v4", 4, multiStepAddThenMultiply()),
  ],
});
check("4 completed Sidequests never display more than 80%", percent(fourCompleted.score) <= 80);

const abandoned = displayedSkillMastery({
  grade: 4,
  attempts: [attempt("open", 1, false, "2026-09-15T00:01:00.000Z")],
  challenges: [challenge("open", 3, smallAdd)],
});
check("an abandoned first miss does not create mastery", abandoned.completed === 0 && abandoned.score === 0);

const replayed = displayedSkillMastery({
  grade: 4,
  attempts: [
    attempt("same", 1, true, "2026-09-15T00:01:00.000Z"),
    attempt("same", 1, true, "2026-09-15T00:02:00.000Z"),
  ],
  challenges: [challenge("same", 3, smallAdd)],
});
check("replayed attempts on one challenge count as one Sidequest", replayed.completed === 1);

const generatedOnly = displayedSkillMastery({
  grade: 4,
  attempts: [],
  challenges: [challenge("unused", 4, smallAdd)],
});
check("generating a Sidequest does not affect mastery", generatedOnly.completed === 0 && generatedOnly.score === 0);

const missingMetadata = displayedSkillMastery({
  grade: 4,
  attempts: [attempt("old", 1, true, "2026-09-15T00:01:00.000Z")],
  challenges: [{ id: "old", difficulty: 3, generationMetadata: {} }],
});
check(
  "unparsable historical metadata does not invent variety",
  missingMetadata.structureKeys.length === 0 &&
    missingMetadata.varietyScore === 0 &&
    percent(missingMetadata.score) <= 20,
);

check(
  "performance weights do not include evidence",
  Math.abs(
    performanceMastery({
      accuracyScore: 1,
      varietyScore: 1,
      difficultyScore: 1,
    }) - 1,
  ) < 1e-9,
);

const grade3Expected = displayedSkillMastery({
  grade: 3,
  attempts: [
    attempt("g1", 1, true, "2026-09-15T00:01:00.000Z"),
    attempt("g2", 1, true, "2026-09-15T00:02:00.000Z"),
  ],
  challenges: [
    challenge("g1", 2, smallAdd),
    challenge("g2", 2, mediumAdd),
  ],
});
check(
  "Grade 3 expected-difficulty solves use gradeDefaultDifficulty 2",
  grade3Expected.solvedAtExpected === 2,
);

const grade5Card = presentProgress({
  grade: 5,
  skillProgress: [
    {
      skillCode: "addition",
      gradeLevel: 3,
      totalAttempts: 5,
      correctAttempts: 5,
      masteryScore: 1,
      currentLevel: 4,
      lastPracticedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  completedSidequestCount: 5,
  totalXp: 50,
  quests: [],
});
check(
  "Student G Grade 5 Addition stays unpracticed after Grade 3 mastery",
  grade5Card.skills.find((skill) => skill.skillId === "addition")?.practiced ===
    false &&
    grade5Card.skills.find((skill) => skill.skillId === "addition")
      ?.masteryPercent === null,
);

if (failed > 0) {
  console.error(`\n${failed} mastery-evidence checks failed`);
  process.exit(1);
}

console.log("\nall mastery-evidence checks passed");
