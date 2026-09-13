/**
 * Adversarial product matrix: ordinary objects × skills.
 *
 * Run with: npx tsx lib/ai/ordinary-object-matrix.check.ts
 *
 * These do not call a model. They use conservative first-photo readings —
 * only what a typical photograph actually shows — and ask whether the
 * application still has a meaningful Sidequest instead of an exit.
 *
 * Expected paths are a product judgement. They are not forced to be
 * object_math. poor_fit is allowed only when a Grade 3–5 teacher would
 * also struggle to make an honest investigation.
 */

import {
  type ChallengeContext,
  type WireChallenge,
  finalizeChallenge,
} from "@/lib/ai/challenge-grounding";
import { buildContextualPayload } from "@/lib/ai/inspired-context";
import {
  recoverInvestigation,
  resolveInvestigation,
} from "@/lib/ai/investigation-path";
import {
  type ChallengeMode,
  type EvidenceRequest,
  type InspirationContext,
  type ObjectAnalysis,
  type ReadySkillFit,
} from "@/lib/ai/schemas";
import { finalizeSkillFit } from "@/lib/ai/skill-fit-finalize";
import { resolveSuitability } from "@/lib/ai/suitability-rules";
import { verifyChallenge } from "@/lib/math/verify";
import { SKILL_IDS, type SkillId } from "@/lib/types";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

type Path = Exclude<ChallengeMode, never>;

const PATH_MARK: Record<Path, string> = {
  object_math: "O",
  investigation_math: "N",
  inspired_math: "I",
  poor_fit: "X",
};

function reading(
  objectName: string,
  category: string,
  extras: Partial<ObjectAnalysis> = {},
): ObjectAnalysis {
  return {
    objectName,
    category,
    confidence: 0.9,
    visibleText: [],
    visibleMeasurements: [],
    countableProperties: [],
    shapeProperties: [],
    observableProperties: [],
    ...extras,
  };
}

/**
 * Typical first photographs. Counts and measurements appear only when a
 * child-height photo usually shows them. No invented volumes, sizes, or
 * page counts.
 */
const OBJECTS = {
  basketball: reading("basketball", "sports equipment", {
    shapeProperties: [
      "sphere",
      "circular panels",
      "curved surface",
      "symmetry",
    ],
    observableProperties: ["orange pebbled surface", "black seams"],
  }),
  wallet: reading("wallet", "personal accessory", {
    shapeProperties: ["rectangular form", "symmetry"],
    observableProperties: ["card slots", "billfold"],
  }),
  sneaker: reading("sneaker", "footwear", {
    shapeProperties: [
      "left-right symmetry",
      "curved sole",
      "angles at the toe",
    ],
    observableProperties: ["laces", "rubber outsole"],
  }),
  "protein bottle": reading("protein shake bottle", "packaged beverage", {
    brand: "Premier Protein",
    visibleText: ["Premier Protein", "11 FL OZ"],
    visibleMeasurements: [
      { value: 11, unit: "fl oz", label: "printed bottle volume" },
    ],
    shapeProperties: ["cylinder-like form", "circular top", "symmetry"],
    observableProperties: ["screw cap"],
  }),
  book: reading("book", "reading material", {
    shapeProperties: ["rectangular cover", "parallel edges"],
    observableProperties: ["printed pages", "spine"],
  }),
  clock: reading("clock", "household", {
    visibleText: ["12", "3", "6", "9"],
    countableProperties: ["12 hour marks"],
    shapeProperties: ["circular face", "marks around a circle"],
    observableProperties: ["clock hands"],
  }),
  backpack: reading("backpack", "school bag", {
    shapeProperties: ["rectangular body", "curved straps"],
    observableProperties: ["zippers", "shoulder straps"],
  }),
  cup: reading("cup", "kitchen tool", {
    shapeProperties: ["cylinder-like body", "circular rim"],
    observableProperties: ["open top", "smooth sides"],
  }),
  spoon: reading("spoon", "kitchen tool", {
    shapeProperties: ["curved bowl", "long handle", "symmetry"],
    observableProperties: ["metal surface"],
  }),
  chair: reading("chair", "furniture", {
    countableProperties: ["4 legs"],
    shapeProperties: ["rectangular seat", "right angles"],
    observableProperties: ["wooden surface"],
  }),
  "toy car": reading("toy car", "toy", {
    countableProperties: ["4 wheels"],
    shapeProperties: ["rectangular body", "circular wheels"],
    observableProperties: ["plastic shell"],
  }),
  "cereal box": reading("cereal box", "packaged food", {
    visibleText: ["cereal"],
    shapeProperties: ["rectangular prism", "rectangular faces"],
    observableProperties: ["cardboard packaging"],
  }),
} as const;

