/**
 * Deterministic read-aloud speech formatting checks.
 *
 * Run with: npx tsx lib/speech.check.ts
 *
 * These do not call a model or the browser Speech Synthesis API. They
 * format student-facing challenge text and confirm the readout cannot
 * leak a stored answer.
 */

import type { Computation, UsedValue } from "@/lib/ai/schemas";
import { evaluateComputation } from "@/lib/math/evaluate";
import { presentMathExpression } from "@/lib/math/expression";
import { presentStudentQuest, visibleConnectContent } from "@/lib/quest-present";
import {
  formatSpokenExpression,
  formatSpokenProse,
  preferSpeechVoice,
  reduceSpeechPlayback,
  SPEECH_NARRATION,
  spokenChallengeReadout,
  spokenConnectReadout,
  spokenDiscoverReadout,
} from "@/lib/speech";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

function val(
  label: string,
  value: number,
  origin: UsedValue["origin"] = "given_in_problem",
  unit?: string,
): UsedValue {
  return unit === undefined
    ? { label, value, origin }
    : { label, value, origin, unit };
}

function leaksAnswer(spoken: string, computation: Computation): boolean {
  const evaluated = evaluateComputation(computation);
  if (!evaluated.ok) return true;

  const answer = evaluated.answer;
  if (answer.type === "number") {
    return (
      spoken.includes(`equals ${answer.value}`) ||
      spoken.includes(`= ${answer.value}`) ||
      (spoken.includes(String(answer.value)) &&
        spoken.includes("equals") &&
        spoken.endsWith(String(answer.value)))
    );
  }

  if (answer.type === "fraction") {
    return (
      spoken.includes(`${answer.numerator}/${answer.denominator}`) ||
      spoken.includes(`equals ${answer.numerator}`)
    );
  }

  return spoken.includes(answer.value);
}

const addition = {
  type: "arithmetic" as const,
  operation: "add" as const,
  operands: [val("left", 35), val("right", 40)],
};

check(
  "addition reads plus and hides the sum",
  formatSpokenExpression(presentMathExpression(addition)) ===
    "35 plus 40 equals what" && !leaksAnswer(
      formatSpokenExpression(presentMathExpression(addition)),
      addition,
    ),
);

const subtraction = {
  type: "arithmetic" as const,
  operation: "subtract" as const,
  operands: [val("start", 125), val("taken", 70)],
};

check(
  "subtraction reads minus",
  formatSpokenExpression(presentMathExpression(subtraction)) ===
    "125 minus 70 equals what",
);

const multiplication = {
  type: "arithmetic" as const,
  operation: "multiply" as const,
  operands: [val("volume", 222, "observed", "mL"), val("cans", 4)],
};
const multiplicationSpoken = formatSpokenExpression(
  presentMathExpression(multiplication),
);

check(
  "multiplication reads times",
  multiplicationSpoken === "222 times 4 equals what",
);

check(
  "multiplication does not leak 888",
  !multiplicationSpoken.includes("888") &&
    !leaksAnswer(multiplicationSpoken, multiplication),
);

const division = {
  type: "division" as const,
  operation: "quotient" as const,
  dividend: val("total", 60),
  divisor: val("groups", 4),
};

check(
  "division reads divided by",
  formatSpokenExpression(presentMathExpression(division)) ===
    "60 divided by 4 equals what",
);

const halfOf = {
  type: "fraction_of" as const,
  quantity: val("whole", 10),
  numerator: 1,
  denominator: 2,
};

check(
  "one half is read naturally",
  formatSpokenExpression(presentMathExpression(halfOf)) ===
    "one half times 10 equals what",
);

const quarterOf = {
  type: "fraction_of" as const,
  quantity: val("whole", 80),
  numerator: 1,
  denominator: 4,
};

check(
  "one fourth is read naturally",
  formatSpokenExpression(presentMathExpression(quarterOf)) ===
    "one fourth times 80 equals what",
);

check(
  "prose fractions keep named halves and fourths",
  formatSpokenProse("Use 1/2 of the bottle, then 1/4 of what is left.") ===
    "Use one half of the bottle, then one fourth of what is left.",
);

check(
  "units expand only next to numbers",
  formatSpokenProse(
    "Suppose one can contains 222 mL. Keep looking in the photo.",
  ) === "Suppose one can contains 222 milliliters. Keep looking in the photo.",
);

check(
  "fluid ounces expand beside a measurement",
  formatSpokenProse("The bottle shows 12 fl oz on the label.") ===
    "The bottle shows 12 fluid ounces on the label.",
);

