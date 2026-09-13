import {
  GRADES,
  type Grade,
  SKILL_IDS,
  type SkillId,
  parseGrade,
  parseSkillId,
} from "@/lib/types";

/**
 * The Grade 3–5 mission catalogue. One row per grade per skill_code.
 *
 * This is application configuration. The setup screen, request parser, and
 * `skills` seed must agree on these 21 combinations. A combination that is
 * missing from the seed is a deployment bug, not a reason to invent a row.
 */

export type SkillCombination = {
  grade: Grade;
  skillCode: SkillId;
};

export const EXPECTED_SKILL_COMBINATIONS: readonly SkillCombination[] =
  GRADES.flatMap((grade) =>
    SKILL_IDS.map((skillCode) => ({ grade, skillCode })),
  );

export const SKILL_SEED_MIGRATIONS = [
  "supabase/migrations/20260912190100_seed_skills.sql",
  "supabase/migrations/20260913120000_ensure_skill_catalogue.sql",
] as const;

const SEEDED_SKILL_ROW =
  /\(\s*'math'\s*,\s*(\d+)\s*,\s*'([a-z][a-z0-9_]*)'\s*,/g;

export function parseMission(
  gradeValue: unknown,
  skillValue: unknown,
): SkillCombination | null {
  const grade = parseGrade(gradeValue);
  const skillCode = parseSkillId(skillValue);
  if (grade === null || skillCode === null) return null;
  if (!isSupportedMission(grade, skillCode)) return null;
  return { grade, skillCode };
}

export function isSupportedMission(
  grade: Grade,
  skillCode: SkillId,
): boolean {
  return EXPECTED_SKILL_COMBINATIONS.some(
    (row) => row.grade === grade && row.skillCode === skillCode,
  );
}

export function seededSkillRowsFromSql(
  sql: string,
): readonly SkillCombination[] {
  const rows: SkillCombination[] = [];

  for (const match of sql.matchAll(SEEDED_SKILL_ROW)) {
    const grade = parseGrade(match[1]);
    const skillCode = parseSkillId(match[2]);
    if (grade === null || skillCode === null) {
      throw new Error(
        `Seed row is not a supported mission: grade=${match[1]} skill=${match[2]}`,
      );
    }
    rows.push({ grade, skillCode });
  }

  return rows;
}

export function missingSkillCombinations(
  rows: readonly SkillCombination[],
): SkillCombination[] {
  const seen = new Set(
    rows.map((row) => skillCombinationKey(row.grade, row.skillCode)),
  );

  return EXPECTED_SKILL_COMBINATIONS.filter(
    (row) => !seen.has(skillCombinationKey(row.grade, row.skillCode)),
  );
}

export function duplicateSkillCombinations(
  rows: readonly SkillCombination[],
): SkillCombination[] {
  const counts = new Map<string, SkillCombination>();
  const duplicates: SkillCombination[] = [];

  for (const row of rows) {
    const key = skillCombinationKey(row.grade, row.skillCode);
    if (counts.has(key)) {
      duplicates.push(row);
      continue;
    }
    counts.set(key, row);
  }

  return duplicates;
}

export function skillCombinationKey(
  grade: Grade,
  skillCode: SkillId,
): string {
  return `${grade}/${skillCode}`;
}

export function isJwtIssuedAtFutureError(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (error === null) return false;
  if (error.code === "PGRST303") return true;
  return (error.message ?? "").toLowerCase().includes("jwt issued at future");
}