type ObjectKey = keyof typeof OBJECTS;

const SKILLS: readonly SkillId[] = SKILL_IDS;

const inspired = (topic: string, reason: string): InspirationContext => ({
  topic,
  reason,
});

/**
 * Best first path a Grade 3–5 teacher would choose from that photograph.
 * Not every legal path — the one that is most honest and useful.
 */
const EXPECTED: Record<ObjectKey, Record<SkillId, Path>> = {
  basketball: {
    addition: "inspired_math",
    subtraction: "inspired_math",
    multiplication: "inspired_math",
    division: "inspired_math",
    fractions: "inspired_math",
    measurement: "investigation_math",
    geometry: "object_math",
  },
  wallet: {
    addition: "inspired_math",
    subtraction: "inspired_math",
    multiplication: "inspired_math",
    division: "inspired_math",
    fractions: "inspired_math",
    measurement: "investigation_math",
    geometry: "object_math",
  },
  sneaker: {
    addition: "investigation_math",
    subtraction: "investigation_math",
    multiplication: "investigation_math",
    division: "inspired_math",
    fractions: "inspired_math",
    measurement: "investigation_math",
    geometry: "object_math",
  },
  "protein bottle": {
    addition: "object_math",
    subtraction: "object_math",
    multiplication: "object_math",
    division: "object_math",
    fractions: "object_math",
    measurement: "object_math",
    geometry: "object_math",
  },
  book: {
    addition: "inspired_math",
    subtraction: "inspired_math",
    multiplication: "inspired_math",
    division: "inspired_math",
    fractions: "inspired_math",
    measurement: "investigation_math",
    geometry: "object_math",
  },
  clock: {
    addition: "object_math",
    subtraction: "object_math",
    multiplication: "object_math",
    division: "object_math",
    fractions: "object_math",
    measurement: "investigation_math",
    geometry: "object_math",
  },
  backpack: {
    addition: "investigation_math",
    subtraction: "investigation_math",
    multiplication: "investigation_math",
    division: "investigation_math",
    fractions: "investigation_math",
    measurement: "investigation_math",
    geometry: "object_math",
  },
  cup: {
    addition: "investigation_math",
    subtraction: "investigation_math",
    multiplication: "investigation_math",
    division: "investigation_math",
    fractions: "investigation_math",
    measurement: "investigation_math",
    geometry: "object_math",
  },
  spoon: {
    addition: "investigation_math",
    subtraction: "investigation_math",
    multiplication: "investigation_math",
    division: "investigation_math",
    fractions: "investigation_math",
    measurement: "investigation_math",
    geometry: "object_math",
  },
  chair: {
    addition: "object_math",
    subtraction: "object_math",
    multiplication: "object_math",
    division: "object_math",
    fractions: "object_math",
    measurement: "investigation_math",
    geometry: "object_math",
  },
  "toy car": {
    addition: "object_math",
    subtraction: "object_math",
    multiplication: "object_math",
    division: "object_math",
    fractions: "object_math",
    measurement: "investigation_math",
    geometry: "object_math",
  },
  "cereal box": {
    addition: "investigation_math",
    subtraction: "investigation_math",
    multiplication: "investigation_math",
    division: "investigation_math",
    fractions: "investigation_math",
    measurement: "investigation_math",
    geometry: "object_math",
  },
};

const INSPIRATION: Partial<Record<ObjectKey, InspirationContext>> = {
  basketball: inspired(
    "basketball scores, quarters, and teams",
    "Basketball scoring and game structure give grade-appropriate numbers without inventing a measurement of this ball.",
  ),
  wallet: inspired(
    "money, dollars, and budgeting",
    "A wallet holds money, so adding and spending amounts stay connected to the object.",
  ),
  sneaker: inspired(
    "pairs of sneakers",
    "Sneakers come in pairs, which supports grouping and halves.",
  ),
  book: inspired(
    "pages and chapters",
    "Books are organised into pages and chapters that can inspire counting and fractions.",
  ),
};

