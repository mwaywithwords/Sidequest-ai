/**
 * Regression checks for the suitability drug_content rule.
 *
 * Run with: npx tsx lib/ai/suitability-rules.check.ts
 *
 * These do not call a model. They replay the judgements the vision stage
 * has already been seen to make — including the Premier Protein false
 * positive — and check that ordinary grocery products cannot stay in
 * drug_content.
 */

import {
  DRUG_CONTENT_RULE,
  isDrugFocusedDescription,
  isOrdinaryConsumerProduct,
  resolveSuitability,
  SUITABILITY_INSTRUCTIONS,
  type SuitabilityJudgement,
} from "@/lib/ai/suitability-rules";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

function judged(
  note: string,
  verdict: SuitabilityJudgement["verdict"] = "drug_content",
) {
  return resolveSuitability({
    verdict,
    confidence: "high",
    note,
  });
}

check(
  "Premier Protein bottle is usable even when the model says drug_content",
  judged("protein shake bottle with nutrition labeling") === "appropriate",
);

check(
  "protein powder container is usable",
  judged("tub of protein powder with a supplement facts panel") ===
    "appropriate",
);

check(
  "sports drink is usable",
  judged("sports drink bottle with electrolyte labeling") === "appropriate",
);

check(
  "ordinary soda bottle is usable",
  judged("soda bottle with a Nutrition Facts label") === "appropriate",
);

check(
  "nutrition label is usable",
  judged("close-up of a nutrition label listing grams and serving size") ===
    "appropriate",
);

check(
  "vitamin/supplement packaging is not automatically drug_content",
  judged("vitamin bottle and dietary supplement packaging") !== "drug_content",
);

check(
  "clearly illegal/recreational drug imagery stays drug_content",
  judged("bag of marijuana and loose cannabis on a table") === "drug_content",
);

check(
  "drug paraphernalia stays drug_content",
  judged("bong and other drug paraphernalia on a desk") === "drug_content",
);

check(
  "ambiguous container with no drug evidence is not drug_content",
  judged("unlabeled plastic bottle, no markings visible") !== "drug_content",
);

check(
  "a correctly labelled usable grocery bottle stays usable",
  judged("Premier Protein shake bottle", "usable") === "appropriate",
);

check(
  "alcohol remains drug_content",
  judged("open beer bottle and a shot of liquor") === "drug_content",
);

check(
  "tobacco and vapes remain drug_content",
  judged("vape pen and a pack of cigarettes") === "drug_content",
);

check(
  "a protein shake next to marijuana stays drug_content",
  judged("protein shake bottle beside a bag of marijuana") === "drug_content",
);

check(
  "prescription packaging is other, not drug_content",
  judged("prescription pill bottle with a pharmacy Rx label") === "other",
);

check(
  "low-confidence usable is still unusable_image",
  resolveSuitability({
    verdict: "usable",
    confidence: "low",
    note: "possibly a bottle",
  }) === "unusable_image",
);

check(
  "ordinary product helper recognises the observed Premier Protein note",
  isOrdinaryConsumerProduct("protein shake bottle with nutrition labeling"),
);

check(
  "drug helper does not fire on nutrition labeling",
  !isDrugFocusedDescription("protein shake bottle with nutrition labeling"),
);

check(
  "prompt reserves drug_content for actual drug-focused imagery",
  SUITABILITY_INSTRUCTIONS.includes("illegal or recreational drugs") &&
    SUITABILITY_INSTRUCTIONS.includes("drug paraphernalia"),
);

check(
  "prompt tells the model not to use nutrition labels as drug evidence",
  DRUG_CONTENT_RULE.includes("Nutrition Facts") &&
    DRUG_CONTENT_RULE.includes("protein") &&
    DRUG_CONTENT_RULE.includes("vitamin"),
);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log("\nall suitability rule checks passed");
