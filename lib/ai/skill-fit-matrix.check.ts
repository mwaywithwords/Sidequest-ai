/**
 * Skill × ordinary-object path matrix for Skill Fit.
 *
 * Run with: npx tsx lib/ai/skill-fit-matrix.check.ts
 *
 * These do not call a model. They prove that every listed skill can be
 * represented as a legitimate investigation path for four everyday
 * objects, without violating grounding, and that basketball + geometry
 * and a protein bottle + geometry are not poor_fit.
 */

import {
  recoverInvestigation,
  resolveInvestigation,
} from "@/lib/ai/investigation-path";
import {
  type ChallengeMode,
  type EvidenceRequest,
  type InspirationContext,
  type ObjectAnalysis,
  SkillFitAnalysisSchema,
} from "@/lib/ai/schemas";
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

const basketball: ObjectAnalysis = {
  objectName: "basketball",
  category: "sports equipment",
  confidence: 0.94,
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

const sneaker: ObjectAnalysis = {
  objectName: "sneaker",
  category: "footwear",
  confidence: 0.91,
  visibleText: [],
  visibleMeasurements: [],
  countableProperties: [],
  shapeProperties: [
    "left-right symmetry",
    "curved sole",
    "angles at the toe",
    "repeated tread pattern",
  ],
  observableProperties: ["laces", "rubber outsole"],
};

const proteinBottle: ObjectAnalysis = {
  objectName: "protein shake bottle",
  category: "packaged beverage",
  brand: "Premier Protein",
  confidence: 0.92,
  visibleText: ["Premier Protein", "Chocolate"],
  visibleMeasurements: [
    { value: 11, unit: "fl oz", label: "printed bottle volume" },
  ],
  countableProperties: [],
  shapeProperties: [
    "cylinder-like form",
    "circular top",
    "symmetry",
    "curved surface",
  ],
  observableProperties: ["screw cap"],
};

const wallet: ObjectAnalysis = {
  objectName: "wallet",
  category: "personal accessory",
  confidence: 0.9,
  visibleText: [],
  visibleMeasurements: [],
  countableProperties: [],
  shapeProperties: ["rectangular form", "symmetry"],
  observableProperties: ["card slots", "billfold"],
};

const objects = {
  basketball,
  sneaker,
  "protein bottle": proteinBottle,
  wallet,
} as const;

type ObjectKey = keyof typeof objects;

const measurementAsk = (
  objectName: string,
  target: string,
  prompt: string,
): EvidenceRequest => ({
  type: "student_measurement",
  prompt,
  targetProperty: target,
  reason: `A real measurement from your ${objectName} lets us do this mission.`,
});

const inspired = (topic: string, reason: string): InspirationContext => ({
  topic,
  reason,
});

type ExpectedPath = {
  mode: Exclude<ChallengeMode, "poor_fit">;
  properties?: readonly string[];
  evidence?: EvidenceRequest;
  inspiration?: InspirationContext;
};

/**
 * One honest path per object × skill. The path is not the only legal one;
 * it is a path that must be representable and must not be poor_fit.
 */
const MATRIX: Record<ObjectKey, Record<SkillId, ExpectedPath>> = {
  basketball: {
    addition: {
      mode: "inspired_math",
      inspiration: inspired(
        "basketball scores",
        "Basketball scores provide whole numbers connected to the photographed ball.",
      ),
    },
    subtraction: {
      mode: "inspired_math",
      inspiration: inspired(
        "basketball scores",
        "A score difference is subtraction anchored in basketball.",
      ),
    },
    multiplication: {
      mode: "inspired_math",
      inspiration: inspired(
        "basketball jersey numbers",
        "Jersey numbers provide meaningful whole numbers connected to basketball.",
      ),
    },
    division: {
      mode: "inspired_math",
      inspiration: inspired(
        "equal basketball teams",
        "Sharing players into equal teams is division connected to basketball.",
      ),
    },
    fractions: {
      mode: "inspired_math",
      inspiration: inspired(
        "quarters of a basketball game",
        "A basketball game is divided into quarters, which supports fractions.",
      ),
    },
    measurement: {
      mode: "investigation_math",
      evidence: measurementAsk(
        "basketball",
        "circumference",
        "Measure around the widest part of the basketball.",
      ),
    },
    geometry: {
      mode: "object_math",
      properties: ["sphere", "circular panels", "curved surface", "symmetry"],
    },
  },
  sneaker: {
    addition: {
      mode: "inspired_math",
      inspiration: inspired(
        "walking and steps",
        "A sneaker is used for walking, so steps can inspire addition without a printed size.",
      ),
    },
    subtraction: {
      mode: "inspired_math",
      inspiration: inspired(
        "walking and steps",
        "Steps across walks can inspire subtraction without inventing a shoe size.",
      ),
    },
    multiplication: {
      mode: "inspired_math",
      inspiration: inspired(
        "steps and laps",
        "Repeated steps or pairs can inspire multiplication without counting eyelets.",
      ),
    },
    division: {
      mode: "inspired_math",
      inspiration: inspired(
        "pairs of sneakers",
        "Sneakers come in pairs, which supports grouping and sharing.",
      ),
    },
    fractions: {
      mode: "inspired_math",
      inspiration: inspired(
        "pairs of sneakers",
        "One shoe is half of a pair, which supports fractions.",
      ),
    },
    measurement: {
      mode: "investigation_math",
      evidence: measurementAsk(
        "sneaker",
        "heel-to-toe length",
        "Measure the shoe from heel to toe.",
      ),
    },
    geometry: {
      mode: "object_math",
      properties: [
        "left-right symmetry",
        "curved sole",
        "angles at the toe",
        "repeated tread pattern",
      ],
    },
  },
  "protein bottle": {
    addition: {
      mode: "object_math",
      properties: ["printed bottle volume: 11 fl oz"],
    },
    subtraction: {
      mode: "object_math",
      properties: ["printed bottle volume: 11 fl oz"],
    },
    multiplication: {
      mode: "object_math",
      properties: ["printed bottle volume: 11 fl oz"],
    },
    division: {
      mode: "object_math",
      properties: ["printed bottle volume: 11 fl oz"],
    },
    fractions: {
      mode: "object_math",
      properties: ["printed bottle volume: 11 fl oz"],
    },
    measurement: {
      mode: "object_math",
      properties: ["printed bottle volume: 11 fl oz"],
    },
    geometry: {
      mode: "object_math",
      properties: [
        "cylinder-like form",
        "circular top",
        "symmetry",
        "curved surface",
      ],
    },
  },
  wallet: {
    addition: {
      mode: "inspired_math",
      inspiration: inspired(
        "money and prices",
        "Wallets hold money, which supports adding amounts.",
      ),
    },
    subtraction: {
      mode: "inspired_math",
      inspiration: inspired(
        "money and budgeting",
        "Spending from a wallet is subtraction connected to the object.",
      ),
    },
    multiplication: {
      mode: "inspired_math",
      inspiration: inspired(
        "grouping currency",
        "Equal groups of coins or notes support multiplication.",
      ),
    },
    division: {
      mode: "inspired_math",
      inspiration: inspired(
        "sharing money",
        "Sharing an amount equally is division connected to a wallet.",
      ),
    },
    fractions: {
      mode: "inspired_math",
      inspiration: inspired(
        "parts of an amount of money",
        "Half or a quarter of an amount is fraction work connected to a wallet.",
      ),
    },
    measurement: {
      mode: "investigation_math",
      evidence: measurementAsk(
        "wallet",
        "wallet length",
        "Measure the long side of the wallet.",
      ),
    },
    geometry: {
      mode: "object_math",
      properties: ["rectangular form", "symmetry"],
    },
  },
};

function fitRecord(
  skillId: SkillId,
  expected: ExpectedPath,
): Record<string, unknown> {
  const properties = [...(expected.properties ?? [])];

  return {
    selectedSkillCode: skillId,
    fitScore: 0.7,
    challengeMode: expected.mode,
    canGenerateChallenge:
      expected.mode === "object_math" || expected.mode === "inspired_math",
    usableProperties: properties,
    reason: `A ${expected.mode} path exists for this object.`,
    suggestedObjectCharacteristics: [],
    alternativeSkillCodes: [],
    anchors:
      expected.mode === "object_math"
        ? properties.map((property) => ({ property, origin: "observed" }))
        : expected.mode === "investigation_math" && expected.evidence
          ? [
              {
                property: expected.evidence.targetProperty,
                origin: "student_provided",
              },
            ]
          : [],
    evidenceRequest: expected.evidence ?? null,
    inspirationContext: expected.inspiration ?? null,
  };
}

for (const [objectKey, analysis] of Object.entries(objects) as [
  ObjectKey,
  ObjectAnalysis,
][]) {
  for (const skillId of SKILL_IDS) {
    const expected = MATRIX[objectKey][skillId];
    const record = fitRecord(skillId, expected);
    const parsed = SkillFitAnalysisSchema.safeParse(record);

    check(
      `${objectKey} + ${skillId} schema is a valid ${expected.mode} path`,
      parsed.success && parsed.data.challengeMode !== "poor_fit",
    );

    const resolved = resolveInvestigation(
      {
        challengeMode: expected.mode,
        fitScore: 0.7,
        reason: "Proposed by the matrix.",
        evidenceRequest: expected.evidence ?? null,
        inspirationContext: expected.inspiration ?? null,
      },
      expected.properties ?? [],
    );

    check(
      `${objectKey} + ${skillId} resolver keeps ${expected.mode}`,
      resolved.challengeMode === expected.mode,
    );

    const recovered = recoverInvestigation(
      {
        challengeMode: "poor_fit",
        reason: "Model declined too early.",
        evidenceRequest: null,
        inspirationContext: null,
      },
      analysis,
      skillId,
    );

    check(
      `${objectKey} + ${skillId} is not stuck on poor_fit after recovery`,
      recovered.resolved.challengeMode !== "poor_fit",
    );
  }
}

check(
  "basketball + geometry is object_math, not poor_fit",
  MATRIX.basketball.geometry.mode === "object_math" &&
    SkillFitAnalysisSchema.safeParse(
      fitRecord("geometry", MATRIX.basketball.geometry),
    ).success,
);

check(
  "protein bottle + geometry is object_math, not poor_fit",
  MATRIX["protein bottle"].geometry.mode === "object_math" &&
    SkillFitAnalysisSchema.safeParse(
      fitRecord("geometry", MATRIX["protein bottle"].geometry),
    ).success,
);

check(
  "wallet + addition is inspired_math, not automatically poor_fit",
  MATRIX.wallet.addition.mode === "inspired_math" &&
    SkillFitAnalysisSchema.safeParse(
      fitRecord("addition", MATRIX.wallet.addition),
    ).success,
);

check(
  "wallet + subtraction is inspired_math, not automatically poor_fit",
  MATRIX.wallet.subtraction.mode === "inspired_math",
);

check(
  "sneaker + measurement is investigation_math when no size is visible",
  MATRIX.sneaker.measurement.mode === "investigation_math",
);

const recoveredBasketballGeometry = recoverInvestigation(
  {
    challengeMode: "poor_fit",
    reason: "No printed numbers.",
    evidenceRequest: null,
    inspirationContext: null,
  },
  basketball,
  "geometry",
);

check(
  "recovering basketball + geometry uses visible shape, not a number",
  recoveredBasketballGeometry.resolved.challengeMode === "object_math" &&
    recoveredBasketballGeometry.usableProperties.includes("sphere"),
);

const recoveredBottleGeometry = recoverInvestigation(
  {
    challengeMode: "poor_fit",
    reason: "Geometry needs dimensions.",
    evidenceRequest: null,
    inspirationContext: null,
  },
  proteinBottle,
  "geometry",
);

check(
  "recovering protein bottle + geometry uses cylinder-like form",
  recoveredBottleGeometry.resolved.challengeMode === "object_math" &&
    recoveredBottleGeometry.usableProperties.includes("cylinder-like form"),
);

const recoveredSneakerMeasurement = recoverInvestigation(
  {
    challengeMode: "poor_fit",
    reason: "No size label.",
    evidenceRequest: null,
    inspirationContext: null,
  },
  sneaker,
  "measurement",
);

check(
  "recovering sneaker + measurement asks for one measurement",
  recoveredSneakerMeasurement.resolved.challengeMode ===
    "investigation_math" &&
    recoveredSneakerMeasurement.resolved.evidenceRequest?.type ===
      "student_measurement",
);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log("\nall skill-fit matrix checks passed");
