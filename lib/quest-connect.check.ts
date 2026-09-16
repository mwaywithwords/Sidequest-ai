/**
 * Connect presentation helpers: sentence, skill marks, reveal timing.
 *
 * Run with: npx tsx lib/quest-connect.check.ts
 */

import { readFileSync } from "node:fs";
import { copy } from "@/lib/copy";
import {
  CONNECT_REVEAL_MS,
  connectObservationKind,
  connectSentence,
  connectSkillDisplay,
  connectSkillMark,
  friendlyConnectValue,
  indefiniteArticle,
  presentationSafeShape,
} from "@/lib/quest-connect";
import { SKILLS } from "@/lib/skills";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

check(
  "heading becomes WE FOUND THE MATH!",
  copy.quest.experience.connectEyebrow === "We found the math!",
);

check("from-your-photo label is a short stage line", copy.quest.experience.connectFromPhoto === "From your photo");
check("practice label is a short stage line", copy.quest.experience.connectPractice === "We can practice");

check("addition uses +", connectSkillMark("addition") === "+" && connectSkillDisplay("+", "Addition") === "+ Addition");
check("subtraction uses −", connectSkillMark("subtraction") === "−");
check("multiplication uses ×", connectSkillMark("multiplication") === "×");
check("division uses ÷", connectSkillMark("division") === "÷");
check("fractions uses ½", connectSkillMark("fractions") === "½");
check("measurement uses the catalogue mark", connectSkillMark("measurement") === "⇥");
check("geometry uses △", connectSkillMark("geometry") === "△");
check(
  "every catalogue skill has a symbol",
  SKILLS.every((skill) => connectSkillMark(skill.id) === skill.symbol && skill.symbol.length > 0),
);

check("addition takes an", indefiniteArticle("addition") === "an");
check("geometry takes a", indefiniteArticle("geometry") === "a");
check("friendly value lowercases the unit", friendlyConnectValue("311 G") === "311 g");
check("friendly value keeps a multi-word unit", friendlyConnectValue("12 FL OZ") === "12 fl oz");

check(
  "measurement sentence uses the grounded value",
  connectSentence({
    kind: "measurement",
    observation: "311 G",
    skillLabel: "Addition",
  }) === "We can use 311 g in an addition challenge!",
);

check(
  "ounces sentence stays one short line",
  connectSentence({
    kind: "measurement",
    observation: "12 FL OZ",
    skillLabel: "Multiplication",
  }) === "We can use 12 fl oz in a multiplication challenge!",
);

check(
  "shape sentence names the grounded form",
  connectSentence({
    kind: "shape",
    observation: "rectangle",
    skillLabel: "Geometry",
  }) === "We found a rectangle for a geometry challenge!",
);

check(
  "count sentence uses the grounded number",
  connectSentence({
    kind: "count",
    observation: "6",
    skillLabel: "Multiplication",
  }) === "We found 6 for a multiplication challenge!",
);

check(
  "object fallback does not invent a measurement",
  connectSentence({
    kind: "object",
    observation: "Wallet",
    skillLabel: "Addition",
  }) === "We can practice addition!",
);

check(
  "empty skill omits the sentence rather than inventing copy",
  connectSentence({
    kind: "measurement",
    observation: "311 G",
    skillLabel: "",
  }) === null,
);

check(
  "empty measurement omits the sentence",
  connectSentence({
    kind: "measurement",
    observation: "   ",
    skillLabel: "Addition",
  }) === null,
);

check(
  "a printed unit is a measurement, not a count",
  connectObservationKind({
    worldContext: false,
    numericDisplay: "311 G",
    numericLabel: "Printed candle weight",
    shapeName: null,
  }) === "measurement",
);

check(
  "a unitless faces label is a count",
  connectObservationKind({
    worldContext: false,
    numericDisplay: "6",
    numericLabel: "faces",
    shapeName: "rectangle",
  }) === "count",
);

check(
  "inspired_math stays an object kind even with leftover numbers",
  connectObservationKind({
    worldContext: true,
    numericDisplay: "12 FL OZ",
    numericLabel: "Volume",
    shapeName: null,
  }) === "object",
);

check(
  "shape_identify does not expose the answer as a Connect shape",
  presentationSafeShape(
    { type: "shape_identify", aspect: "plane", label: "rectangle" },
    { type: "choice", value: "rectangle", set: "plane" },
  ) === null,
);

check(
  "shape_count may show the grounded form",
  presentationSafeShape(
    { type: "shape_count", shape: "rectangle", feature: "faces" },
    { type: "number", value: 6 },
  ) === "rectangle",
);

const connectSource = readFileSync(new URL("./quest-connect.ts", import.meta.url), "utf8");
check(
  "no AI call is introduced for Connect copy",
  !connectSource.includes("openai") &&
    !connectSource.includes("generateChallenge") &&
    !connectSource.includes("fetch(") &&
    connectSource.includes("import type { Computation, CorrectAnswer }"),
);

check("reveal observation delay is 100ms", CONNECT_REVEAL_MS.observation === 100);
check("reveal arrow delay is 300ms", CONNECT_REVEAL_MS.arrow === 300);
check("reveal skill delay is 450ms", CONNECT_REVEAL_MS.skill === 450);
check("reveal sentence delay is 600ms", CONNECT_REVEAL_MS.sentence === 600);
check(
  "total reveal stays inside 500–700ms",
  CONNECT_REVEAL_MS.sentence >= 500 && CONNECT_REVEAL_MS.sentence <= 700,
);

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
check(
  "CSS observation delay matches the timing constant",
  css.includes("connect-enter 0.28s 0.1s"),
);
check("CSS arrow delay matches the timing constant", css.includes("connect-arrow 0.28s 0.3s"));
check("CSS skill delay matches the timing constant", css.includes("connect-pop 0.32s 0.45s"));
check("CSS sentence delay matches the timing constant", css.includes("connect-fade 0.24s 0.6s"));
check(
  "reduced-motion disables Connect reveal movement",
  css.includes(".connect-reveal-observation") &&
    css.includes(".connect-reveal-skill") &&
    /prefers-reduced-motion: reduce[\s\S]*\.connect-reveal-observation[\s\S]*animation: none !important/.test(
      css,
    ),
);

const photo = readFileSync(
  new URL("../components/quest/quest-photo.tsx", import.meta.url),
  "utf8",
);
check(
  "Discover hero photo size is unchanged",
  photo.includes('hero: "min-h-[16rem] max-h-[min(22rem,52dvh)] sm:min-h-[20rem] sm:max-h-[26rem]"'),
);
check(
  "Connect uses a smaller bridge photo size",
  photo.includes("bridge:") && photo.includes("w-[min(12rem,56vw)]"),
);

if (failed > 0) {
  console.error(`\n${failed} quest-connect checks failed`);
  process.exit(1);
}

console.log("\nall quest-connect checks passed");
