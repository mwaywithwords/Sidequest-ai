/**
 * Decision and schema checks for the math-investigation stage.
 *
 * Run with: npx tsx lib/ai/investigation-path.check.ts
 *
 * These do not call a model. They check that the path resolver and the
 * SkillFitAnalysis contract exhaust object_math, investigation_math, and
 * inspired_math before poor_fit.
 */

import {
  buildAnchors,
  fallbackEvidenceRequest,
  hasNumericCount,
  readingAnchors,
  recoverInvestigation,
  resolveInvestigation,
} from "@/lib/ai/investigation-path";
import { finalizeSkillFit } from "@/lib/ai/skill-fit-finalize";
import {
  type EvidenceRequest,
  type InspirationContext,
  type ObjectAnalysis,
  parseSkillFitAnalysis,
  SkillFitAnalysisSchema,
} from "@/lib/ai/schemas";

const sneakerEvidence: EvidenceRequest = {
  type: "second_photo",
  prompt: "Find the size label inside your sneaker and take a picture of it.",
  targetProperty: "shoe size",
  reason:
    "The shoe size gives us a real number we can use for your subtraction Sidequest.",
};

const basketballInspiration: InspirationContext = {
  topic: "basketball jersey numbers",
  reason:
    "Jersey numbers provide meaningful whole numbers connected to basketball.",
};

const bottleProperty = "printed bottle volume: 11 fl oz";
const eggProperty = "12 visible eggs";
const sphereProperty = "sphere";

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

// --- schema invariant: evidence and inspiration are structural ---------

schemaFails("object_math cannot carry an evidence request", {
  ...base,
  challengeMode: "object_math",
  canGenerateChallenge: true,
  usableProperties: [bottleProperty],
  anchors: [{ property: bottleProperty, origin: "observed" }],
  evidenceRequest: sneakerEvidence,
  inspirationContext: null,
});

schemaFails("investigation_math without a request is invalid", {
  ...base,
  challengeMode: "investigation_math",
  canGenerateChallenge: false,
  usableProperties: [],
  anchors: [{ property: "shoe size", origin: "student_provided" }],
  evidenceRequest: null,
  inspirationContext: null,
});

schemaFails("object_math with no usable properties is invalid", {
  ...base,
  challengeMode: "object_math",
  canGenerateChallenge: true,
  usableProperties: [],
  anchors: [],
  evidenceRequest: null,
  inspirationContext: null,
});

schemaFails("object_math cannot set canGenerateChallenge false", {
  ...base,
  challengeMode: "object_math",
  canGenerateChallenge: false,
  usableProperties: [bottleProperty],
  anchors: [{ property: bottleProperty, origin: "observed" }],
  evidenceRequest: null,
  inspirationContext: null,
});

schemaFails("inspired_math without context is invalid", {
  ...base,
  challengeMode: "inspired_math",
  canGenerateChallenge: false,
  usableProperties: [],
  anchors: [],
  evidenceRequest: null,
  inspirationContext: null,
});

schemaFails("inspired_math cannot set canGenerateChallenge false", {
  ...base,
  selectedSkillCode: "addition",
  challengeMode: "inspired_math",
  canGenerateChallenge: false,
  usableProperties: [],
  anchors: [],
  evidenceRequest: null,
  inspirationContext: basketballInspiration,
});

schemaOk(
  "investigation_math with a request is valid even with no observed property",
  {
    ...base,
    fitScore: 0.35,
    challengeMode: "investigation_math",
    canGenerateChallenge: false,
    usableProperties: [],
    anchors: [{ property: "shoe size", origin: "student_provided" }],
    evidenceRequest: sneakerEvidence,
    inspirationContext: null,
  },
);

schemaOk("object_math with one observed quantity is valid", {
  ...base,
  challengeMode: "object_math",
  canGenerateChallenge: true,
  usableProperties: [bottleProperty],
  anchors: [{ property: bottleProperty, origin: "observed" }],
  evidenceRequest: null,
  inspirationContext: null,
});

schemaOk("object_math with a countable structure is valid", {
  ...base,
  fitScore: 0.85,
  selectedSkillCode: "multiplication",
  challengeMode: "object_math",
  canGenerateChallenge: true,
  usableProperties: [eggProperty],
  anchors: [{ property: eggProperty, origin: "observed" }],
  evidenceRequest: null,
  inspirationContext: null,
});

