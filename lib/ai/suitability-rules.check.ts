/**
 * Regression checks for the suitability evidence rule.
 *
 * Run with: npx tsx lib/ai/suitability-rules.check.ts
 *
 * These do not call a model. They replay the judgements the vision stage
 * has already been seen to make — a wallet filed as paraphernalia, a
 * protein shake filed as drug_content — and check that ordinary objects
 * cannot stay in a prohibited bucket without asserted visual evidence.
 */

import {
  DRUG_CONTENT_RULE,
  EVIDENCE_RULE,
  isDrugFocusedDescription,
  isOrdinaryConsumerProduct,
  isWeaponFocusedDescription,
  resolveSuitability,
  SUITABILITY_INSTRUCTIONS,
  WEAPON_RULE,
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
  confidence: SuitabilityJudgement["confidence"] = "high",
) {
  return resolveSuitability({
    verdict,
    confidence,
    note,
  });
}

// ---------------------------------------------------------------------------
// Ordinary objects must pass, even when the model guesses a prohibited bucket
// ---------------------------------------------------------------------------

check(
  "wallet is usable even when the model says drug_content",
  judged("brown leather wallet") === "appropriate",
);

check(
  "basketball is usable even when the model says drug_content",
  judged("orange basketball on a gym floor") === "appropriate",
);

check(
  "sneaker is usable even when the model says drug_content",
  judged("one sneaker with a visible size label") === "appropriate",
);

check(
  "protein shake is usable even when the model says drug_content",
  judged("protein shake bottle with nutrition labeling") === "appropriate",
);

check(
  "soda bottle is usable even when the model says drug_content",
  judged("soda bottle with a Nutrition Facts label") === "appropriate",
);

check(
  "backpack is usable even when the model says drug_content",
  judged("school backpack on a desk") === "appropriate",
);

check(
  "vitamin/supplement packaging is not automatically drug_content",
  judged("vitamin bottle and dietary supplement packaging") !== "drug_content",
);

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
  "nutrition label is usable",
  judged("close-up of a nutrition label listing grams and serving size") ===
    "appropriate",
);

check(
  "root beer is ordinary soda, not alcohol",
  judged("root beer bottle with a grocery label") === "appropriate",
);

check(
  "a correctly labelled usable grocery bottle stays usable",
  judged("Premier Protein shake bottle", "usable") === "appropriate",
);

check(
  "purse, keys, spoon, cup, book, and toy stay usable",
  [
    "small purse with a zipper",
    "set of house keys on a ring",
    "metal spoon on a table",
    "ceramic cup",
    "paperback book",
    "plastic toy car",
  ].every((note) => judged(note) === "appropriate"),
);

check(
  "household container and food packaging stay usable",
  judged("household container and food packaging on a counter") ===
    "appropriate",
);

check(
  "sports equipment is usable even when the model says weapon",
  judged("tennis racket and a basketball", "weapon") === "appropriate",
);

check(
  "kitchen knife in ordinary use is not a weapon",
  judged("chef's knife on a cutting board", "weapon") === "appropriate",
);

check(
  "scissors and a glue gun are not weapons",
  judged("craft scissors and a glue gun", "weapon") === "appropriate",
);

// ---------------------------------------------------------------------------
// Ambiguous ordinary-object descriptions prefer the everyday reading
// ---------------------------------------------------------------------------

check(
  "ambiguous container with no drug evidence is not drug_content",
  judged("unlabeled plastic bottle, no markings visible") !== "drug_content",
);

check(
  "wallet that could conceal drugs is still a wallet",
  judged("leather wallet that could conceal drugs") === "appropriate",
);

check(
  "wallet resembling drug paraphernalia is still a wallet",
  judged("leather wallet resembling drug paraphernalia") === "appropriate",
);

check(
  "bottle that might be used to store something stays usable",
  judged("ordinary bottle that might be used to store something") ===
    "appropriate",
);

check(
  "backpack possibly associated with drugs stays usable",
  judged("backpack possibly associated with drugs") === "appropriate",
);

check(
  "sneaker that could theoretically hide something stays usable",
  judged("sneaker that could theoretically hide drugs") === "appropriate",
);

