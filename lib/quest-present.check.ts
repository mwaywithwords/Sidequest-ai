/**
 * Checks that a ready quest is shaped into student-facing fields only.
 *
 * Run with: npx tsx lib/quest-present.check.ts
 *
 * These do not touch the database. They replay a verified-looking payload
 * and confirm the browser object cannot carry the answer or the internals.
 */

import type { CorrectAnswer, UsedValue } from "@/lib/ai/schemas";
import {
  forbiddenStudentFields,
  formatGroundedDisplay,
  groundedValuesForDisplay,
  presentStudentQuest,
  studentAnswerInput,
  type PresentReadyQuestInput,
} from "@/lib/quest-present";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

const observedVolume: UsedValue = {
  label: "Volume",
  value: 12,
  unit: "fl oz",
  origin: "observed",
};

const hypotheticalCans: UsedValue = {
  label: "Cans needed",
  value: 11,
  unit: "cans",
  origin: "given_in_problem",
};

const numberAnswer: CorrectAnswer = {
  type: "number",
  value: 11,
  unit: "cans",
};

const fractionAnswer: CorrectAnswer = {
  type: "fraction",
  numerator: 5,
  denominator: 8,
  unit: "of the pizza",
};

function readyInput(
  overrides: Partial<PresentReadyQuestInput> = {},
): PresentReadyQuestInput {
  return {
    questId: "00000000-0000-4000-8000-000000000001",
    objectName: "Soda can",
    photo: {
      url: "https://signed.example/photo.jpg",
      alt: "Your photo of Soda can",
    },
    discoveryTitle: "Made to fit a hand",
    discoveryText:
      "The 12 ounce can stayed this size because it was comfortable to hold.",
    objectConnection:
      "Your can tells us exactly how much it holds: 12 fluid ounces.",
    valuesUsed: [observedVolume, hypotheticalCans],
    challengeMode: "grounded_scenario",
    question:
      "A dispenser holds 128 fluid ounces. If each can holds 12 fluid ounces, how many whole cans fill it?",
    hint1: "Try dividing 128 by 12.",
    answer: numberAnswer,
    skillLabel: "Division",
    skillAccent: "#ffc94d",
    grade: 5,
    skillId: "division",
    ...overrides,
  };
}

const presented = presentStudentQuest(readyInput());

check(
  "look-closely sentence uses the observed value, not an invented one",
  presented.lookClosely ===
    "Look closely — your soda can shows 12 FL OZ.",
);

check(
  "practice line names the skill without a skill code",
  presented.practiceLine ===
    "That real measurement gives us a starting point for division.",
);

check(
  "only grounded values are highlighted",
  presented.highlightedValues.length === 1 &&
    presented.highlightedValues[0]?.display === "12 FL OZ" &&
    presented.highlightedValues[0]?.label === "Volume",
);

check(
  "a hypothetical problem value is not shown as if it were on the object",
  !presented.highlightedValues.some((value) => value.display.includes("11")),
);

check(
  "grounded_scenario becomes a boolean, not a mode name",
  presented.imaginedSituation === true &&
    !Object.keys(presented).includes("challengeMode"),
);

check(
  "direct mode does not claim the challenge imagines a situation",
  presentStudentQuest(readyInput({ challengeMode: "direct" }))
    .imaginedSituation === false,
);

check(
  "number answers keep the unit and drop the value",
  presented.answer.kind === "number" &&
    presented.answer.unit === "cans" &&
    !("value" in presented.answer),
);

const fractionView = presentStudentQuest(
  readyInput({ answer: fractionAnswer }),
);

check(
  "fraction answers keep the unit and drop the parts",
  fractionView.answer.kind === "fraction" &&
    fractionView.answer.unit === "of the pizza" &&
    !("numerator" in fractionView.answer) &&
    !("denominator" in fractionView.answer),
);

check(
  "empty hint 1 is omitted",
  presentStudentQuest(readyInput({ hint1: "   " })).hint === null,
);

check(
  "hint 2 is never part of the presentation",
  !("hint2" in presented) && !("hint_2" in presented),
);

check(
  "an unsolved quest starts open and does not carry a revealed answer",
  presented.progress.status === "open" &&
    !("revealedAnswer" in presented.progress) &&
    !("correctAnswer" in presented.progress),
);

check(
  "mission links are built on the server from grade and skill",
  presented.scanHref === "/scan?grade=5&skill=division" &&
    presented.setupHref === "/setup?grade=5",
);

check(
  "object name stays as stored, spoken form is lowered for sentences",
  presented.objectName === "Soda can" &&
    presented.objectNameSpoken === "soda can",
);

const serialized = JSON.stringify(presented);

check(
  "serialized payload does not include the numeric answer",
  !serialized.includes('"value":11') && !serialized.includes(":11"),
);

check(
  "serialized payload does not include generation internals",
  !serialized.includes("correctAnswer") &&
    !serialized.includes("correct_answer") &&
    !serialized.includes("generation_metadata") &&
    !serialized.includes("verificationStrategy") &&
    !serialized.includes("computation") &&
    !serialized.includes("grounded_scenario") &&
    !serialized.includes("given_in_problem") &&
    !serialized.includes("gpt-"),
);

check(
  "forbidden keys are absent from the presentation object",
  forbiddenStudentFields(presented).length === 0,
);

check(
  "a raw challenge-shaped object is flagged",
  forbiddenStudentFields({
    question: "How many?",
    correctAnswer: numberAnswer,
    generation_metadata: { model: "gpt-5.4" },
  }).join(",") === "correctAnswer,generation_metadata",
);

check(
  "formatGroundedDisplay uppercases the unit and keeps the number",
  formatGroundedDisplay(observedVolume) === "12 FL OZ",
);

check(
  "groundedValuesForDisplay drops given_in_problem",
  groundedValuesForDisplay([observedVolume, hypotheticalCans]).length === 1,
);

check(
  "studentAnswerInput never copies the number across",
  JSON.stringify(studentAnswerInput(numberAnswer)) ===
    JSON.stringify({ kind: "number", unit: "cans" }),
);

check(
  "quest id is the only database identifier on the student payload",
  presented.questId === "00000000-0000-4000-8000-000000000001" &&
    !("challengeId" in presented) &&
    !("profileId" in presented),
);

if (failed > 0) {
  console.error(`\n${failed} quest-present checks failed`);
  process.exit(1);
}

console.log("\nall quest-present checks passed");