const multiStep: Computation = {
  type: "multi_step_arithmetic",
  steps: [
    {
      operation: "add",
      operands: [
        { kind: "value", ...val("starting", 50) },
        { kind: "value", ...val("added", 20) },
      ],
    },
    {
      operation: "subtract",
      operands: [
        { kind: "value", ...val("target", 125) },
        { kind: "step_result", step: 0 },
      ],
    },
  ],
};
const multiSpoken = formatSpokenExpression(presentMathExpression(multiStep));

check(
  "multi-step reads each line and asks for the last result",
  multiSpoken ===
    "Step 1: 50 plus 20 equals 70. Step 2: 125 minus 70 equals what",
);

check(
  "multi-step does not leak 55",
  !multiSpoken.includes("55") && !leaksAnswer(multiSpoken, multiStep),
);

const question =
  "Suppose one can contains 222 milliliters. If you had four cans, how many milliliters would that be altogether?";

const challengeSpoken = spokenChallengeReadout({
  question,
  expression: presentMathExpression(multiplication),
});

check(
  "challenge readout reads the question then the expression",
  challengeSpoken ===
    "Suppose one can contains 222 milliliters. If you had four cans, how many milliliters would that be altogether? 222 times 4 equals what",
);

check(
  "a question mark in the prompt is not turned into what",
  challengeSpoken.includes("altogether?") &&
    !challengeSpoken.includes("altogether what"),
);

check(
  "challenge readout does not leak the product",
  !challengeSpoken.includes("888"),
);

check(
  "hints convert operators without inventing an answer",
  formatSpokenProse("Try 222 × 4.") === "Try 222 times 4.",
);

check(
  "solution prose can be read after completion",
  formatSpokenProse("Four cans of 222 mL is 888 milliliters in all.") ===
    "Four cans of 222 milliliters is 888 milliliters in all.",
);

check(
  "qualitative geometry has nothing extra to read",
  formatSpokenExpression(
    presentMathExpression({
      type: "shape_identify",
      aspect: "solid",
      label: "sphere",
    }),
  ) === "",
);

check(
  "readout never names origins or stored-answer keys",
  !challengeSpoken.includes("observed") &&
    !challengeSpoken.includes("correctAnswer") &&
    !challengeSpoken.includes("correct_answer") &&
    !challengeSpoken.includes("computation") &&
    !challengeSpoken.includes("given_in_problem"),
);

const walletDiscover = spokenDiscoverReadout({
  objectName: "WALLET",
  discoveryText:
    "Wallets were made so people could keep money and important cards together in a pocket. Folding them flat made them easier to carry than a bag of loose coins.",
  observations: [
    { label: "Shape", display: "RECTANGLE" },
    { label: "Use", display: "cards" },
  ],
});

check(
  "discover reads object, one token, Did you know, then the fact",
  walletDiscover ===
    "Wallet. Rectangle. Did you know? Wallets were made so people could keep money and important cards together in a pocket. Folding them flat made them easier to carry than a bag of loose coins.",
);

check(
  "discover does not narrate extra collectible chips",
  !walletDiscover.toLowerCase().includes("cards") ||
    walletDiscover.toLowerCase().indexOf("cards") ===
      walletDiscover.toLowerCase().lastIndexOf("cards"),
);

const canDiscover = spokenDiscoverReadout({
  objectName: "Beverage can",
  discoveryText:
    "Aluminum cans can be recycled and made into new cans again. Aluminum can be reused many times instead of being thrown away.",
  observations: [
    { label: "Volume", display: "12 fl oz" },
    { label: "Form", display: "Cylinder" },
  ],
});

check(
  "discover reads one useful measurement before Did you know",
  canDiscover ===
    "Beverage can. 12 fluid ounces. Did you know? Aluminum cans can be recycled and made into new cans again. Aluminum can be reused many times instead of being thrown away.",
);

check(
  "discover falls back to a visible measurement when there is no fact yet",
  spokenDiscoverReadout({
    objectName: "Soda can",
    discoveryText: "",
    observations: [{ label: "Volume", display: "12 fl oz" }],
  }) === "Soda can. 12 fluid ounces.",
);

const candleDiscover = spokenDiscoverReadout({
  objectName: "LIDDED CANDLE JAR",
  discoveryText:
    "Candles have been used for thousands of years. Long ago, people used them as an important source of light before electric lights existed.",
  observations: [{ label: "Measurement", display: "11 OZ" }],
});

check(
  "candle discover matches the student-facing narration",
  candleDiscover ===
    "Lidded candle jar. 11 ounces. Did you know? Candles have been used for thousands of years. Long ago, people used them as an important source of light before electric lights existed.",
);