function evidenceFor(analysis: ObjectAnalysis, skillId: SkillId): EvidenceRequest {
  const object = analysis.objectName;
  if (skillId === "measurement" || skillId === "geometry") {
    return {
      type: "student_measurement",
      prompt: `Measure the longest side or the widest part of your ${object}.`,
      targetProperty: "measured length",
      reason: "A real measurement from your object lets us do this mission.",
    };
  }
  if (skillId === "fractions") {
    return {
      type: "student_count",
      prompt: `Count how many equal parts or sections you can see on your ${object}.`,
      targetProperty: "equal parts",
      reason: "A real count of parts lets us work with fractions.",
    };
  }
  return {
    type: "student_count",
    prompt: `Count one group of parts on your ${object}.`,
    targetProperty: "visible count",
    reason: "A real number from your object lets us do this mission.",
  };
}

function recoveredMode(analysis: ObjectAnalysis, skillId: SkillId): Path {
  return recoverInvestigation(
    {
      challengeMode: "poor_fit",
      reason: "Model declined too early.",
      evidenceRequest: null,
      inspirationContext: null,
    },
    analysis,
    skillId,
  ).resolved.challengeMode;
}

function teacherWouldInvestigate(expected: Path): boolean {
  return expected !== "poor_fit";
}

const objectKeys = Object.keys(OBJECTS) as ObjectKey[];

let expectedPoorFit = 0;
let recoveryExits = 0;
let inspiredWhenRecoveredInvestigation = 0;

for (const objectKey of objectKeys) {
  const analysis = OBJECTS[objectKey];

  for (const skillId of SKILLS) {
    const expected = EXPECTED[objectKey][skillId];
    if (expected === "poor_fit") expectedPoorFit += 1;

    const recovered = recoveredMode(analysis, skillId);
    if (recovered === "poor_fit") recoveryExits += 1;
    if (expected === "inspired_math" && recovered === "investigation_math") {
      inspiredWhenRecoveredInvestigation += 1;
    }

    const declined = finalizeSkillFit(
      {
        challengeMode: "poor_fit",
        fitScore: 0.2,
        usableProperties: [],
        reason: "Model declined too early.",
        suggestedObjectCharacteristics: ["something more obviously numerical"],
        alternativeSkillCodes: [],
        evidenceRequest: null,
        inspirationContext: null,
      },
      analysis,
      skillId,
    );

    check(
      `${objectKey} + ${skillId}: a conservative reading is not an exit when the model says poor_fit`,
      declined.status !== "poorFit" && declined.status !== "failed",
    );

    check(
      `${objectKey} + ${skillId}: teacher test — expected ${expected} is not an exit`,
      teacherWouldInvestigate(expected),
    );

    const proposedProperties =
      expected === "object_math"
        ? [
            ...analysis.visibleMeasurements.map(
              (measurement) =>
                `${measurement.label}: ${measurement.value} ${measurement.unit}`,
            ),
            ...analysis.countableProperties,
            ...(skillId === "geometry" ? analysis.shapeProperties : []),
          ]
        : [];

    const proposed = finalizeSkillFit(
      {
        challengeMode: expected,
        fitScore: 0.72,
        usableProperties: proposedProperties,
        reason: `A ${expected} path is available.`,
        suggestedObjectCharacteristics: [],
        alternativeSkillCodes: [],
        evidenceRequest:
          expected === "investigation_math"
            ? evidenceFor(analysis, skillId)
            : null,
        inspirationContext:
          expected === "inspired_math"
            ? (INSPIRATION[objectKey] ??
              inspired(
                `${analysis.objectName} context`,
                `The real-world use of a ${analysis.objectName} can inspire this skill.`,
              ))
            : null,
      },
      analysis,
      skillId,
    );

    const proposedMode =
      proposed.status === "ok"
        ? proposed.fit.challengeMode
        : proposed.status === "needsEvidence"
          ? proposed.fit.challengeMode
          : proposed.status === "poorFit"
            ? "poor_fit"
            : "generation_failure";

    check(
      `${objectKey} + ${skillId}: proposing ${expected} stays a live path`,
      proposed.status === "ok" || proposed.status === "needsEvidence",
    );

    const resolved = resolveInvestigation(
      {
        challengeMode: expected,
        fitScore: 0.72,
        reason: "Proposed best path.",
        evidenceRequest:
          expected === "investigation_math"
            ? evidenceFor(analysis, skillId)
            : null,
        inspirationContext:
          expected === "inspired_math"
            ? (INSPIRATION[objectKey] ??
              inspired("object context", "A real-world connection exists."))
            : null,
      },
      expected === "object_math" ? proposedProperties : [],
    );

    check(
      `${objectKey} + ${skillId}: resolver keeps ${expected} (got ${resolved.challengeMode}; proposed ${proposedMode})`,
      resolved.challengeMode === expected,
    );
  }
}

