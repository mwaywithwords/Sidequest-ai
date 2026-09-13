/**
 * Checks for evergreen Inspired Math context.
 *
 * Run with: npx tsx lib/ai/inspired-context.check.ts
 */

import {
  buildContextualPayload,
  isContextualFact,
} from "@/lib/ai/inspired-context";
import type { ObjectAnalysis } from "@/lib/ai/schemas";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

function reading(name: string, category: string): ObjectAnalysis {
  return {
    objectName: name,
    category,
    confidence: 0.9,
    visibleText: [],
    visibleMeasurements: [],
    countableProperties: [],
    shapeProperties: [],
    observableProperties: ["photographed object"],
  };
}

const basketball = buildContextualPayload(reading("basketball", "sports"), {
  topic: "basketball scores",
  reason: "Scores belong to basketball.",
});

check(
  "basketball context includes 1, 2, 3, 4, and 5",
  [1, 2, 3, 4, 5].every((value) =>
    basketball.facts.some((fact) => fact.value === value),
  ),
);

check(
  "basketball context does not default to jersey 23",
  !basketball.facts.some((fact) => fact.value === 23),
);

check(
  "a free throw is contextual, not an object measurement",
  isContextualFact(
    { label: "free throw points", value: 1, unit: "point" },
    basketball,
  ),
);

const wallet = buildContextualPayload(reading("wallet", "accessory"), {
  topic: "money",
  reason: "Wallets hold money.",
});

check(
  "wallet context includes cents in a dollar",
  isContextualFact({ label: "cents in a dollar", value: 100, unit: "cents" }, wallet),
);

const unknown = buildContextualPayload(reading("lamp", "household"), {
  topic: "household lighting",
  reason: "A lamp can still inspire a hypothetical situation.",
});

check(
  "an unmatched object still gets a topic and no invented measurements",
  unknown.topic.includes("lighting") && unknown.facts.length === 0,
);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log("\nall inspired-context checks passed");