schemaOk("inspired_math with structured context is valid", {
  ...base,
  selectedSkillCode: "addition",
  challengeMode: "inspired_math",
  canGenerateChallenge: true,
  usableProperties: [],
  anchors: [],
  evidenceRequest: null,
  inspirationContext: basketballInspiration,
});

schemaFails("investigation anchors cannot carry given_in_problem", {
  ...base,
  challengeMode: "object_math",
  canGenerateChallenge: true,
  usableProperties: [bottleProperty],
  anchors: [
    { property: bottleProperty, origin: "observed" },
    { property: "amount poured out", origin: "given_in_problem" },
  ],
  evidenceRequest: null,
  inspirationContext: null,
});

const legacyDirect = parseSkillFitAnalysis({
  ...base,
  challengeMode: "direct",
  canGenerateChallenge: true,
  usableProperties: [bottleProperty],
  anchors: [{ property: bottleProperty, origin: "observed" }],
  evidenceRequest: null,
});

check(
  "legacy direct records normalise to object_math",
  legacyDirect.success && legacyDirect.data.challengeMode === "object_math",
);

const legacyNeedsEvidence = parseSkillFitAnalysis({
  ...base,
  fitScore: 0.35,
  challengeMode: "needs_evidence",
  canGenerateChallenge: false,
  usableProperties: [],
  anchors: [{ property: "shoe size", origin: "student_provided" }],
  evidenceRequest: sneakerEvidence,
});

check(
  "legacy needs_evidence records normalise to investigation_math",
  legacyNeedsEvidence.success &&
    legacyNeedsEvidence.data.challengeMode === "investigation_math",
);

// --- path resolver -----------------------------------------------------

const bottleObjectMath = resolveInvestigation(
  {
    challengeMode: "object_math",
    fitScore: 0.55,
    reason: "One printed volume is visible.",
    evidenceRequest: null,
    inspirationContext: null,
  },
  [bottleProperty],
);

check(
  "bottle + subtraction with an observed volume is object_math",
  bottleObjectMath.challengeMode === "object_math" &&
    bottleObjectMath.evidenceRequest === null,
);

const sneakerNeedsEvidence = resolveInvestigation(
  {
    challengeMode: "investigation_math",
    fitScore: 0.3,
    reason: "No useful number is visible yet.",
    evidenceRequest: sneakerEvidence,
    inspirationContext: null,
  },
  [],
);

check(
  "sneaker + subtraction with no number becomes investigation_math",
  sneakerNeedsEvidence.challengeMode === "investigation_math" &&
    sneakerNeedsEvidence.evidenceRequest?.targetProperty === "shoe size",
);

const sneakerMislabelled = resolveInvestigation(
  {
    challengeMode: "poor_fit",
    fitScore: 0.2,
    reason: "No numbers on the outside.",
    evidenceRequest: sneakerEvidence,
    inspirationContext: null,
  },
  [],
);

check(
  "poor_fit with a valid evidence request is upgraded to investigation_math",
  sneakerMislabelled.challengeMode === "investigation_math",
);

const eggsObjectMath = resolveInvestigation(
  {
    challengeMode: "object_math",
    fitScore: 0.88,
    reason: "Twelve eggs are visible.",
    evidenceRequest: null,
    inspirationContext: null,
  },
  [eggProperty],
);

check(
  "twelve visible eggs stay object_math",
  eggsObjectMath.challengeMode === "object_math",
);

const confidentUngrounded = resolveInvestigation(
  {
    challengeMode: "object_math",
    fitScore: 0.9,
    reason: "This would make a good challenge.",
    evidenceRequest: null,
    inspirationContext: null,
  },
  [],
);

check(
  "a high score with no grounded property cannot be object_math",
  confidentUngrounded.challengeMode === "poor_fit",
);

const confidentUngroundedWithAsk = resolveInvestigation(
  {
    challengeMode: "object_math",
    fitScore: 0.9,
    reason: "This would make a good challenge.",
    evidenceRequest: sneakerEvidence,
    inspirationContext: null,
  },
  [],
);

check(
  "a high score with no grounded property but a request becomes investigation_math",
  confidentUngroundedWithAsk.challengeMode === "investigation_math",
);