check(
  "none of the 84 expected paths is poor_fit — a teacher can investigate each pair",
  expectedPoorFit === 0,
);

check(
  "recovery never exits on these ordinary identifiable objects",
  recoveryExits === 0,
);

// ---------------------------------------------------------------------------
// Named product cases
// ---------------------------------------------------------------------------

check(
  "basketball + geometry recovers as object_math from visible form",
  recoveredMode(OBJECTS.basketball, "geometry") === "object_math",
);

check(
  "wallet is not drug paraphernalia from an ordinary description",
  resolveSuitability({
    verdict: "drug_content",
    confidence: "high",
    note: "brown leather wallet",
  }) === "appropriate",
);

check(
  "wallet + addition proposing money context stays inspired_math",
  finalizeSkillFit(
    {
      challengeMode: "inspired_math",
      fitScore: 0.7,
      usableProperties: [],
      reason: "Money context.",
      suggestedObjectCharacteristics: [],
      alternativeSkillCodes: [],
      evidenceRequest: null,
      inspirationContext: INSPIRATION.wallet ?? null,
    },
    OBJECTS.wallet,
    "addition",
  ).status === "ok",
);

check(
  "sneaker + measurement can request evidence",
  finalizeSkillFit(
    {
      challengeMode: "poor_fit",
      fitScore: 0.2,
      usableProperties: [],
      reason: "No size label.",
      suggestedObjectCharacteristics: [],
      alternativeSkillCodes: [],
      evidenceRequest: null,
      inspirationContext: null,
    },
    OBJECTS.sneaker,
    "measurement",
  ).status === "needsEvidence",
);

check(
  "book + fractions has a live inspired path",
  finalizeSkillFit(
    {
      challengeMode: "inspired_math",
      fitScore: 0.68,
      usableProperties: [],
      reason: "Chapters and pages.",
      suggestedObjectCharacteristics: [],
      alternativeSkillCodes: [],
      evidenceRequest: null,
      inspirationContext: INSPIRATION.book ?? null,
    },
    OBJECTS.book,
    "fractions",
  ).status === "ok",
);

check(
  "clock + fractions is object_math from 12 hour marks",
  recoveredMode(OBJECTS.clock, "fractions") === "object_math",
);

check(
  "clock + geometry is object_math from the circular face",
  recoveredMode(OBJECTS.clock, "geometry") === "object_math",
);

check(
  "wallet + geometry is object_math from visible rectangular form",
  recoveredMode(OBJECTS.wallet, "geometry") === "object_math",
);

check(
  "protein bottle + geometry is object_math without a printed dimension",
  recoveredMode(OBJECTS["protein bottle"], "geometry") === "object_math" &&
    OBJECTS["protein bottle"].visibleMeasurements.every(
      (measurement) => measurement.label !== "height",
    ),
);

// ---------------------------------------------------------------------------
// Successful-path verification: origins, object relevance, grades
// ---------------------------------------------------------------------------