check(
  "protein packaging that resembles medicine packaging stays usable",
  judged(
    "vitamin bottle resembling packaging used for medicine or supplements",
  ) === "appropriate",
);

check(
  "speculative alcohol guess on an ordinary bottle stays usable",
  judged("clear bottle that may be vodka") === "appropriate",
);

check(
  "a note that denies drugs is not drug_content",
  judged("brown leather wallet, no drugs visible") === "appropriate",
);

check(
  "drug helper does not fire on a speculative wallet note",
  !isDrugFocusedDescription("wallet resembling drug paraphernalia"),
);

check(
  "weapon helper does not fire on sports equipment",
  !isWeaponFocusedDescription("basketball and a tennis racket"),
);

// ---------------------------------------------------------------------------
// Asserted prohibited content still refuses
// ---------------------------------------------------------------------------

check(
  "clearly illegal/recreational drug imagery stays drug_content",
  judged("bag of marijuana and loose cannabis on a table") === "drug_content",
);

check(
  "drug paraphernalia stays drug_content",
  judged("bong and other drug paraphernalia on a desk") === "drug_content",
);

check(
  "clearly visible drug paraphernalia stays drug_content",
  judged("clearly visible drug paraphernalia") === "drug_content",
);

check(
  "wallet containing clearly visible drug paraphernalia is refused",
  judged("wallet containing clearly visible drug paraphernalia") ===
    "drug_content",
);

check(
  "alcohol remains drug_content",
  judged("open beer bottle and a shot of liquor") === "drug_content",
);

check(
  "clearly identifiable alcohol bottle is refused",
  judged("clearly identifiable vodka bottle") === "drug_content",
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
  "visible drugs stay drug_content even if a wallet is also in frame",
  judged("wallet containing visible marijuana") === "drug_content",
);

check(
  "clearly visible firearm stays weapon",
  judged("handgun on a table", "weapon") === "weapon",
);

check(
  "ammunition stays weapon",
  judged("box of ammunition next to a rifle", "usable") === "weapon",
);

check(
  "a usable verdict cannot wash out asserted alcohol",
  judged("open beer bottle", "usable") === "drug_content",
);

check(
  "negation of a different object does not wash out asserted alcohol",
  judged("this is not a toy, it is a beer bottle") === "drug_content",
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
  "person_focused is unchanged",
  judged("a child facing the camera", "person_focused") === "person_focused",
);

check(
  "unusable_image is unchanged",
  judged("severe blur, no object visible", "unusable_image") ===
    "unusable_image",
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
  "drug helper fires on asserted recreational drugs",
  isDrugFocusedDescription("bag of marijuana and loose cannabis on a table"),
);

check(
  "weapon helper fires on a handgun",
  isWeaponFocusedDescription("handgun on a table"),
);

// ---------------------------------------------------------------------------
// Prompt and code-side rule stay aligned
// ---------------------------------------------------------------------------

check(
  "prompt requires positive visual evidence, not speculative association",
  EVIDENCE_RULE.includes("positive visual evidence") &&
    EVIDENCE_RULE.includes("speculation") &&
    SUITABILITY_INSTRUCTIONS.includes("ordinary everyday object"),
);

check(
  "prompt reserves drug_content for actual drug-focused imagery",
  SUITABILITY_INSTRUCTIONS.includes("illegal or recreational drugs") &&
    SUITABILITY_INSTRUCTIONS.includes("drug paraphernalia") &&
    DRUG_CONTENT_RULE.includes("actually visible"),
);

check(
  "prompt tells the model not to use nutrition labels as drug evidence",
  DRUG_CONTENT_RULE.includes("Nutrition Facts") &&
    DRUG_CONTENT_RULE.includes("protein") &&
    DRUG_CONTENT_RULE.includes("vitamin"),
);

check(
  "prompt tells the model not to treat a wallet as drugs by association",
  DRUG_CONTENT_RULE.includes("wallet") &&
    DRUG_CONTENT_RULE.includes("theoretically"),
);

check(
  "prompt keeps ordinary tools out of weapon",
  WEAPON_RULE.includes("kitchen") && WEAPON_RULE.includes("sports equipment"),
);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log("\nall suitability rule checks passed");
