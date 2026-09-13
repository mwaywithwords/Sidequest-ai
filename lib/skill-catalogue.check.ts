/**
 * Skill catalogue and seed integrity checks.
 *
 * Run with: npx tsx lib/skill-catalogue.check.ts
 *
 * These read the real seed SQL. They do not mock a passing lookup, and they
 * do not call a model or a live database.
 */

import { readFileSync } from "node:fs";
import {
  duplicateSkillCombinations,
  EXPECTED_SKILL_COMBINATIONS,
  isJwtIssuedAtFutureError,
  isSupportedMission,
  missingSkillCombinations,
  parseMission,
  seededSkillRowsFromSql,
  SKILL_SEED_MIGRATIONS,
  skillCombinationKey,
} from "@/lib/skill-catalogue";
import { GRADES, SKILL_IDS, parseGrade, parseSkillId } from "@/lib/types";

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
  "the application catalogue is 21 Grade 3–5 skill combinations",
  EXPECTED_SKILL_COMBINATIONS.length === 21 &&
    GRADES.length === 3 &&
    SKILL_IDS.length === 7,
);

for (const grade of GRADES) {
  for (const skillCode of SKILL_IDS) {
    check(
      `application catalogue includes Grade ${grade} / ${skillCode}`,
      isSupportedMission(grade, skillCode),
    );
  }
}

check(
  "Grade 4 / geometry is a supported application mission",
  isSupportedMission(4, "geometry") &&
    parseMission(4, "geometry")?.skillCode === "geometry",
);

const seeded = SKILL_SEED_MIGRATIONS.flatMap((relativePath) =>
  seededSkillRowsFromSql(readFileSync(relativePath, "utf8")),
);
const missing = missingSkillCombinations(seeded);

check(
  "seed SQL covers every expected Grade 3–5 combination",
  missing.length === 0,
);

if (missing.length > 0) {
  console.error(
    `  missing: ${missing.map((row) => skillCombinationKey(row.grade, row.skillCode)).join(", ")}`,
  );
}

for (const grade of GRADES) {
  for (const skillCode of SKILL_IDS) {
    check(
      `seed SQL includes Grade ${grade} / ${skillCode}`,
      seeded.some(
        (row) => row.grade === grade && row.skillCode === skillCode,
      ),
    );
  }
}

check(
  "Grade 4 / geometry resolves from the seed SQL",
  seeded.some((row) => row.grade === 4 && row.skillCode === "geometry"),
);

const originalSeed = seededSkillRowsFromSql(
  readFileSync("supabase/migrations/20260912190100_seed_skills.sql", "utf8"),
);

check(
  "the original seed migration already contains all 21 combinations",
  originalSeed.length === 21 &&
    missingSkillCombinations(originalSeed).length === 0 &&
    duplicateSkillCombinations(originalSeed).length === 0,
);

check(
  "ensure-catalogue migration does not introduce a new natural key",
  missingSkillCombinations(seeded).length === 0 &&
    new Set(seeded.map((row) => skillCombinationKey(row.grade, row.skillCode)))
      .size === 21,
);

check(
  "an unsupported grade is rejected before any skill lookup",
  parseGrade(6) === null && parseMission(6, "geometry") === null,
);

check(
  "an unsupported skill is rejected before any skill lookup",
  parseSkillId("algebra") === null && parseMission(4, "algebra") === null,
);

check(
  "Geometry display text is not a skill_code",
  parseSkillId("Geometry") === null && parseMission(4, "Geometry") === null,
);

check(
  "a JWT issued-at-future error is not treated as a missing skill row",
  isJwtIssuedAtFutureError({
    code: "PGRST303",
    message: "JWT issued at future",
  }) && !isJwtIssuedAtFutureError({ message: "JSON object requested, multiple (or no) rows returned" }),
);

if (failed > 0) {
  console.error(`\n${failed} skill catalogue check(s) failed`);
  process.exit(1);
}

console.log("\nall skill catalogue checks passed");