const presentedQuest = presentStudentQuest({
  questId: "00000000-0000-4000-8000-000000000001",
  objectName: "Soda can",
  photo: null,
  discoveryTitle: "Made to fit a hand",
  discoveryText:
    "The 12 ounce can stayed this size because it was comfortable to hold.",
  objectConnection:
    "Your can tells us exactly how much it holds: 12 fluid ounces.",
  valuesUsed: [
    val("Volume", 12, "observed", "fl oz"),
    val("Cans needed", 11, "given_in_problem", "cans"),
  ],
  challengeMode: "object_math",
  question:
    "A dispenser holds 128 fluid ounces. If each can holds 12 fluid ounces, how many whole cans fill it?",
  computation: {
    type: "division",
    operation: "whole_groups",
    dividend: val("dispenser volume", 128, "given_in_problem", "fl oz"),
    divisor: val("Volume", 12, "observed", "fl oz"),
  },
  hint1: "Try dividing 128 by 12.",
  answer: { type: "number", value: 11, unit: "cans" },
  skillLabel: "Division",
  skillAccent: "#ffc94d",
  grade: 5,
  skillId: "division",
});

const presentedDiscover = spokenDiscoverReadout({
  objectName: presentedQuest.objectName,
  discoveryText: presentedQuest.discoveryText,
  observations: presentedQuest.highlightedValues,
});

check(
  "discover speech uses the presented object name, token, and Did you know",
  presentedDiscover ===
    "Soda can. 12 fluid ounces. Did you know? The 12 ounces can stayed this size because it was comfortable to hold.",
);

check(
  "discover speech excludes hidden challenge and answer data",
  !presentedDiscover.includes("11") &&
    !presentedDiscover.includes("128") &&
    !presentedDiscover.includes("Try dividing") &&
    !presentedDiscover.includes("correctAnswer") &&
    !presentedDiscover.includes("challengeMode") &&
    !presentedDiscover.includes("observed") &&
    !presentedDiscover.includes("given_in_problem"),
);

const presentedConnectView = visibleConnectContent(presentedQuest);
const presentedConnect = spokenConnectReadout({
  observation: presentedConnectView.observationValue,
  skill: presentedConnectView.skillLabel,
  kind: presentedConnectView.observationKind,
});

check(
  "connect speech reads a concise natural measurement line",
  presentedConnect ===
    "We found 12 fluid ounces. We can use it in a division challenge.",
);

check(
  "connect speech does not narrate every UI label",
  !presentedConnect.toLowerCase().includes("from your photo") &&
    !presentedConnect.toLowerCase().includes("we can practice") &&
    !presentedConnect.toLowerCase().includes("volume"),
);

check(
  "connect speech does not read hidden objectConnection prose",
  !presentedConnect.includes("tells us exactly") &&
    !presentedConnect.includes(presentedQuest.connection) &&
    !presentedConnect.includes("Look closely") &&
    !presentedConnect.includes("real number to start from") &&
    !presentedConnect.includes("situation around it") &&
    !presentedConnect.includes("grounding") &&
    !presentedConnect.includes("given_in_problem"),
);

check(
  "connect speech excludes the future challenge, hint, and answer",
  !presentedConnect.includes("11") &&
    !presentedConnect.includes("128") &&
    !presentedConnect.includes("Try dividing") &&
    !presentedConnect.includes("correctAnswer") &&
    !presentedConnect.includes("how many whole cans"),
);

const inspiredQuest = presentStudentQuest({
  questId: "00000000-0000-4000-8000-000000000002",
  objectName: "Wallet",
  photo: null,
  discoveryTitle: "A pocket companion",
  discoveryText:
    "This wallet has a rectangular shape, visible stitching, and compartments for carrying cards and money.",
  objectConnection:
    "Your wallet has a rectangular form. Geometry helps us explore shapes and their properties.",
  valuesUsed: [
    {
      label: "free throw points",
      value: 1,
      unit: "point",
      origin: "contextual",
    },
  ],
  challengeMode: "inspired_math",
  inspirationTopic: "basketball scores",
  question: "How many points would 8 free throws be worth?",
  computation: {
    type: "arithmetic",
    operation: "multiply",
    operands: [
      val("free throw points", 1, "contextual", "point"),
      val("throws", 8, "given_in_problem"),
    ],
  },
  hint1: "Each free throw is 1 point.",
  answer: { type: "number", value: 8, unit: "points" },
  skillLabel: "Geometry",
  skillAccent: "#ff8fd4",
  grade: 4,
  skillId: "geometry",
});

