/**
 * Regression checks for observation sanitizing.
 *
 * Run with: npx tsx lib/ai/object-observations.check.ts
 *
 * These do not call a model. They prove a blank unit cannot sink an otherwise
 * valid reading, and that the sanitizer never invents a unit or a label.
 */

import {
  finalizeObjectReading,
  sanitizeObservations,
  type WireObjectReading,
} from "@/lib/ai/object-observations";

const printedVolume = {
  value: 11,
  unit: "fl oz",
  label: "printed bottle volume",
};

const blankUnit = {
  value: 30,
  unit: "",
  label: "protein amount",
};

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
  overrides: Partial<WireObjectReading> = {},
): WireObjectReading {
  return {
    identifiable: true,
    objectName: "protein shake bottle",
    category: "packaged beverage",
    brand: "Premier Protein",
    confidence: 0.92,
    visibleText: ["Premier Protein", "Chocolate"],
    visibleMeasurements: [printedVolume],
    countableProperties: [],
    shapeProperties: ["rectangular carton with a screw cap"],
    observableProperties: ["purple plastic cap"],
    ...overrides,
  };
}

const mixed = sanitizeObservations({
  visibleText: ["Premier Protein", "  ", ""],
  visibleMeasurements: [printedVolume, blankUnit],
  countableProperties: ["  "],
  shapeProperties: [" rectangular carton "],
  observableProperties: [""],
});

check(
  "one valid measurement + one blank-unit measurement keeps only the valid one",
  mixed.visibleMeasurements.length === 1 &&
    mixed.visibleMeasurements[0]?.value === 11 &&
    mixed.visibleMeasurements[0]?.unit === "fl oz" &&
    mixed.visibleMeasurements[0]?.label === "printed bottle volume",
);

const blankUnitWithShape = finalizeObjectReading(
  reading({
    visibleMeasurements: [blankUnit],
    visibleText: ["  "],
    countableProperties: [],
    observableProperties: [],
    shapeProperties: ["rectangular carton with a screw cap"],
  }),
);

check(
  "blank-unit measurement only + useful shape still succeeds",
  blankUnitWithShape.status === "ok" &&
    blankUnitWithShape.analysis.visibleMeasurements.length === 0 &&
    blankUnitWithShape.analysis.shapeProperties.includes(
      "rectangular carton with a screw cap",
    ),
);

const onlyBlank = finalizeObjectReading(
  reading({
    visibleMeasurements: [blankUnit],
    visibleText: ["", "   "],
    countableProperties: [" "],
    shapeProperties: [],
    observableProperties: [""],
  }),
);

check(
  "blank-unit measurement only + no other usable observation is insufficient_information",
  onlyBlank.status === "insufficient_information",
);

check(
  "blank objectName is generation_failure",
  finalizeObjectReading(reading({ objectName: "   " })).status ===
    "generation_failure",
);

check(
  "out-of-range confidence is generation_failure",
  finalizeObjectReading(reading({ confidence: 1.4 })).status ===
    "generation_failure",
);

check(
  "negative confidence is generation_failure, not unknown_object",
  finalizeObjectReading(reading({ confidence: -0.2 })).status ===
    "generation_failure",
);

const unchanged = finalizeObjectReading(reading());

check(
  "valid measurements remain unchanged",
  unchanged.status === "ok" &&
    unchanged.analysis.visibleMeasurements.length === 1 &&
    unchanged.analysis.visibleMeasurements[0]?.value === 11 &&
    unchanged.analysis.visibleMeasurements[0]?.unit === "fl oz" &&
    unchanged.analysis.visibleMeasurements[0]?.label === "printed bottle volume",
);

check(
  "the sanitizer does not invent a unit for a dropped measurement",
  !JSON.stringify(mixed.visibleMeasurements).includes("30"),
);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log("\nall object-observation checks passed");
