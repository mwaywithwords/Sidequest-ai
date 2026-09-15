/**
 * Scavenger-hunt photo suggestion checks.
 *
 * Run with: npx tsx lib/photo-suggestions.check.ts
 *
 * These do not call a model, start a quest, or touch suitability /
 * Skill Fit / grounding / verification. Suggestions are Scan copy only.
 */

import { inferSemanticPurpose } from "@/lib/ai/semantic-purpose";
import {
  PHOTO_SUGGESTION_CATALOGUE,
  parseHuntRecent,
  rememberHuntIds,
  serializeHuntRecent,
  suggestionMayRejectPhoto,
  suggestionsAreAllowlist,
  suggestionsForSkill,
  surpriseLine,
  surpriseSuggestion,
} from "@/lib/photo-suggestions";
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

check("suggestions are never an allowlist", suggestionsAreAllowlist() === false);

check(
  "an unsuggested lamp is not rejected",
  !PHOTO_SUGGESTION_CATALOGUE.some((item) => item.id === "lamp") &&
    suggestionMayRejectPhoto("lamp", ["drink", "shoes", "wallet"]) === false,
);

check(
  "an unsuggested lamp still has a semantic purpose for math",
  inferSemanticPurpose({
    objectName: "lamp",
    category: "household lighting",
    confidence: 0.9,
    visibleText: [],
    visibleMeasurements: [],
    countableProperties: [],
    shapeProperties: ["cylinder"],
    observableProperties: [],
  }).reason.length > 0,
);

for (const skillId of SKILL_IDS) {
  const first = suggestionsForSkill(skillId, { count: 3, start: 0 });
  check(
    `${skillId} has three hunt ideas`,
    first.length === 3 && first.every((item) => item.skills.includes(skillId)),
  );

  const rotated = suggestionsForSkill(skillId, { count: 3, start: 3 });
  check(
    `${skillId} hunt ideas rotate`,
    rotated.length === 3 &&
      rotated.map((item) => item.id).join(",") !==
        first.map((item) => item.id).join(","),
  );

  const surprise = surpriseSuggestion(skillId, {
    hiddenIds: first.map((item) => item.id),
    start: 0,
  });
  check(
    `${skillId} Surprise Me stays local and is not one of the three chips`,
    surprise.skills.includes(skillId) &&
      !first.some((item) => item.id === surprise.id) &&
      surpriseLine(surprise).startsWith("Can you find "),
  );
}

check(
  "Surprise Me does not invent a photographed object",
  surpriseLine(surpriseSuggestion("addition", { hiddenIds: [], start: 0 }))
    .includes("?") &&
    !surpriseLine(surpriseSuggestion("addition", { hiddenIds: [], start: 0 }))
      .toLowerCase()
      .includes("photographed"),
);

const remembered = rememberHuntIds({}, "addition", ["wallet", "book", "drink"]);
const again = suggestionsForSkill("addition", {
  excludeIds: remembered.addition,
  count: 3,
  start: 0,
});
check(
  "recent hunt ideas are skipped on the next rotation when enough remain",
  again.every((item) => !["wallet", "book", "drink"].includes(item.id)),
);

const stored = parseHuntRecent(
  serializeHuntRecent({ addition: ["wallet"], geometry: ["ball"] }),
);
check(
  "hunt rotation memory is local JSON, not a database row",
  stored.addition?.[0] === "wallet" && stored.geometry?.[0] === "ball",
);

check(
  "malformed hunt memory is ignored",
  Object.keys(parseHuntRecent("{not json")).length === 0,
);

const coverage: Record<SkillId, string[]> = {
  addition: [],
  subtraction: [],
  multiplication: [],
  division: [],
  fractions: [],
  measurement: [],
  geometry: [],
};
for (const item of PHOTO_SUGGESTION_CATALOGUE) {
  for (const skillId of item.skills) {
    coverage[skillId].push(item.id);
  }
}
for (const skillId of SKILL_IDS) {
  check(
    `${skillId} catalogue coverage is broader than one idea`,
    coverage[skillId].length >= 5,
  );
}

if (failed > 0) {
  console.error(`\n${failed} photo-suggestion checks failed`);
  process.exit(1);
}

console.log("\nall photo-suggestion checks passed");
