/**
 * Geometry reasoning without invented measurements.
 *
 * Run with: npx tsx lib/ai/geometry-reasoning.check.ts
 */

import {
  type ChallengeContext,
  type WireChallenge,
  finalizeChallenge,
} from "@/lib/ai/challenge-grounding";
import type {
  ObjectAnalysis,
  ReadySkillFit,
  UsedValue,
} from "@/lib/ai/schemas";
import { verifyChallenge } from "@/lib/math/verify";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

function reading(
  name: string,
  category: string,
  shapes: string[],
  extras: Partial<ObjectAnalysis> = {},
): ObjectAnalysis {
  return {
    objectName: name,
    category,
    confidence: 0.9,
    visibleText: [],
    visibleMeasurements: [],
    countableProperties: [],
    shapeProperties: shapes,
    observableProperties: [],
    ...extras,
  };
}

const proteinBottle = reading("protein bottle", "bottle", [
  "cylinder-like body",
  "circular top",
  "circular bottom",
  "curved surface",
]);

const basketball = reading("basketball", "sports equipment", [
  "approximately spherical",
  "curved surface",
  "circular panels",
]);

const shoe = reading("sneaker", "footwear", [
  "left-right symmetry",
  "curved sole",
]);

const book = reading("book", "reading material", ["rectangular cover"]);

const box = reading("box", "container", [
  "rectangular prism",
  "flat rectangular faces",
]);

const clock = reading("clock", "household", [
  "circular face",
  "marks around a circle",
]);

function fit(analysis: ObjectAnalysis): ReadySkillFit {
  return {
    selectedSkillCode: "geometry",
    fitScore: 0.72,
    challengeMode: "object_math",
    canGenerateChallenge: true,
    usableProperties: [...analysis.shapeProperties],
    reason: "Visible form can anchor geometry.",
    suggestedObjectCharacteristics: [],
    alternativeSkillCodes: [],
    anchors: analysis.shapeProperties.map((property) => ({
      property,
      origin: "observed" as const,
    })),
    evidenceRequest: null,
    inspirationContext: null,
  };
}

function ctx(analysis: ObjectAnalysis): ChallengeContext {
  return {
    analysis,
    fit: fit(analysis),
    skillId: "geometry",
    grade: 4,
    studentEvidence: [],
  };
}

function operand(
  label: string,
  value: number,
  origin: UsedValue["origin"],
  unit: string | null = null,
) {
  return { label, value, unit, origin };
}

function wire(overrides: Partial<WireChallenge>): WireChallenge {
  return {
    canGenerate: true,
    question: "Question",
    skillCode: "geometry",
    solution: "The shape is named from what you can see.",
    hint1: "Look at the overall form.",
    hint2: "Name the closest everyday shape.",
    difficulty: 2,
    objectConnection: "Your object shows a real form we can name.",
    verificationStrategy: "Match the observed form to the catalog label.",
    valuesUsed: [],
    shapesUsed: [],
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
    ...overrides,
  };
}

function identify(
  analysis: ObjectAnalysis,
  aspect: "solid" | "plane" | "cross_section" | "symmetry",
  label: string,
  set: "solid" | "plane" | "symmetry",
  question: string,
  connection: string,
  solution: string,
) {
  return finalizeChallenge(
    wire({
      question,
      objectConnection: connection,
      solution,
      shapesUsed: [
        {
          label: `${analysis.objectName} form`,
          form: label,
          aspect,
          origin: "observed",
        },
      ],
      correctAnswer: {
        type: "choice",
        value: null,
        numerator: null,
        denominator: null,
        unit: null,
        label,
        set,
      },
      computation: {
        type: "shape_identify",
        operation: aspect,
        shape: label,
        numerator: null,
        denominator: null,
        simplify: null,
        operands: [],
      },
    }),
    ctx(analysis),
  );
}

const bottleSolid = identify(
  proteinBottle,
  "solid",
  "cylinder",
  "solid",
  "What 3D shape is your protein bottle most like?",
  "Your protein bottle has a cylinder-like body, so that form is the 3D shape we name.",
  "The bottle is most like a cylinder.",
);

const bottleTop = identify(
  proteinBottle,
  "plane",
  "circle",
  "plane",
  "Which 2D shape is the top of your protein bottle most like?",
  "Your protein bottle has a circular top, so that face is a circle.",
  "The top is most like a circle.",
);

const ballSolid = identify(
  basketball,
  "solid",
  "sphere",
  "solid",
  "What 3D shape is your basketball most like?",
  "Your basketball is approximately spherical, so the 3D form is a sphere.",
  "The basketball is most like a sphere.",
);

