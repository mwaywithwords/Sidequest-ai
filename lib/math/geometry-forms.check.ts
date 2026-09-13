/**
 * Checks for the finite geometry catalog.
 *
 * Run with: npx tsx lib/math/geometry-forms.check.ts
 */

import {
  normaliseGeometryLabel,
  shapeSupports,
  structureCount,
} from "@/lib/math/geometry-forms";

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
  "a cylinder-like bottle supports cylinder and circle, not sphere",
  shapeSupports(
    {
      objectName: "protein bottle",
      category: "bottle",
      shapeProperties: ["cylinder-like body", "circular top"],
      observableProperties: [],
      countableProperties: [],
    },
    "solid",
    "cylinder",
  ) &&
    shapeSupports(
      {
        objectName: "protein bottle",
        category: "bottle",
        shapeProperties: ["cylinder-like body", "circular top"],
        observableProperties: [],
        countableProperties: [],
      },
      "plane",
      "circle",
    ) &&
    !shapeSupports(
      {
        objectName: "protein bottle",
        category: "bottle",
        shapeProperties: ["cylinder-like body", "circular top"],
        observableProperties: [],
        countableProperties: [],
      },
      "solid",
      "sphere",
    ),
);

check(
  "a rectangular carton bottle is not labelled a cylinder just because it is a bottle",
  !shapeSupports(
    {
      objectName: "protein shake bottle",
      category: "packaged beverage",
      shapeProperties: ["rectangular carton with a screw cap"],
      observableProperties: [],
      countableProperties: [],
    },
    "solid",
    "cylinder",
  ),
);

check(
  "a basketball supports sphere and a circular cross-section",
  shapeSupports(
    {
      objectName: "basketball",
      category: "sports equipment",
      shapeProperties: ["approximately spherical", "curved surface"],
      observableProperties: [],
      countableProperties: [],
    },
    "solid",
    "sphere",
  ) &&
    shapeSupports(
      {
        objectName: "basketball",
        category: "sports equipment",
        shapeProperties: ["approximately spherical", "curved surface"],
        observableProperties: [],
        countableProperties: [],
      },
      "cross_section",
      "circle",
    ),
);

check(
  "rectangular prism face count is 6, sphere has no face catalog",
  structureCount("rectangular prism", "faces") === 6 &&
    structureCount("sphere", "faces") === null,
);

check(
  "only schema labels normalise; ball is not silently turned into sphere",
  normaliseGeometryLabel(" Rectangular Prism ") === "rectangular prism" &&
    normaliseGeometryLabel("ball") === null,
);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log("\nall geometry-forms checks passed");
