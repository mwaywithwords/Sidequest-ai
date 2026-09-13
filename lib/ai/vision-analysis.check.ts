/**
 * Combined vision-section checks.
 *
 * Run with: npx tsx lib/ai/vision-analysis.check.ts
 *
 * These do not call a model. They prove suitability and object analysis stay
 * separately validated after sharing one request, and that an unsafe
 * suitability section cannot become a reading.
 */

import type { WireObjectReading } from "@/lib/ai/object-observations";
import { finalizeVisionAnalysis } from "@/lib/ai/vision-finalize";
import type { SuitabilityJudgement } from "@/lib/ai/suitability-rules";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

function objectWire(
  overrides: Partial<WireObjectReading> = {},
): WireObjectReading {
  return {
    identifiable: true,
    objectName: "protein shake bottle",
    category: "packaged beverage",
    brand: "Premier Protein",
    confidence: 0.92,
    visibleText: ["Premier Protein", "11 FL OZ"],
    visibleMeasurements: [
      { value: 11, unit: "fl oz", label: "printed bottle volume" },
    ],
    countableProperties: [],
    shapeProperties: ["rectangular carton with a screw cap"],
    observableProperties: ["purple plastic cap"],
    ...overrides,
  };
}

function suitability(
  overrides: Partial<SuitabilityJudgement> = {},
): SuitabilityJudgement {
  return {
    verdict: "usable",
    confidence: "high",
    note: "protein shake bottle with nutrition labeling",
    ...overrides,
  };
}

const ordinary = finalizeVisionAnalysis({
  suitability: suitability(),
  object: objectWire(),
});

check(
  "an ordinary bottle reaches object analysis after a usable suitability section",
  ordinary.status === "ok" &&
    ordinary.analysis.objectName === "protein shake bottle" &&
    ordinary.analysis.visibleMeasurements[0]?.value === 11,
);

const wallet = finalizeVisionAnalysis({
  suitability: suitability({
    verdict: "drug_content",
    note: "brown leather wallet",
  }),
  object: objectWire({
    objectName: "wallet",
    category: "personal accessory",
    brand: null,
    visibleText: [],
    visibleMeasurements: [],
    countableProperties: ["one visible card slot"],
    shapeProperties: ["rectangular fold"],
    observableProperties: ["brown leather"],
  }),
});

check(
  "an ordinary wallet still reaches analysis when the model guessed drug_content",
  wallet.status === "ok" && wallet.analysis.objectName === "wallet",
);

const person = finalizeVisionAnalysis({
  suitability: suitability({
    verdict: "person_focused",
    note: "a child facing the camera",
  }),
  object: objectWire(),
});

check(
  "a person-focused suitability section is unsafe even if the object section looks valid",
  person.status === "unsafe" && person.safety.reason === "person_focused",
);

check(
  "an unsafe suitability section does not expose the object reading",
  person.status === "unsafe" && !("analysis" in person),
);

const weapon = finalizeVisionAnalysis({
  suitability: suitability({
    verdict: "weapon",
    note: "handgun on a table",
  }),
  object: objectWire(),
});

check(
  "asserted weapon imagery cannot become a reading",
  weapon.status === "unsafe" && weapon.safety.reason === "weapon",
);

const unreadable = finalizeVisionAnalysis({
  suitability: suitability(),
  object: objectWire({
    identifiable: false,
    objectName: "unknown",
    confidence: 0.2,
    visibleText: [],
    visibleMeasurements: [],
    countableProperties: [],
    shapeProperties: [],
    observableProperties: [],
  }),
});

check(
  "a usable photo of an unidentifiable object fails analysis, not safety",
  unreadable.status === "failed" &&
    unreadable.failure.reason === "unknown_object" &&
    unreadable.safety.allowed,
);

const malformedObject = finalizeVisionAnalysis({
  suitability: suitability(),
  object: objectWire({
    objectName: "   ",
    category: "   ",
  }),
});

check(
  "a malformed object section fails closed after suitability passed",
  malformedObject.status === "failed" &&
    malformedObject.failure.reason === "generation_failure",
);

const lowConfidence = finalizeVisionAnalysis({
  suitability: suitability({
    verdict: "usable",
    confidence: "low",
    note: "possibly a bottle",
  }),
  object: objectWire(),
});

check(
  "low-confidence usable is unusable_image and does not keep the reading",
  lowConfidence.status === "unsafe" &&
    lowConfidence.safety.reason === "unusable_image",
);

if (failed > 0) {
  console.error(`\n${failed} vision analysis check(s) failed`);
  process.exit(1);
}

console.log("\nall vision analysis checks passed");