const shoeSymmetry = identify(
  shoe,
  "symmetry",
  "line of symmetry",
  "symmetry",
  "The left and right of your sneaker look like mirrors. Which idea is that?",
  "Your sneaker shows left-right symmetry, so we can name a line of symmetry.",
  "That matching left and right is a line of symmetry.",
);

const bookFace = identify(
  book,
  "plane",
  "rectangle",
  "plane",
  "Which 2D shape is the cover of your book most like?",
  "Your book has a rectangular cover, so that face is a rectangle.",
  "The cover is most like a rectangle.",
);

const boxSolid = identify(
  box,
  "solid",
  "rectangular prism",
  "solid",
  "What 3D shape is your box most like?",
  "Your box is a rectangular prism, so that is the 3D form we name.",
  "The box is most like a rectangular prism.",
);

const boxFaces = finalizeChallenge(
  wire({
    question: "If your box is a rectangular prism, how many faces does it have?",
    objectConnection:
      "Your box is a rectangular prism, so we can use that form's faces.",
    solution: "A rectangular prism has 6 faces.",
    hint1: "Count the flat sides of a box.",
    hint2: "A rectangular prism has a face on each side.",
    verificationStrategy: "Look up faces for a rectangular prism.",
    shapesUsed: [
      {
        label: "box form",
        form: "rectangular prism",
        aspect: "solid",
        origin: "observed",
      },
    ],
    correctAnswer: {
      type: "number",
      value: 6,
      numerator: null,
      denominator: null,
      unit: null,
    },
    computation: {
      type: "shape_count",
      operation: "faces",
      shape: "rectangular prism",
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [],
    },
  }),
  ctx(box),
);

const clockFace = identify(
  clock,
  "plane",
  "circle",
  "plane",
  "Which 2D shape is the face of your clock most like?",
  "Your clock has a circular face, so that shape is a circle.",
  "The clock face is most like a circle.",
);

check("protein bottle + geometry names a cylinder without a measurement", bottleSolid.status === "ok");
check("protein bottle + geometry can name the circular top", bottleTop.status === "ok");
check("basketball + geometry names a sphere without a measurement", ballSolid.status === "ok");
check("shoe + geometry can name a line of symmetry", shoeSymmetry.status === "ok");
check("book + geometry names a rectangle without a page count", bookFace.status === "ok");
check("box + geometry names a rectangular prism", boxSolid.status === "ok");
check("box + geometry can count faces from the form catalog", boxFaces.status === "ok");
check("clock + geometry names a circle without a diameter", clockFace.status === "ok");

const wallet = reading("wallet", "personal accessory", [
  "rectangular form",
  "symmetry",
]);

const walletFace = identify(
  wallet,
  "plane",
  "rectangle",
  "plane",
  "Which 2D shape is the front of your wallet most like?",
  "Your wallet has a rectangular form, so that face is a rectangle.",
  "The front is most like a rectangle.",
);

const walletAlias = identify(
  wallet,
  "plane",
  "rectangular",
  "plane",
  "Which 2D shape is the front of your wallet most like?",
  "Your wallet has a rectangular form, so that face is a rectangle.",
  "The front is most like a rectangle.",
);

const walletPhrase = identify(
  wallet,
  "plane",
  "rectangular form",
  "plane",
  "Which 2D shape is the front of your wallet most like?",
  "Your wallet has a rectangular form you can see from this photo.",
  "The front is most like a rectangle.",
);

const walletPrism = identify(
  wallet,
  "solid",
  "rectangular prism",
  "solid",
  "What 3D shape is your wallet most like?",
  "Your wallet has a rectangular form, so that solid is a rectangular prism.",
  "The wallet is a rectangular prism.",
);

check(
  "Grade 4 geometry + a wallet-like rectangle is qualitative object_math",
  walletFace.status === "ok" &&
    walletFace.challenge.computation.type === "shape_identify" &&
    walletFace.challenge.correctAnswer.type === "choice" &&
    walletFace.challenge.correctAnswer.value === "rectangle" &&
    walletFace.challenge.valuesUsed.length === 0,
);

check(
  "a valid shape_identify candidate uses visible form, not a measurement",
  walletFace.status === "ok" &&
    walletAlias.status === "ok" &&
    walletPhrase.status === "ok" &&
    walletPhrase.challenge.computation.type === "shape_identify" &&
    walletPhrase.challenge.correctAnswer.type === "choice" &&
    walletPhrase.challenge.correctAnswer.value === "rectangle",
);