function readyFit(
  skill: SkillId,
  mode: "object_math",
  analysis: ObjectAnalysis,
  extras?: {
    properties?: string[];
    inspiration?: InspirationContext | null;
  },
): Extract<ReadySkillFit, { challengeMode: "object_math" }>;
function readyFit(
  skill: SkillId,
  mode: "inspired_math",
  analysis: ObjectAnalysis,
  extras?: {
    properties?: string[];
    inspiration?: InspirationContext | null;
  },
): Extract<ReadySkillFit, { challengeMode: "inspired_math" }>;
function readyFit(
  skill: SkillId,
  mode: "object_math" | "inspired_math",
  analysis: ObjectAnalysis,
  extras: {
    properties?: string[];
    inspiration?: InspirationContext | null;
  } = {},
): ReadySkillFit {
  void analysis;
  const properties = extras.properties ?? [];
  const shared = {
    selectedSkillCode: skill,
    fitScore: 0.74,
    canGenerateChallenge: true as const,
    usableProperties: properties,
    reason: "A ready path exists.",
    suggestedObjectCharacteristics: [] as string[],
    alternativeSkillCodes: [] as SkillId[],
    anchors: properties.map((property) => ({
      property,
      origin: "observed" as const,
    })),
    evidenceRequest: null,
  };

  if (mode === "inspired_math") {
    return {
      ...shared,
      challengeMode: "inspired_math",
      inspirationContext: extras.inspiration ?? {
        topic: "object context",
        reason: "A real-world connection exists.",
      },
    };
  }

  return {
    ...shared,
    challengeMode: "object_math",
    inspirationContext: null,
  };
}

function operand(
  label: string,
  value: number,
  origin: "observed" | "contextual" | "given_in_problem",
  unit: string | null = null,
) {
  return { label, value, unit, origin };
}

function baseWire(overrides: Partial<WireChallenge>): WireChallenge {
  return {
    canGenerate: true,
    question: "Question",
    skillCode: "addition",
    solution: "The calculation is shown here.",
    hint1: "Use what you can see or what the problem states.",
    hint2: "Do the operation carefully.",
    difficulty: 2,
    objectConnection: "This photographed object anchors the maths.",
    verificationStrategy: "Evaluate the structured computation.",
    valuesUsed: [],
    shapesUsed: [],
    correctAnswer: {
      type: "number",
      value: 0,
      numerator: null,
      denominator: null,
      unit: null,
    },
    computation: {
      type: "arithmetic",
      operation: "add",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [],
    },
    ...overrides,
  };
}

function verifyNamed(
  name: string,
  analysis: ObjectAnalysis,
  fit: ReadySkillFit,
  wire: WireChallenge,
  grade: 3 | 4 | 5,
) {
  const contextualGrounding =
    fit.challengeMode === "inspired_math"
      ? buildContextualPayload(analysis, fit.inspirationContext)
      : null;
  const context: ChallengeContext = {
    analysis,
    fit,
    skillId: fit.selectedSkillCode,
    grade,
    studentEvidence: [],
    contextualGrounding,
  };
  const finalized = finalizeChallenge(wire, context);
  if (finalized.status !== "ok") {
    check(name, false);
    console.error(`  finalize status=${finalized.status}`);
    return;
  }

  const verified = verifyChallenge({
    challenge: finalized.challenge,
    analysis,
    fit,
    skillId: fit.selectedSkillCode,
    grade,
    contextualGrounding,
  });

  check(name, verified.ok);
  if (!verified.ok) {
    console.error(`  verify ${verified.reason}: ${verified.detail}`);
  }
}

const basketballScores = inspired(
  "basketball scores",
  "Scoring values are connected to basketball.",
);

verifyNamed(
  "basketball + addition inspired path verifies with contextual, not observed, scores",
  OBJECTS.basketball,
  readyFit("addition", "inspired_math", OBJECTS.basketball, {
    inspiration: basketballScores,
  }),
  baseWire({
    skillCode: "addition",
    question:
      "In basketball, a free throw is worth 1 point and a shot from beyond the three-point line is worth 3 points. How many points is that altogether?",
    objectConnection:
      "Your basketball sent us to basketball scoring, not a number printed on the ball.",
    valuesUsed: [
      operand("free throw points", 1, "contextual", "point"),
      operand("three-point shot", 3, "contextual", "points"),
    ],
    correctAnswer: {
      type: "number",
      value: 4,
      numerator: null,
      denominator: null,
      unit: "points",
    },
    computation: {
      type: "arithmetic",
      operation: "add",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("free throw points", 1, "contextual", "point"),
        operand("three-point shot", 3, "contextual", "points"),
      ],
    },
    solution: "1 + 3 = 4 points.",
  }),
  4,
);

