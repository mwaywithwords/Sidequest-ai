/**
 * Decision and schema checks for the math-investigation stage.
 *
 * Run with: npx tsx lib/ai/investigation-path.check.ts
 *
 * These do not call a model. They check that the path resolver and the
 * SkillFitAnalysis contract behave the way the product now requires.
 */

import {
  buildAnchors,
  MIN_FIT_SCORE,
  resolveInvestigation,
} from "@/lib/ai/investigation-path";
import {
  type EvidenceRequest,
  SkillFitAnalysisSchema,
} from "@/lib/ai/schemas";

const sneakerEvidence: EvidenceRequest = {
  type: "second_photo",
  prompt: "Find the size label inside your sneaker and take a picture of it.",
  targetProperty: "shoe size",
  reason:
    "The shoe size gives us a real number we can use for your subtraction Sidequest.",
};

const bottleProperty = "printed bottle volume: 11 fl oz";
const eggProperty = "12 visible eggs";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

function schemaOk(name: string, value: unknown) {
  const parsed = SkillFitAnalysisSchema.safeParse(value);
  check(name, parsed.success);
  return parsed;
}

function schemaFails(name: string, value: unknown) {
  check(name, !SkillFitAnalysisSchema.safeParse(value).success);
}

const base = {
  selectedSkillCode: "subtraction" as const,
  fitScore: 0.7,
  reason: "A grounded path exists.",
  suggestedObjectCharacteristics: [] as string[],
  alternativeSkillCodes: [] as string[],
};

// --- schema invariant: evidenceRequest is structural -------------------

schemaFails("direct cannot carry an evidence request", {
  ...base,
  challengeMode: "direct",
  canGenerateChallenge: true,
  usableProperties: [bottleProperty],
  anchors: [{ property: bottleProperty, origin: "observed" }],
  evidenceRequest: sneakerEvidence,
});

schemaFails("needs_evidence without a request is invalid", {
  ...base,
  challengeMode: "needs_evidence",
  canGenerateChallenge: false,
  usableProperties: [],
  anchors: [{ property: "shoe size", origin: "student_provided" }],
  evidenceRequest: null,
});

schemaFails("direct with no usable properties is invalid", {
  ...base,
  challengeMode: "direct",
  canGenerateChallenge: true,
  usableProperties: [],
  anchors: [],
  evidenceRequest: null,
});

schemaFails("grounded_scenario cannot set canGenerateChallenge false", {
  ...base,
  challengeMode: "grounded_scenario",
  canGenerateChallenge: false,
  usableProperties: [bottleProperty],
  anchors: [{ property: bottleProperty, origin: "observed" }],
  evidenceRequest: null,
});

schemaOk("needs_evidence with a request is valid even with no observed property", {
  ...base,
  fitScore: 0.35,
  challengeMode: "needs_evidence",
  canGenerateChallenge: false,
  usableProperties: [],
  anchors: [{ property: "shoe size", origin: "student_provided" }],
  evidenceRequest: sneakerEvidence,
});

schemaOk("grounded_scenario with one observed quantity is valid", {
  ...base,
  challengeMode: "grounded_scenario",
  canGenerateChallenge: true,
  usableProperties: [bottleProperty],
  anchors: [{ property: bottleProperty, origin: "observed" }],
  evidenceRequest: null,
});

schemaOk("direct with a countable structure is valid", {
  ...base,
  fitScore: 0.85,
  selectedSkillCode: "multiplication",
  challengeMode: "direct",
  canGenerateChallenge: true,
  usableProperties: [eggProperty],
  anchors: [{ property: eggProperty, origin: "observed" }],
  evidenceRequest: null,
});

schemaFails("investigation anchors cannot carry given_in_problem", {
  ...base,
  challengeMode: "grounded_scenario",
  canGenerateChallenge: true,
  usableProperties: [bottleProperty],
  anchors: [
    { property: bottleProperty, origin: "observed" },
    { property: "amount poured out", origin: "given_in_problem" },
  ],
  evidenceRequest: null,
});

// --- path resolver -----------------------------------------------------

