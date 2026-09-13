/**
 * Decision and schema checks for the discovery stage.
 *
 * Run with: npx tsx lib/ai/discovery-grounding.check.ts
 *
 * These do not call a model. They check that DiscoverySchema is the persist
 * contract, that unsupported claims are not repaired, and that the
 * observation fallback is built only from the reading.
 */

import {
  finalizeDiscovery,
  hasUnsupportedClaims,
  observationDiscovery,
  sentenceCount,
  type WireDiscovery,
} from "@/lib/ai/discovery-grounding";
import {
  type Discovery,
  DiscoverySchema,
  type ObjectAnalysis,
} from "@/lib/ai/schemas";

const bottle: ObjectAnalysis = {
  objectName: "protein shake bottle",
  category: "packaged beverage",
  brand: "Premier Protein",
  confidence: 0.92,
  visibleText: ["Premier Protein", "Chocolate"],
  visibleMeasurements: [
    { value: 11, unit: "fl oz", label: "printed bottle volume" },
  ],
  countableProperties: [],
  shapeProperties: ["rectangular carton with a screw cap"],
  observableProperties: ["purple plastic cap"],
};

const unlabeledSneaker: ObjectAnalysis = {
  objectName: "sneaker",
  category: "footwear",
  confidence: 0.8,
  visibleText: [],
  visibleMeasurements: [],
  countableProperties: ["8 visible eyelets"],
  shapeProperties: ["curved sole"],
  observableProperties: ["worn fabric"],
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

function schemaOk(name: string, value: unknown) {
  const parsed = DiscoverySchema.safeParse(value);
  check(name, parsed.success);
  return parsed;
}

function schemaFails(name: string, value: unknown) {
  check(name, !DiscoverySchema.safeParse(value).success);
}

function wire(overrides: Partial<WireDiscovery> = {}): WireDiscovery {
  return {
    title: "Made to carry a drink",
    text: "Drink bottles are designed to hold liquids securely while being easy to carry. Their shape and labels also help people quickly see how much they contain.",
    category: "design",
    factSupport: "well_known",
    ...overrides,
  };
}

function isObservation(discovery: Discovery): boolean {
  return discovery.category === "observation";
}

// --- DiscoverySchema is the persist contract --------------------------------

schemaOk("a three-field discovery is valid", {
  title: "A box that protects eggs",
  text: "Egg cartons are moulded into rows so each egg sits in its own cup. The bumps between cups keep the eggs from bumping into each other.",
  category: "engineering",
});

schemaFails("empty title is invalid", {
  title: "   ",
  text: "Drink bottles are designed to hold liquids securely. Their shape helps people carry them.",
  category: "design",
});

schemaFails("unknown category is invalid", {
  title: "A closer look",
  text: "This bottle is tall. Its label is printed.",
  category: "trivia",
});

schemaFails("factSupport cannot be persisted on DiscoverySchema", {
  title: "Made to carry a drink",
  text: "Drink bottles are designed to hold liquids securely while being easy to carry. Their shape and labels also help people quickly see how much they contain.",
  category: "design",
  factSupport: "well_known",
});

for (const category of [
  "history",
  "science",
  "design",
  "engineering",
  "culture",
  "observation",
] as const) {
  schemaOk(`category ${category} is supported`, {
    title: "A closer look",
    text: "This object has a shape you can notice. Looking closely tells you how it was made to be used.",
    category,
  });
}

// --- accepted well-known facts ----------------------------------------------

const bottleDesign = finalizeDiscovery(wire(), bottle);
check(
  "preferred bottle design fact is accepted",
  bottleDesign.status === "ok" &&
    bottleDesign.usedFallback === false &&
    bottleDesign.discovery.category === "design" &&
    bottleDesign.discovery.title === "Made to carry a drink",
);

const observedVolume = finalizeDiscovery(
  wire({
    title: "A number you can read",
    text: "This bottle shows 11 fl oz on its label. Labels like that help people compare how much a drink holds.",
    category: "observation",
    factSupport: "established",
  }),
  bottle,
);
check(
  "an observed measurement may be restated",
  observedVolume.status === "ok" && observedVolume.usedFallback === false,
);

const geometryFact = finalizeDiscovery(
  wire({
    title: "Straight sides that match",
    text: "A rectangle has two pairs of matching sides. That is why window panes are easy to measure all the way around.",
    category: "science",
    factSupport: "well_known",
  }),
  unlabeledSneaker,
);
check(
  "a general fact with no invented measurement is accepted",
  geometryFact.status === "ok" && geometryFact.usedFallback === false,
);

const modelObservation = finalizeDiscovery(
  wire({
    title: "Designed to be easy to hold",
    text: "This container has a tall shape that makes it easy to carry and pour. Its printed label also gives useful information about what's inside.",
    category: "observation",
    factSupport: "observation",
  }),
  bottle,
);
check(
  "a clean model observation is kept",
  modelObservation.status === "ok" &&
    modelObservation.usedFallback === false &&
    modelObservation.discovery.category === "observation",
);

// --- unsupported claims are not repaired ------------------------------------

const inventedYear = finalizeDiscovery(
  wire({
    title: "A 1987 classic",
    text: "This bottle design was invented in 1987 by a company in California. It became popular because it was easy to hold.",
    category: "history",
    factSupport: "well_known",
  }),
  bottle,
);
check(
  "invented year and inventor are not persisted",
  inventedYear.status === "ok" &&
    inventedYear.usedFallback === true &&
    isObservation(inventedYear.discovery) &&
    !inventedYear.discovery.text.includes("1987") &&
    !inventedYear.discovery.title.includes("1987"),
);

const inventedCapacity = finalizeDiscovery(
  wire({
    title: "A standard size",
    text: "Most shake bottles hold 12 fl oz so they fit in a cup holder. That size is used because it is easy to drink in one sitting.",
    category: "design",
    factSupport: "well_known",
  }),
  bottle,
);
check(
  "an unobserved capacity is not persisted",
  inventedCapacity.status === "ok" &&
    inventedCapacity.usedFallback === true &&
    !inventedCapacity.discovery.text.includes("12"),
);

const citation = finalizeDiscovery(
  wire({
    title: "What researchers say",
    text: "Bottles keep drinks from spilling, according to packaging studies. Their narrow opening is the part that does that work.",
    category: "science",
    factSupport: "well_known",
  }),
  bottle,
);
check(
  "a citation is not persisted",
  citation.status === "ok" &&
    citation.usedFallback === true &&
    !citation.discovery.text.toLowerCase().includes("according to"),
);

const productClaim = finalizeDiscovery(
  wire({
    title: "A best-selling shake",
    text: "This is a best-selling protein drink. People buy it because the carton is easy to carry.",
    category: "culture",
    factSupport: "well_known",
  }),
  bottle,
);
check(
  "a product claim is not persisted",
  productClaim.status === "ok" &&
    productClaim.usedFallback === true &&
    !productClaim.discovery.text.toLowerCase().includes("best-selling"),
);

const inventedSteel = finalizeDiscovery(
  wire({
    title: "Strong metal walls",
    text: "This carton is made of stainless steel so it does not crush. The metal also keeps the drink cold.",
    category: "engineering",
    factSupport: "well_known",
  }),
  bottle,
);
check(
  "an unobserved material is not persisted",
  inventedSteel.status === "ok" &&
    inventedSteel.usedFallback === true &&
    !inventedSteel.discovery.text.toLowerCase().includes("stainless"),
);

check(
  "hasUnsupportedClaims flags an invented year without rewriting the text",
  hasUnsupportedClaims(
    "A 1987 classic",
    "This bottle design was invented in 1987.",
    bottle,
  ),
);

// --- inconsistent or malformed output ---------------------------------------

const mismatchedSupport = finalizeDiscovery(
  wire({
    title: "An old idea",
    text: "People have carried drinks in bottles for a very long time. A narrow opening helps keep the liquid from spilling.",
    category: "history",
    factSupport: "observation",
  }),
  bottle,
);
check(
  "observation support with a non-observation category uses the fallback",
  mismatchedSupport.status === "ok" &&
    mismatchedSupport.usedFallback === true &&
    mismatchedSupport.discovery.category === "observation",
);

const oneSentence = finalizeDiscovery(
  wire({
    title: "Easy to carry",
    text: "Drink bottles are designed to hold liquids securely while being easy to carry.",
  }),
  bottle,
);
check(
  "a single sentence is a generation failure, not a repaired paragraph",
  oneSentence.status === "generation_failure",
);

const fiveSentences = finalizeDiscovery(
  wire({
    text: "Bottles hold liquids. They are easy to carry. Labels show what is inside. Caps keep drinks closed. People use them every day.",
  }),
  bottle,
);
check(
  "five sentences are a generation failure, not a trimmed discovery",
  fiveSentences.status === "generation_failure",
);

const blankTitle = finalizeDiscovery(wire({ title: "   " }), bottle);
check(
  "a blank title is a generation failure, not a filled-in heading",
  blankTitle.status === "generation_failure",
);

const tooLong = finalizeDiscovery(
  wire({
    text: `${"Bottles hold liquids securely. ".repeat(40)}Their shape helps people carry them.`,
  }),
  bottle,
);
check(
  "an oversized text is a generation failure, not a truncated one",
  tooLong.status === "generation_failure",
);

check("sentenceCount counts 2 sentences", sentenceCount("One fact. Two fact.") === 2);
check("sentenceCount counts 1 sentence", sentenceCount("Only one fact.") === 1);

// --- observation fallback is grounded in the reading ------------------------

const fallback = observationDiscovery(bottle);
check(
  "fallback category is observation",
  fallback.category === "observation",
);
check(
  "fallback mentions the object name from the reading",
  fallback.text.includes("protein shake bottle"),
);
check(
  "fallback mentions a recorded shape",
  fallback.text.includes("rectangular carton with a screw cap"),
);
check(
  "fallback does not invent a year or inventor",
  !YEAR_IN(fallback.text) && !fallback.text.toLowerCase().includes("invented"),
);
check(
  "fallback does not mention the brand unless the object name already did",
  !fallback.text.includes("Premier Protein"),
);
check(
  "fallback is 2 to 4 sentences",
  sentenceCount(fallback.text) >= 2 && sentenceCount(fallback.text) <= 4,
);
check(
  "fallback title is the hold-friendly wording for a screw-cap carton",
  fallback.title === "Designed to be easy to hold",
);

const sneakerFallback = observationDiscovery(unlabeledSneaker);
check(
  "fallback without a label uses a recorded observation",
  sneakerFallback.text.includes("worn fabric") ||
    sneakerFallback.text.includes("curved sole"),
);
check(
  "sneaker fallback does not invent a capacity",
  !sneakerFallback.text.includes("oz") && !sneakerFallback.text.includes("ml"),
);

const accepted = finalizeDiscovery(wire(), bottle);
check(
  "accepted discoveries persist only title, text, and category",
  accepted.status === "ok" &&
    Object.keys(accepted.discovery).sort().join(",") === "category,text,title",
);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log("\nall discovery checks passed");

function YEAR_IN(text: string): boolean {
  return /\b(?:1[0-9]{3}|20[0-9]{2})\b/.test(text);
}