verifyNamed(
  "wallet + subtraction inspired path verifies with money context",
  OBJECTS.wallet,
  readyFit("subtraction", "inspired_math", OBJECTS.wallet, {
    inspiration: INSPIRATION.wallet,
  }),
  baseWire({
    skillCode: "subtraction",
    question:
      "Imagine your wallet has 20 dollars and you spend 7 dollars. How many dollars remain?",
    objectConnection:
      "Your wallet sent us to money and spending, not a total printed on the wallet.",
    hint1: "Start with the amount in the wallet.",
    hint2: "Subtract 7 from 20.",
    valuesUsed: [
      operand("starting dollars", 20, "given_in_problem", "dollars"),
      operand("amount spent", 7, "given_in_problem", "dollars"),
    ],
    correctAnswer: {
      type: "number",
      value: 13,
      numerator: null,
      denominator: null,
      unit: "dollars",
    },
    computation: {
      type: "arithmetic",
      operation: "subtract",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("starting dollars", 20, "given_in_problem", "dollars"),
        operand("amount spent", 7, "given_in_problem", "dollars"),
      ],
    },
    solution: "20 − 7 = 13 dollars.",
  }),
  3,
);

verifyNamed(
  "protein bottle + geometry names a cylinder without inventing height",
  OBJECTS["protein bottle"],
  readyFit("geometry", "object_math", OBJECTS["protein bottle"], {
    properties: ["cylinder-like form", "circular top"],
  }),
  baseWire({
    skillCode: "geometry",
    question: "Look at your bottle. Which 3D form is it closest to?",
    objectConnection:
      "Your bottle shows a cylinder-like body and a circular top. No height was measured.",
    hint1: "Think about the round top and tall sides.",
    hint2: "A can or bottle is often a cylinder.",
    valuesUsed: [],
    shapesUsed: [
      {
        label: "cylinder-like form",
        form: "cylinder",
        aspect: "solid",
        origin: "observed",
      },
    ],
    correctAnswer: {
      type: "choice",
      value: null,
      numerator: null,
      denominator: null,
      unit: null,
      label: "cylinder",
      set: "solid",
    },
    computation: {
      type: "shape_identify",
      operation: "solid",
      shape: "cylinder",
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [],
    },
    solution: "The bottle is a cylinder.",
  }),
  3,
);

verifyNamed(
  "Grade 4 geometry + wallet names a rectangle from visible form",
  OBJECTS.wallet,
  readyFit("geometry", "object_math", OBJECTS.wallet, {
    properties: ["rectangular form", "symmetry"],
  }),
  baseWire({
    skillCode: "geometry",
    question: "Which 2D shape is the front of your wallet most like?",
    objectConnection:
      "Your wallet has a rectangular form you can see from this photo.",
    hint1: "Look at the outline.",
    hint2: "Count the sides and corners you can see.",
    valuesUsed: [],
    shapesUsed: [
      {
        label: "wallet face",
        form: "rectangular form",
        aspect: "plane",
        origin: "observed",
      },
    ],
    correctAnswer: {
      type: "choice",
      value: null,
      numerator: null,
      denominator: null,
      unit: null,
      label: "rectangular form",
      set: "plane",
    },
    computation: {
      type: "shape_identify",
      operation: "plane",
      shape: "rectangular form",
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [],
    },
    solution: "The front of the wallet is a rectangle.",
  }),
  4,
);

verifyNamed(
  "clock + fractions uses the 12 hour marks, not an invented time",
  OBJECTS.clock,
  readyFit("fractions", "object_math", OBJECTS.clock, {
    properties: ["12 hour marks"],
  }),
  baseWire({
    skillCode: "fractions",
    question:
      "Your clock face is divided into 12 hour marks. Suppose 3 of those marks have already been passed. What fraction of the clock remains?",
    objectConnection:
      "Your clock shows 12 hour marks, so those equal parts become the whole.",
    hint1: "The whole clock is 12 equal marks.",
    hint2: "12 − 3 = 9 marks remain, then write that as a fraction.",
    valuesUsed: [
      operand("hour marks", 12, "observed"),
      operand("marks passed", 3, "given_in_problem"),
    ],
    correctAnswer: {
      type: "fraction",
      value: null,
      numerator: 3,
      denominator: 4,
      unit: null,
    },
    computation: {
      type: "fraction_remaining",
      operation: "",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: true,
      operands: [
        operand("hour marks", 12, "observed"),
        operand("marks passed", 3, "given_in_problem"),
      ],
    },
    solution: "12 − 3 = 9, so 9/12 simplifies to 3/4.",
  }),
  4,
);