const inspiredWallet = resolveInvestigation(
  {
    challengeMode: "inspired_math",
    fitScore: 0.4,
    reason: "A wallet can inspire money maths.",
    evidenceRequest: null,
    inspirationContext: {
      topic: "money and prices",
      reason: "Wallets are used to hold money, which supports addition.",
    },
  },
  [],
);

check(
  "wallet + addition can be inspired_math without a visible amount",
  inspiredWallet.challengeMode === "inspired_math",
);

const poorFitWithInspiration = resolveInvestigation(
  {
    challengeMode: "poor_fit",
    fitScore: 0.1,
    reason: "No printed numbers.",
    evidenceRequest: null,
    inspirationContext: basketballInspiration,
  },
  [],
);

check(
  "poor_fit with inspiration context is upgraded to inspired_math",
  poorFitWithInspiration.challengeMode === "inspired_math",
);

const poorFitWithShape = resolveInvestigation(
  {
    challengeMode: "poor_fit",
    fitScore: 0.1,
    reason: "No printed numbers.",
    evidenceRequest: null,
    inspirationContext: null,
  },
  [sphereProperty],
);

check(
  "poor_fit with a grounded shape is upgraded to object_math",
  poorFitWithShape.challengeMode === "object_math",
);

const truePoorFit = resolveInvestigation(
  {
    challengeMode: "poor_fit",
    fitScore: 0.1,
    reason: "No honest path remains.",
    evidenceRequest: null,
    inspirationContext: null,
  },
  [],
);

check(
  "poor_fit without a request, anchor, or inspiration stays poor_fit",
  truePoorFit.challengeMode === "poor_fit",
);

const blankSky: ObjectAnalysis = {
  objectName: "sky",
  category: "scene",
  confidence: 0.4,
  visibleText: [],
  visibleMeasurements: [],
  countableProperties: [],
  shapeProperties: [],
  observableProperties: [],
};

check(
  "a featureless scene has no fallback investigation",
  fallbackEvidenceRequest(blankSky, "addition") === null,
);

const basketball: ObjectAnalysis = {
  objectName: "basketball",
  category: "sports equipment",
  confidence: 0.93,
  visibleText: [],
  visibleMeasurements: [],
  countableProperties: [],
  shapeProperties: [
    "sphere",
    "circular panels",
    "curved surface",
    "symmetry",
  ],
  observableProperties: ["orange pebbled surface", "black seams"],
};

const recoveredGeometry = recoverInvestigation(
  truePoorFit,
  basketball,
  "geometry",
);

check(
  "basketball + geometry recovers as object_math from visible shape",
  recoveredGeometry.resolved.challengeMode === "object_math" &&
    recoveredGeometry.usableProperties.includes("sphere"),
);

check(
  "readingAnchors for geometry uses shape, not a printed number",
  readingAnchors(basketball, "geometry").includes("sphere"),
);

const sneaker: ObjectAnalysis = {
  objectName: "sneaker",
  category: "footwear",
  confidence: 0.9,
  visibleText: [],
  visibleMeasurements: [],
  countableProperties: [],
  shapeProperties: ["left-right symmetry", "curved sole"],
  observableProperties: ["laces", "tread pattern"],
};

const recoveredMeasurement = recoverInvestigation(
  truePoorFit,
  sneaker,
  "measurement",
);

check(
  "sneaker + measurement recovers as investigation_math when no size is visible",
  recoveredMeasurement.resolved.challengeMode === "investigation_math" &&
    recoveredMeasurement.resolved.evidenceRequest?.type ===
      "student_measurement",
);

const wallet: ObjectAnalysis = {
  objectName: "wallet",
  category: "personal accessory",
  confidence: 0.9,
  visibleText: [],
  visibleMeasurements: [],
  countableProperties: [],
  shapeProperties: ["rectangular form"],
  observableProperties: ["card slots", "billfold"],
};

const recoveredWalletAddition = recoverInvestigation(
  truePoorFit,
  wallet,
  "addition",
);

check(
  "wallet + addition recovers as inspired_math, not poor_fit or a forced count",
  recoveredWalletAddition.resolved.challengeMode === "inspired_math" &&
    recoveredWalletAddition.resolved.inspirationContext !== null,
);