const inspiredConnectView = visibleConnectContent(inspiredQuest);
const inspiredConnect = spokenConnectReadout({
  observation: inspiredConnectView.observationValue,
  skill: inspiredConnectView.skillLabel,
  kind: inspiredConnectView.observationKind,
});

check(
  "inspired connect speech reads a short practice line",
  inspiredConnect === "We can practice geometry.",
);

check(
  "inspired connect speech does not read hidden trail or objectConnection prose",
  !inspiredConnect.includes("another trail") &&
    !inspiredConnect.includes("wider world") &&
    !inspiredConnect.includes(inspiredQuest.connection) &&
    !inspiredConnect.includes("rectangular form") &&
    !inspiredConnect.includes("From your photo"),
);

check(
  "inspired connect speech does not leak the later answer",
  !inspiredConnect.includes("8 points") &&
    !inspiredConnect.includes("Each free throw") &&
    !inspiredConnect.includes("correctAnswer"),
);

check(
  "connect speech for a printed measurement is observation then skill",
  spokenConnectReadout({
    observation: "311 G",
    skill: "Addition",
    kind: "measurement",
  }) === "We found 311 grams. We can use it in an addition challenge.",
);

check(
  "connect speech for a visible geometry property is observation then skill",
  spokenConnectReadout({
    observation: "RECTANGLE",
    skill: "Geometry",
    kind: "shape",
  }) === "We found a rectangle. We can use it in a geometry challenge.",
);

check(
  "connect speech for a count is natural and brief",
  spokenConnectReadout({
    observation: "6",
    skill: "Multiplication",
    kind: "count",
  }) === "We found 6. We can use that in a multiplication challenge.",
);

check(
  "hidden look-closely copy is not spoken",
  spokenConnectReadout({
    observation: "12 FL OZ",
    skill: "Division",
    kind: "measurement",
  }) === "We found 12 fluid ounces. We can use it in a division challenge.",
);

const idle = reduceSpeechPlayback({ playingId: null }, { type: "stop" });

check(
  "speech stays silent until the student taps",
  idle.state.playingId === null && idle.effect === "none",
);

const started = reduceSpeechPlayback(
  { playingId: null },
  { type: "toggle", id: "discover" },
);

check(
  "the first tap starts one readout",
  started.state.playingId === "discover" && started.effect === "start",
);

const replaced = reduceSpeechPlayback(
  { playingId: "discover" },
  { type: "toggle", id: "connect" },
);

check(
  "starting another readout cancels the current utterance",
  replaced.state.playingId === "connect" &&
    replaced.effect === "cancel-then-start",
);

const stopped = reduceSpeechPlayback(
  { playingId: "connect" },
  { type: "stop" },
);

check(
  "navigation and unmount cancel speech",
  stopped.state.playingId === null && stopped.effect === "cancel",
);

check(
  "tapping the same control stops rather than overlapping",
  reduceSpeechPlayback({ playingId: "challenge" }, { type: "toggle", id: "challenge" })
    .effect === "cancel",
);

check(
  "empty voice lists fall back to the browser default",
  preferSpeechVoice([]) === null,
);

check(
  "an enhanced English voice beats a compact default",
  preferSpeechVoice([
    {
      name: "Samantha Compact",
      lang: "en-US",
      localService: true,
      default: true,
    },
    {
      name: "Samantha (Enhanced)",
      lang: "en-US",
      localService: true,
      default: false,
    },
  ])?.name === "Samantha (Enhanced)",
);

check(
  "novelty voices lose to a natural English voice",
  preferSpeechVoice([
    { name: "Zarvox", lang: "en-US", localService: true, default: true },
    {
      name: "Google US English",
      lang: "en-US",
      localService: false,
      default: false,
    },
  ])?.name === "Google US English",
);

check(
  "an English voice is preferred over a non-English default",
  preferSpeechVoice([
    { name: "Thomas", lang: "fr-FR", localService: true, default: true },
    {
      name: "Google UK English Female",
      lang: "en-GB",
      localService: false,
      default: false,
    },
  ])?.lang.toLowerCase().startsWith("en") === true,
);

check(
  "narration stays warm and clear instead of slow GPS",
  SPEECH_NARRATION.rate > 0.9 &&
    SPEECH_NARRATION.rate < 1.15 &&
    SPEECH_NARRATION.pitch > 1 &&
    SPEECH_NARRATION.pitch < 1.2 &&
    SPEECH_NARRATION.volume === 1,
);

if (failed > 0) {
  console.error(`\n${failed} speech checks failed`);
  process.exit(1);
}

console.log("\nall speech checks passed");