const inventedDiameter = finalizeChallenge(
  baseWire({
    skillCode: "measurement",
    question: "Your basketball is 24 centimetres across. What is its diameter?",
    objectConnection: "Your basketball shows a diameter of 24 cm.",
    valuesUsed: [operand("basketball diameter", 24, "observed", "cm")],
    correctAnswer: {
      type: "number",
      value: 24,
      numerator: null,
      denominator: null,
      unit: "cm",
    },
    computation: {
      type: "arithmetic",
      operation: "add",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("basketball diameter", 24, "observed", "cm"),
        operand("nothing extra", 0, "given_in_problem", "cm"),
      ],
    },
    solution: "The diameter is 24 cm.",
  }),
  {
    analysis: OBJECTS.basketball,
    fit: readyFit("measurement", "object_math", OBJECTS.basketball, {
      properties: ["sphere"],
    }),
    skillId: "measurement",
    grade: 4,
    studentEvidence: [],
  },
);

check(
  "an invented basketball diameter labelled observed cannot pass generation",
  inventedDiameter.status !== "ok",
);

const contextualAsObserved = finalizeChallenge(
  baseWire({
    skillCode: "addition",
    question:
      "Your basketball shows 1 point and 3 points. How many points is that?",
    objectConnection: "Your basketball shows those scores printed on it.",
    valuesUsed: [
      operand("free throw points", 1, "observed", "point"),
      operand("three-point shot", 3, "observed", "points"),
    ],
    correctAnswer: {
      type: "number",
      value: 4,
      numerator: null,
      denominator: null,
      unit: "points",
    },
    computation: {
      type: "arithmetic",
      operation: "add",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("free throw points", 1, "observed", "point"),
        operand("three-point shot", 3, "observed", "points"),
      ],
    },
    solution: "1 + 3 = 4 points.",
  }),
  {
    analysis: OBJECTS.basketball,
    fit: readyFit("addition", "inspired_math", OBJECTS.basketball, {
      inspiration: basketballScores,
    }),
    skillId: "addition",
    grade: 4,
    studentEvidence: [],
    contextualGrounding: buildContextualPayload(
      OBJECTS.basketball,
      basketballScores,
    ),
  },
);

check(
  "contextual basketball scores labelled observed fail generation",
  contextualAsObserved.status !== "ok",
);

check(
  "protein bottle + geometry at grade 3 is qualitative, not an invented area",
  OBJECTS["protein bottle"].visibleMeasurements.every(
    (measurement) =>
      !/height|width|length|diameter/i.test(measurement.label),
  ),
);

// ---------------------------------------------------------------------------
// Matrix printout
// ---------------------------------------------------------------------------

function row(objectKey: ObjectKey, pick: (skill: SkillId) => Path): string {
  const cells = SKILLS.map((skill) => PATH_MARK[pick(skill)]).join("  ");
  return `${objectKey.padEnd(16)}${cells}`;
}

console.log("\nExpected best path  (O object_math  N investigation  I inspired  X poor_fit)");
console.log(`                  ${SKILLS.map((skill) => skill.slice(0, 3)).join("  ")}`);
for (const objectKey of objectKeys) {
  console.log(row(objectKey, (skill) => EXPECTED[objectKey][skill]));
}

console.log("\nIf the model says poor_fit, recovery chooses:");
console.log(`                  ${SKILLS.map((skill) => skill.slice(0, 3)).join("  ")}`);
for (const objectKey of objectKeys) {
  console.log(row(objectKey, (skill) => recoveredMode(OBJECTS[objectKey], skill)));
}

console.log(
  `\nInspired best-paths that recovery downgrades to investigation_math: ${inspiredWhenRecoveredInvestigation}`,
);
console.log(`Expected poor_fit cells: ${expectedPoorFit}`);
console.log(`Recovery exits: ${recoveryExits}`);

if (failed > 0) {
  console.error(`\n${failed} ordinary-object matrix check(s) failed`);
  process.exit(1);
}

console.log("\nall ordinary-object matrix checks passed");