const objectMathWallet = finalizeSkillFit(
  {
    challengeMode: "object_math",
    fitScore: 0.8,
    usableProperties: ["rectangular form"],
    reason: "The wallet looks rectangular.",
    suggestedObjectCharacteristics: [],
    alternativeSkillCodes: [],
    evidenceRequest: null,
    inspirationContext: null,
  },
  wallet,
  "addition",
);

check(
  "numberless wallet + addition is not object_math from a rectangle, investigation, or poor_fit",
  objectMathWallet.status === "ok" &&
    objectMathWallet.fit.challengeMode === "inspired_math",
);

const walletCountSlots: ObjectAnalysis = {
  ...wallet,
  countableProperties: ["card slots"],
};

check(
  "wallet card slots without a number are not an addition object_math anchor",
  readingAnchors(walletCountSlots, "addition").length === 0 &&
    !hasNumericCount("card slots"),
);

const slotsAsObjectMath = finalizeSkillFit(
  {
    challengeMode: "object_math",
    fitScore: 0.8,
    usableProperties: ["card slots"],
    reason: "The wallet has card slots.",
    suggestedObjectCharacteristics: [],
    alternativeSkillCodes: [],
    evidenceRequest: null,
    inspirationContext: null,
  },
  walletCountSlots,
  "addition",
);

check(
  "wallet + addition does not stay object_math from a non-numeric countable",
  slotsAsObjectMath.status === "ok" &&
    slotsAsObjectMath.fit.challengeMode === "inspired_math",
);

const forcedInvestigation = finalizeSkillFit(
  {
    challengeMode: "investigation_math",
    fitScore: 0.4,
    usableProperties: [],
    reason: "No printed amount.",
    suggestedObjectCharacteristics: [],
    alternativeSkillCodes: [],
    evidenceRequest: {
      type: "student_count",
      prompt: "Count the cards in your wallet.",
      targetProperty: "visible count",
      reason: "A count lets us add.",
    },
    inspirationContext: null,
  },
  wallet,
  "addition",
);

check(
  "wallet + addition recovers investigation_math to inspired_math from the money domain",
  forcedInvestigation.status === "ok" &&
    forcedInvestigation.fit.challengeMode === "inspired_math" &&
    forcedInvestigation.fit.inspirationContext !== null,
);

const basketballAdditionFromSphere = finalizeSkillFit(
  {
    challengeMode: "object_math",
    fitScore: 0.8,
    usableProperties: ["sphere"],
    reason: "The ball is a sphere.",
    suggestedObjectCharacteristics: [],
    alternativeSkillCodes: [],
    evidenceRequest: null,
    inspirationContext: null,
  },
  basketball,
  "addition",
);

check(
  "basketball + addition is not object_math from a sphere",
  basketballAdditionFromSphere.status === "ok" &&
    basketballAdditionFromSphere.fit.challengeMode === "inspired_math",
);

const basketballGeometryFromSphere = finalizeSkillFit(
  {
    challengeMode: "object_math",
    fitScore: 0.8,
    usableProperties: ["sphere"],
    reason: "The ball is a sphere.",
    suggestedObjectCharacteristics: [],
    alternativeSkillCodes: [],
    evidenceRequest: null,
    inspirationContext: null,
  },
  basketball,
  "geometry",
);

check(
  "basketball + geometry stays object_math from a sphere",
  basketballGeometryFromSphere.status === "ok" &&
    basketballGeometryFromSphere.fit.challengeMode === "object_math",
);

const cup: ObjectAnalysis = {
  objectName: "cup",
  category: "kitchen tool",
  confidence: 0.9,
  visibleText: [],
  visibleMeasurements: [],
  countableProperties: [],
  shapeProperties: ["cylinder-like body", "circular rim"],
  observableProperties: ["open top"],
};

const recoveredCupMultiply = recoverInvestigation(
  truePoorFit,
  cup,
  "multiplication",
);

check(
  "cup + multiplication recovers as inspired_math without inventing capacity",
  recoveredCupMultiply.resolved.challengeMode === "inspired_math",
);

const recoveredSneakerAddition = recoverInvestigation(
  truePoorFit,
  sneaker,
  "addition",
);

check(
  "sneaker + addition recovers as inspired_math instead of a forced count",
  recoveredSneakerAddition.resolved.challengeMode === "inspired_math",
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
  "investigation_math records the target as student_provided",
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
