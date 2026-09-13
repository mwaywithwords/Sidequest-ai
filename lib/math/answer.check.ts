/**
 * Deterministic student-answer checks.
 *
 * Run with: npx tsx lib/math/answer.check.ts
 */

import type { CorrectAnswer } from "@/lib/ai/schemas";
import {
  formatRevealedAnswer,
  parseFractionSubmission,
  parseNumberSubmission,
  parseStudentSubmission,
  studentAnswerMatches,
} from "@/lib/math/answer";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

const sevenOz: CorrectAnswer = { type: "number", value: 7, unit: "fl oz" };
const eleven: CorrectAnswer = { type: "number", value: 11 };
const half: CorrectAnswer = { type: "fraction", numerator: 1, denominator: 2 };
const fiveEighths: CorrectAnswer = {
  type: "fraction",
  numerator: 5,
  denominator: 8,
};

const seven = parseNumberSubmission("7");
const sevenPointZero = parseNumberSubmission("7.0");
const padded = parseNumberSubmission(" 7 ");
const blank = parseNumberSubmission("   ");
const junk = parseNumberSubmission("seven");
const wrongUnit = parseNumberSubmission("7 ml");
const matchingUnit = parseNumberSubmission("7 fl oz");

check("correct integer parses", seven.ok && seven.answer.type === "number" && seven.answer.value === 7);
check(
  "correct integer matches",
  seven.ok && studentAnswerMatches(seven.answer, sevenOz),
);
check(
  "incorrect integer does not match",
  parseNumberSubmission("8").ok &&
    !studentAnswerMatches(
      { type: "number", value: 8 },
      sevenOz,
    ),
);
check(
  "equivalent decimal 7.0 matches the integer 7",
  sevenPointZero.ok && studentAnswerMatches(sevenPointZero.answer, sevenOz),
);
check(
  "padded whitespace still matches",
  padded.ok && studentAnswerMatches(padded.answer, sevenOz),
);
check("blank number is rejected", blank.ok === false && blank.reason === "blank");
check("malformed number is rejected", junk.ok === false && junk.reason === "malformed");
check(
  "wrong unit does not match",
  wrongUnit.ok && !studentAnswerMatches(wrongUnit.answer, sevenOz),
);
check(
  "matching typed unit is accepted",
  matchingUnit.ok && studentAnswerMatches(matchingUnit.answer, sevenOz),
);
check(
  "a bare number matches when the UI already named the unit",
  seven.ok && studentAnswerMatches(seven.answer, sevenOz),
);

const exactFraction = parseFractionSubmission("5", "8");
const equivalent = parseFractionSubmission("2", "4");
const wrongFraction = parseFractionSubmission("1", "8");
const zeroDen = parseFractionSubmission("1", "0");
const blankNum = parseFractionSubmission("", "8");
const blankDen = parseFractionSubmission("5", "");
const negativeEquivalent = parseFractionSubmission("-1", "-2");

check(
  "correct fraction matches",
  exactFraction.ok && studentAnswerMatches(exactFraction.answer, fiveEighths),
);
check(
  "equivalent fraction 2/4 matches 1/2",
  equivalent.ok && studentAnswerMatches(equivalent.answer, half),
);
check(
  "incorrect fraction does not match",
  wrongFraction.ok && !studentAnswerMatches(wrongFraction.answer, fiveEighths),
);
check(
  "zero denominator is rejected",
  zeroDen.ok === false && zeroDen.reason === "zero_denominator",
);
check("blank numerator is rejected", blankNum.ok === false && blankNum.reason === "blank");
check("blank denominator is rejected", blankDen.ok === false && blankDen.reason === "blank");
check(
  "sign is preserved through reduction: -1/-2 equals 1/2",
  negativeEquivalent.ok &&
    studentAnswerMatches(negativeEquivalent.answer, half),
);
check(
  "malformed fraction text is rejected",
  parseFractionSubmission("1.5", "2").ok === false,
);

check(
  "revealed number keeps the unit as display text, not JSON",
  formatRevealedAnswer(sevenOz) === "7 fl oz",
);
check(
  "revealed fraction is reduced display text",
  formatRevealedAnswer({ type: "fraction", numerator: 2, denominator: 4 }) ===
    "1/2",
);
check(
  "a number-shaped submission is not compared as a fraction",
  seven.ok && !studentAnswerMatches(seven.answer, fiveEighths),
);
check(
  "unitless expected number still matches 11",
  parseStudentSubmission({ kind: "number", value: "11" }).ok &&
    studentAnswerMatches({ type: "number", value: 11 }, eleven),
);

const cylinder = parseStudentSubmission({
  kind: "choice",
  value: " Cylinder ",
});
const ballWord = parseStudentSubmission({ kind: "choice", value: "ball" });
const expectedCylinder: CorrectAnswer = {
  type: "choice",
  value: "cylinder",
  set: "solid",
};

check(
  "a schema-controlled choice matches after normalisation",
  cylinder.ok && studentAnswerMatches(cylinder.answer, expectedCylinder),
);
check(
  "ball is not accepted as a stand-in for sphere",
  ballWord.ok === false && ballWord.reason === "malformed",
);
check(
  "revealed choice is the exact label",
  formatRevealedAnswer(expectedCylinder) === "cylinder",
);
check(
  "a number is not compared as a geometry choice",
  seven.ok && !studentAnswerMatches(seven.answer, expectedCylinder),
);

if (failed > 0) {
  console.error(`\n${failed} answer checks failed`);
  process.exit(1);
}

console.log("\nall answer checks passed");