check(
  "rectangular form on a wallet does not become an ungrounded rectangular prism",
  walletPrism.status === "generation_failure" &&
    walletPrism.issue.code === "ungrounded_shape",
);

const malformedWallet = identify(
  wallet,
  "plane",
  "triangle-ish",
  "plane",
  "Which 2D shape is the front of your wallet most like?",
  "Your wallet has a rectangular form, so that face is a rectangle.",
  "The front is most like a triangle.",
);

check(
  "a malformed generated geometry candidate is rejected",
  malformedWallet.status === "generation_failure" &&
    malformedWallet.issue.path === "shapesUsed" &&
    malformedWallet.issue.code === "unrecognized_geometry_label",
);

check(
  "a malformed geometry candidate is generation_failure, not poor_fit",
  malformedWallet.status === "generation_failure",
);

function verified(
  name: string,
  finalised: ReturnType<typeof finalizeChallenge>,
  analysis: ObjectAnalysis,
) {
  if (finalised.status !== "ok") {
    check(name, false);
    return;
  }

  const result = verifyChallenge({
    challenge: finalised.challenge,
    analysis,
    fit: fit(analysis),
    skillId: "geometry",
    grade: 4,
  });

  if (!result.ok) {
    console.error(`  ${name} reason=${result.reason} detail=${result.detail}`);
  }

  check(name, result.ok);
}

verified("protein bottle + geometry verifies", bottleSolid, proteinBottle);
verified("basketball + geometry verifies", ballSolid, basketball);
verified("shoe + geometry verifies", shoeSymmetry, shoe);
verified("book + geometry verifies", bookFace, book);
verified("box + geometry verifies", boxFaces, box);
verified("clock + geometry verifies", clockFace, clock);
verified("wallet + geometry verifies", walletPhrase, wallet);

const inventedDiameter = finalizeChallenge(
  wire({
    question:
      "Your basketball has a diameter of 10 inches. What is the circumference of a 10 inch circle if you only add 10 and 10?",
    objectConnection: "Your basketball shows a 10 inch diameter.",
    solution: "10 + 10 = 20 inches.",
    valuesUsed: [
      operand("basketball diameter", 10, "observed", "in"),
      operand("same diameter again", 10, "given_in_problem", "in"),
    ],
    shapesUsed: [],
    correctAnswer: {
      type: "number",
      value: 20,
      numerator: null,
      denominator: null,
      unit: "in",
    },
    computation: {
      type: "arithmetic",
      operation: "add",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("basketball diameter", 10, "observed", "in"),
        operand("same diameter again", 10, "given_in_problem", "in"),
      ],
    },
  }),
  ctx(basketball),
);

check(
  "invented basketball diameter labelled observed is rejected",
  inventedDiameter.status === "generation_failure",
);

const sphereOnBox = identify(
  box,
  "solid",
  "sphere",
  "solid",
  "What 3D shape is your box most like?",
  "Your box is a sphere.",
  "The box is most like a sphere.",
);

check("a box cannot be identified as a sphere", sphereOnBox.status === "generation_failure");

const sphereFaces = finalizeChallenge(
  wire({
    question: "How many faces does your basketball have if it is a sphere?",
    objectConnection: "Your basketball is a sphere.",
    solution: "A sphere has 0 faces.",
    shapesUsed: [
      {
        label: "ball form",
        form: "sphere",
        aspect: "solid",
        origin: "observed",
      },
    ],
    correctAnswer: {
      type: "number",
      value: 0,
      numerator: null,
      denominator: null,
      unit: null,
    },
    computation: {
      type: "shape_count",
      operation: "faces",
      shape: "sphere",
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [],
    },
  }),
  ctx(basketball),
);

check(
  "a sphere has no catalogued face count",
  sphereFaces.status === "generation_failure",
);

const measuredWithoutDimensions = finalizeChallenge(
  wire({
    question:
      "What is the perimeter of your basketball if you treat it as a rectangle?",
    objectConnection: "Your basketball is a sphere.",
    solution: "There are no sides to add.",
    valuesUsed: [],
    shapesUsed: [
      {
        label: "ball form",
        form: "sphere",
        aspect: "solid",
        origin: "observed",
      },
    ],
    correctAnswer: {
      type: "number",
      value: 0,
      numerator: null,
      denominator: null,
      unit: "in",
    },
    computation: {
      type: "geometry",
      operation: "perimeter",
      shape: "rectangle",
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [],
    },
  }),
  ctx(basketball),
);

check(
  "measured perimeter without dimensions is rejected",
  measuredWithoutDimensions.status === "generation_failure",
);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log("\nall geometry-reasoning checks passed");
