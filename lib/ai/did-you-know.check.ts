/**
 * Did You Know fact catalogue and style checks.
 *
 * Run with: npx tsx lib/ai/did-you-know.check.ts
 *
 * These do not call a model. They prove educational facts stay compact,
 * do not describe the photograph, and cannot be treated as math evidence.
 */

import {
  didYouKnowFallback,
  hasGenericDescriptionLanguage,
  matchFallbackFact,
  wordCount,
} from "@/lib/ai/did-you-know";
import { finalizeDiscovery } from "@/lib/ai/discovery-grounding";
import {
  type ObjectAnalysis,
  UsedValueSchema,
} from "@/lib/ai/schemas";

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
    shapeProperties: extras.shapeProperties ?? [],
    observableProperties: extras.observableProperties ?? [],
    ...extras,
  };
}

const examples = [
  ["wallet", "personal accessory"],
  ["shoe", "footwear"],
  ["cup", "kitchen tool"],
  ["beverage can", "packaged beverage"],
  ["candle jar", "home fragrance"],
  ["basketball", "sports equipment"],
  ["book", "reading material"],
  ["toy", "plaything"],
] as const;

for (const [objectName, category] of examples) {
  const fact = didYouKnowFallback(reading(objectName, category));
  const words = wordCount(fact.text);
  check(
    `${objectName} has a compact Did You Know fact`,
    words >= 20 &&
      words <= 45 &&
      !hasGenericDescriptionLanguage(fact.text) &&
      !fact.text.toLowerCase().includes("this object is commonly used") &&
      !fact.text.toLowerCase().includes("this item appears"),
  );
  check(
    `${objectName} fact cannot become observed math evidence`,
    !UsedValueSchema.safeParse(fact).success,
  );
}

check(
  "wallet fact is not the obvious money-holder caption",
  !matchFallbackFact(reading("wallet", "accessory")).text
    .toLowerCase()
    .includes("wallets are used to hold money"),
);

check(
  "shoe fact teaches friction rather than repeating the photo",
  matchFallbackFact(reading("sneaker", "footwear")).text
    .toLowerCase()
    .includes("friction"),
);

check(
  "uncertain history is not required — a science fact can stand",
  finalizeDiscovery(
    {
      title: "Grip underfoot",
      text: "The grooves on many shoe soles help create friction with the ground. That extra grip can help keep you from slipping.",
      category: "science",
      factSupport: "well_known",
    },
    reading("sneaker", "footwear", { observableProperties: ["laces"] }),
  ).status === "ok",
);

const inventedHistory = finalizeDiscovery(
  {
    title: "A 1987 classic",
    text: "This bottle design was invented in 1987 by a company in California. It became popular because it was easy to hold.",
    category: "history",
    factSupport: "well_known",
  },
  reading("bottle", "packaged beverage"),
);

check(
  "uncertain invented history is discarded instead of stored",
  inventedHistory.status === "ok" &&
    inventedHistory.usedFallback === true &&
    !inventedHistory.discovery.text.includes("1987"),
);

const restatedMeasurement = finalizeDiscovery(
  {
    title: "Eleven ounces",
    text: "This candle jar shows 11 oz on its label. Labels like that help people compare size.",
    category: "observation",
    factSupport: "established",
  },
  reading("candle jar", "home fragrance", {
    visibleMeasurements: [{ value: 11, unit: "oz", label: "net weight" }],
    visibleText: ["11 oz"],
  }),
);

check(
  "a restated measurement is allowed only as established copy, never as a new observed value",
  restatedMeasurement.status === "ok" &&
    !UsedValueSchema.safeParse(restatedMeasurement.discovery).success,
);

if (failed > 0) {
  console.error(`\n${failed} did-you-know checks failed`);
  process.exit(1);
}

console.log("\nall did-you-know checks passed");
