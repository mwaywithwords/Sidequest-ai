/**
 * Checks that a ready quest is shaped into student-facing fields only.
 *
 * Run with: npx tsx lib/quest-present.check.ts
 *
 * These do not touch the database. They replay a verified-looking payload
 * and confirm the browser object cannot carry the answer or the internals.
 */

import type { Computation, CorrectAnswer, UsedValue } from "@/lib/ai/schemas";
import {
  forbiddenStudentFields,
  formatGroundedDisplay,
  groundedValuesForDisplay,
  presentStudentQuest,
  studentAnswerInput,
  visibleConnectContent,
  type PresentReadyQuestInput,
} from "@/lib/quest-present";
import { copy } from "@/lib/copy";

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

const divisionComputation: Computation = {
  type: "division",
  operation: "whole_groups",
  dividend: {
    label: "dispenser volume",
    value: 128,
    unit: "fl oz",
    origin: "given_in_problem",
  },
  divisor: observedVolume,
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
    challengeMode: "object_math",
    question:
      "A dispenser holds 128 fluid ounces. If each can holds 12 fluid ounces, how many whole cans fill it?",
    computation: divisionComputation,
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

const presentedConnect = visibleConnectContent(presented);

check(
  "Connect still displays the observed mathematical value",
  presentedConnect.observationLabel === "Volume" &&
    presentedConnect.observationValue === "12 FL OZ",
);

check(
  "Connect still displays the selected skill",
  presentedConnect.skillLabel === "Division",
);

check(
  "Connect uses the catalogue skill symbol",
  presentedConnect.skillSymbol === "÷" &&
    presentedConnect.skillDisplay === "÷ Division",
);

check(
  "Connect sentence uses the grounded measurement",
  presentedConnect.sentence === "We can use 12 fl oz in a division challenge!",
);

check(
  "Connect heading copy is WE FOUND THE MATH!",
  copy.quest.experience.connectEyebrow === "We found the math!",
);

check(
  "long objectConnection prose is not part of the visible Connect bridge",
  presentedConnect.observationValue !== presented.connection &&
    !JSON.stringify(presentedConnect).includes(
      "Your can tells us exactly how much it holds",
    ),
);

check(
  "generic explanation prose is not part of the visible Connect bridge",
  !JSON.stringify(presentedConnect).includes(
    "Your object gives us the real number to start from",
  ) &&
    !JSON.stringify(presentedConnect).includes(
      "The challenge may set up a situation around it",
    ) &&
    !JSON.stringify(presentedConnect).includes(
      copy.quest.experience.imaginedSituation,
    ) &&
    !JSON.stringify(presentedConnect).includes(
      copy.quest.experience.inspiredSituation,
    ),
);

check(
  "objectConnection remains on the payload for internal use",
  presented.connection ===
    "Your can tells us exactly how much it holds: 12 fluid ounces.",
);

check(
  "Did You Know copy is not turned into a grounded measurement chip",
  presented.discoveryText.includes("comfortable to hold") &&
    !presented.highlightedValues.some((value) =>
      value.display.toLowerCase().includes("comfortable"),
    ),
);

check(
  "a hypothetical problem value is not shown as if it were on the object",
  !presented.highlightedValues.some((value) => value.display.includes("11")),
);

check(
  "object_math with a given-in-problem value becomes a boolean, not a mode name",
  presented.imaginedSituation === true &&
    !Object.keys(presented).includes("challengeMode"),
);

check(
  "object_math with only observed values does not claim an imagined situation",
  presentStudentQuest(
    readyInput({
      valuesUsed: [observedVolume],
    }),
  ).imaginedSituation === false,
);

const inspiredPresented = presentStudentQuest(
  readyInput({
    challengeMode: "inspired_math",
    inspirationTopic: "basketball scores",
    objectName: "Basketball",
    valuesUsed: [
      {
        label: "free throw points",
        value: 1,
        unit: "point",
        origin: "contextual",
      },
    ],
  }),
);

check(
  "inspired_math does not claim a contextual number was on the object",
  inspiredPresented.lookClosely !== null &&
    inspiredPresented.lookClosely.includes("another trail") &&
    !inspiredPresented.lookClosely.includes("shows 1") &&
    inspiredPresented.worldContext === true &&
    inspiredPresented.highlightedValues.length === 0,
);

const inspiredConnect = visibleConnectContent(inspiredPresented);

check(
  "inspired_math Connect shows the object and skill, not trail prose",
  inspiredConnect.observationValue === "Basketball" &&
    inspiredConnect.skillLabel === "Division" &&
    inspiredConnect.observationKind === "object" &&
    inspiredConnect.sentence === "We can practice division!" &&
    !JSON.stringify(inspiredConnect).includes("another trail") &&
    !JSON.stringify(inspiredConnect).includes("basketball scores"),
);

const shapeCountQuest = presentStudentQuest(
  readyInput({
    skillLabel: "Geometry",
    skillId: "geometry",
    skillAccent: "#ff8fd4",
    valuesUsed: [],
    computation: {
      type: "shape_count",
      shape: "rectangle",
      feature: "faces",
    },
    answer: { type: "number", value: 6 },
  }),
);
const shapeCountConnect = visibleConnectContent(shapeCountQuest);

check(
  "shape/geometry observation uses the grounded form, not a manufactured number",
  shapeCountQuest.groundedShape === "rectangle" &&
    shapeCountConnect.observationKind === "shape" &&
    shapeCountConnect.observationValue === "RECTANGLE" &&
    shapeCountConnect.skillSymbol === "△" &&
    shapeCountConnect.sentence ===
      "We found a rectangle for a geometry challenge!",
);

const identifyQuest = presentStudentQuest(
  readyInput({
    skillLabel: "Geometry",
    skillId: "geometry",
    skillAccent: "#ff8fd4",
    valuesUsed: [],
    computation: {
      type: "shape_identify",
      aspect: "plane",
      label: "rectangle",
    },
    answer: { type: "choice", value: "rectangle", set: "plane" },
  }),
);
const identifyConnect = visibleConnectContent(identifyQuest);

check(
  "shape_identify does not leak the correct answer onto Connect",
  identifyQuest.groundedShape === null &&
    identifyConnect.observationValue === "Soda can" &&
    identifyConnect.sentence === "We can practice geometry!" &&
    !identifyConnect.observationValue.toLowerCase().includes("rectangle"),
);

const measuredGeometry = presentStudentQuest(
  readyInput({
    skillLabel: "Geometry",
    skillId: "geometry",
    valuesUsed: [
      {
        label: "Width",
        value: 12,
        unit: "cm",
        origin: "observed",
      },
    ],
    computation: {
      type: "geometry",
      operation: "perimeter",
      shape: "rectangle",
      dimensions: [
        {
          label: "Width",
          value: 12,
          unit: "cm",
          origin: "observed",
        },
      ],
    },
    answer: { type: "number", value: 48, unit: "cm" },
  }),
);
const measuredConnect = visibleConnectContent(measuredGeometry);

check(
  "measurement observation still wins over a geometry shape name",
  measuredConnect.observationKind === "measurement" &&
    measuredConnect.observationValue === "12 CM" &&
    measuredConnect.sentence === "We can use 12 cm in a geometry challenge!",
);

const missingObservation = presentStudentQuest(
  readyInput({
    valuesUsed: [
      {
        label: "Cans needed",
        value: 11,
        unit: "cans",
        origin: "given_in_problem",
      },
    ],
  }),
);
const missingConnect = visibleConnectContent(missingObservation);

check(
  "missing optional observation data fails gracefully",
  missingConnect.observationKind === "object" &&
    missingConnect.observationValue === "Soda can" &&
    missingConnect.sentence === "We can practice division!" &&
    !JSON.stringify(missingConnect).includes("11"),
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

const rewardedQuest = presentStudentQuest(
  readyInput({
    progress: {
      status: "correct",
      attemptNumber: 1,
      xp: 10,
      explanation: "Worked out.",
      revealedAnswer: "11 cans",
    },
  }),
);
const unrewardedQuest = presentStudentQuest(
  readyInput({
    progress: {
      status: "correct",
      attemptNumber: 1,
      xp: 0,
      explanation: "Worked out.",
      revealedAnswer: "11 cans",
    },
  }),
);
check(
  "existing XP presentation keeps the stored amount",
  rewardedQuest.progress.status === "correct" &&
    rewardedQuest.progress.xp === 10,
);
check(
  "a historical quest without a reward row still presents as correct",
  unrewardedQuest.progress.status === "correct" &&
    unrewardedQuest.progress.xp === 0,
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
  "math board is a shaped expression, not the raw computation",
  presented.mathExpression.kind === "equation" &&
    presented.mathExpression.lines[0]?.display === "128 ÷ 12 = ?" &&
    presented.mathExpression.lines[0]?.spoken ===
      "128 divided by 12 equals unknown" &&
    !("computation" in presented) &&
    !("type" in presented.mathExpression.lines[0]!),
);

check(
  "qualitative geometry keeps the student payload equation-free",
  presentStudentQuest(
    readyInput({
      computation: {
        type: "shape_identify",
        aspect: "solid",
        label: "sphere",
      },
      answer: { type: "choice", value: "sphere", set: "solid" },
    }),
  ).mathExpression.kind === "none",
);

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

const choiceView = studentAnswerInput({
  type: "choice",
  value: "cylinder",
  set: "solid",
});

check(
  "choice answers send the option list and drop the correct label as a value field",
  choiceView.kind === "choice" &&
    choiceView.options.includes("cylinder") &&
    choiceView.options.includes("sphere") &&
    !("value" in choiceView),
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
