import { copy } from "@/lib/copy";
import {
  completedSidequests,
  type SkillAttemptRow,
} from "@/lib/progress/mastery";
import { getSkill } from "@/lib/skills";
import { SKILL_IDS, type Grade, type SkillId } from "@/lib/types";

/**
 * Student-facing progress summaries.
 *
 * These functions read stored completed-Sidequest counts and current_level,
 * and a server-recomputed mastery evidence score. They do not invent a
 * second mastery formula, and they never put database ids or answers into
 * the object the page renders.
 */

export const GROWING_MASTERY = 0.4;
export const STRONG_MASTERY = 0.7;
export const MIN_EXPLORER_LEVEL = 1;
export const MAX_EXPLORER_LEVEL = 5;

export type ExplorerLevel = 1 | 2 | 3 | 4 | 5;

export type SkillProgressRecord = {
  skillCode: SkillId;
  gradeLevel: Grade;
  totalAttempts: number;
  correctAttempts: number;
  masteryScore: number;
  currentLevel: number;
  lastPracticedAt: string | null;
};

export type DiscoveryQuest = {
  status: string;
  identifiedObject: string | null;
  completed: boolean;
};

export type PresentationInput = {
  grade: Grade | null;
  skillProgress: readonly SkillProgressRecord[];
  completedSidequestCount: number;
  totalXp: number;
  quests: readonly DiscoveryQuest[];
};

export type PresentedSkill = {
  skillId: SkillId;
  practiced: boolean;
  masteryPercent: number | null;
  status: string;
};

export type PresentedProgress = {
  explorerLevel: ExplorerLevel;
  totalXp: number;
  sidequestsCompleted: number;
  objectsDiscovered: number;
  hasProgress: boolean;
  skills: PresentedSkill[];
};

export function masteryPercent(score: number): number {
  if (!Number.isFinite(score)) return 0;
  const clamped = Math.min(1, Math.max(0, score));
  return Math.round(clamped * 100);
}

/**
 * Math Explorer Level is a presentation number, not a new stored rank.
 *
 * Take every practiced skill's existing current_level, average them, and
 * round to the nearest whole level. No practiced skills means Level 1 —
 * a beginner map, not a poor score.
 */
export function mathExplorerLevel(
  practicedLevels: readonly number[],
): ExplorerLevel {
  const usable = practicedLevels.filter(
    (level) => Number.isInteger(level) && level >= 1 && level <= 5,
  );

  if (usable.length === 0) return MIN_EXPLORER_LEVEL;

  const average = usable.reduce((sum, level) => sum + level, 0) / usable.length;
  return clampExplorerLevel(Math.round(average));
}

export function countCompletedSidequests(
  attempts: readonly SkillAttemptRow[],
): number {
  return completedSidequests(attempts).length;
}

export function normalizeDiscoveredObject(
  identifiedObject: string | null | undefined,
): string | null {
  const trimmed = identifiedObject?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/**
 * Distinct ready objects that became a completed Sidequest.
 * Rejected and failed uploads never count. The same object name,
 * compared case-insensitively, counts once.
 */
export function countDiscoveredObjects(
  quests: readonly DiscoveryQuest[],
): number {
  const names = new Set<string>();

  for (const quest of quests) {
    if (quest.status !== "ready" || !quest.completed) continue;
    const key = normalizeDiscoveredObject(quest.identifiedObject);
    if (key === null) continue;
    names.add(key);
  }

  return names.size;
}

export function presentProgress(input: PresentationInput): PresentedProgress {
  const practiced = currentGradeSkills(input.skillProgress, input.grade);
  const skills = SKILL_IDS.map((skillId) =>
    presentSkill(skillId, practiced.get(skillId) ?? null),
  );
  const completed = Math.max(0, Math.floor(input.completedSidequestCount));
  const xp = Math.max(0, Math.floor(Number.isFinite(input.totalXp) ? input.totalXp : 0));

  return {
    explorerLevel: mathExplorerLevel(
      [...practiced.values()].map((row) => row.currentLevel),
    ),
    totalXp: xp,
    sidequestsCompleted: completed,
    objectsDiscovered: countDiscoveredObjects(input.quests),
    hasProgress: completed > 0,
    skills,
  };
}

function presentSkill(
  skillId: SkillId,
  record: SkillProgressRecord | null,
): PresentedSkill {
  const label = getSkill(skillId).label;

  if (record === null || record.totalAttempts <= 0) {
    return {
      skillId,
      practiced: false,
      masteryPercent: null,
      status: copy.progress.skillStatus.unpracticed(label),
    };
  }

  const percent = masteryPercent(record.masteryScore);

  return {
    skillId,
    practiced: true,
    masteryPercent: percent,
    status: statusCopy(label, record.masteryScore),
  };
}

function statusCopy(label: string, masteryScore: number): string {
  if (masteryScore > STRONG_MASTERY) {
    return copy.progress.skillStatus.strong(label);
  }
  if (masteryScore >= GROWING_MASTERY) {
    return copy.progress.skillStatus.growing(label);
  }
  return copy.progress.skillStatus.needsPractice(label);
}

/**
 * Skill cards use the profile's current grade only. Grade 3 Addition and
 * Grade 5 Addition are different skill_progress rows and are not interchangeable.
 */
function currentGradeSkills(
  rows: readonly SkillProgressRecord[],
  grade: Grade | null,
): Map<SkillId, SkillProgressRecord> {
  const practiced = new Map<SkillId, SkillProgressRecord>();
  if (grade === null) return practiced;

  for (const row of rows) {
    if (row.gradeLevel !== grade) continue;
    if (row.totalAttempts <= 0) continue;
    practiced.set(row.skillCode, row);
  }

  return practiced;
}

function clampExplorerLevel(value: number): ExplorerLevel {
  if (value <= MIN_EXPLORER_LEVEL) return MIN_EXPLORER_LEVEL;
  if (value >= MAX_EXPLORER_LEVEL) return MAX_EXPLORER_LEVEL;
  return value as ExplorerLevel;
}