check("MIN_FIT_SCORE is still 0.6", MIN_FIT_SCORE === 0.6);

const bottleDirectBelowThreshold = resolveInvestigation(
  {
    challengeMode: "direct",
    fitScore: 0.55,
    reason: "One printed volume is visible.",
    evidenceRequest: null,
  },
  [bottleProperty],
);

check(
  "bottle + subtraction below the direct bar becomes grounded_scenario",
  bottleDirectBelowThreshold.challengeMode === "grounded_scenario" &&
    bottleDirectBelowThreshold.evidenceRequest === null,
);

const bottleGrounded = resolveInvestigation(
  {
    challengeMode: "grounded_scenario",
    fitScore: 0.72,
    reason: "Printed volume can anchor a remaining-amount problem.",
    evidenceRequest: null,
  },
  [bottleProperty],
);

check(
  "bottle + subtraction with an observed volume stays grounded_scenario",
  bottleGrounded.challengeMode === "grounded_scenario",
);

const sneakerNeedsEvidence = resolveInvestigation(
  {
    challengeMode: "needs_evidence",
    fitScore: 0.3,
    reason: "No useful number is visible yet.",
    evidenceRequest: sneakerEvidence,
  },
  [],
);

check(
  "sneaker + subtraction with no number becomes needs_evidence",
  sneakerNeedsEvidence.challengeMode === "needs_evidence" &&
    sneakerNeedsEvidence.evidenceRequest?.targetProperty === "shoe size",
);

const sneakerMislabelled = resolveInvestigation(
  {
    challengeMode: "poor_fit",
    fitScore: 0.2,
    reason: "No numbers on the outside.",
    evidenceRequest: sneakerEvidence,
  },
  [],
);

check(
  "poor_fit with a valid evidence request is upgraded to needs_evidence",
  sneakerMislabelled.challengeMode === "needs_evidence",
);

const eggsDirect = resolveInvestigation(
  {
    challengeMode: "direct",
    fitScore: 0.88,
    reason: "Twelve eggs are visible.",
    evidenceRequest: null,
  },
  [eggProperty],
);

check(
  "twelve visible eggs at a high score stay direct",
  eggsDirect.challengeMode === "direct",
);

const confidentUngrounded = resolveInvestigation(
  {
    challengeMode: "direct",
    fitScore: 0.9,
    reason: "This would make a good challenge.",
    evidenceRequest: null,
  },
  [],
);

check(
  "a high score with no grounded property cannot be direct",
  confidentUngrounded.challengeMode === "poor_fit",
);

const confidentUngroundedWithAsk = resolveInvestigation(
  {
    challengeMode: "direct",
    fitScore: 0.9,
    reason: "This would make a good challenge.",
    evidenceRequest: sneakerEvidence,
  },
  [],
);

check(
  "a high score with no grounded property but a request becomes needs_evidence",
  confidentUngroundedWithAsk.challengeMode === "needs_evidence",
);

const truePoorFit = resolveInvestigation(
  {
    challengeMode: "poor_fit",
    fitScore: 0.1,
    reason: "No honest path remains.",
    evidenceRequest: null,
  },
  [],
);

check(
  "poor_fit without a request or an anchor stays poor_fit",
  truePoorFit.challengeMode === "poor_fit",
);

// --- investigation anchors are only observed or student_provided -------

const readyAnchors = buildAnchors([bottleProperty], null);
check(
  "ready paths only record observed anchors",
  readyAnchors.length === 1 &&
    readyAnchors[0]?.origin === "observed" &&
    readyAnchors[0]?.property === bottleProperty,
);

const clueAnchors = buildAnchors([], sneakerEvidence);
check(
  "needs_evidence records the target as student_provided",
  clueAnchors.length === 1 &&
    clueAnchors[0]?.origin === "student_provided" &&
    clueAnchors[0]?.property === "shoe size",
);

check(
  "buildAnchors only emits observed or student_provided",
  [...readyAnchors, ...clueAnchors].every(
    (anchor) =>
      anchor.origin === "observed" || anchor.origin === "student_provided",
  ),
);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log("\nall investigation checks passed");
