import {
  masteryScore,
  type CompletedSidequest,
  type SkillProgressSnapshot,
} from "@/lib/progress/mastery";
import type { Grade } from "@/lib/types";

/**
 * Deterministic adaptation for the next Sidequest.
 *
 * This is not machine learning. It reads stored skill_progress and the last
 * few completed Sidequests, then returns a small, explainable profile.
 * Object grounding and Grade 3–5 verifier rules still decide whether a
 * generated challenge is allowed.
 */

export const SUPPORT_MASTERY_THRESHOLD = 0.4;
export const ADVANCING_MASTERY_THRESHOLD = 0.7;
export const COLD_START_COMPLETIONS = 3;
export const RECENT_OUTCOME_WINDOW = 3;
export const AUTO_MIN_DIFFICULTY = 1;
export const AUTO_MAX_DIFFICULTY = 4;

export type MasteryBand = "support" | "developing" | "advancing";
export type HintSupport = "strong" | "standard" | "light";
export type ComplexityPreference = "clean" | "standard" | "challenging";
export type RecentTrend =
  | "improving"
  | "mixed"
  | "struggling"
  | "insufficient_data";
export type AdaptiveDifficulty = 1 | 2 | 3 | 4;

export type AdaptiveProfile = {
  masteryBand: MasteryBand;
  targetDifficulty: AdaptiveDifficulty;
  hintSupport: HintSupport;
  complexity: ComplexityPreference;
  recentTrend: RecentTrend;
};

export type AdaptationInput = {
  grade: Grade;
  progress: SkillProgressSnapshot | null;
  recentOutcomes: readonly boolean[];
};

const BAND_GUIDANCE: Record<
  MasteryBand,
  {
    minDifficulty: AdaptiveDifficulty;
    maxDifficulty: AdaptiveDifficulty;
    hintSupport: HintSupport;
    complexity: ComplexityPreference;
  }
> = {
  support: {
    minDifficulty: 1,
    maxDifficulty: 2,
    hintSupport: "strong",
    complexity: "clean",
  },
  developing: {
    minDifficulty: 2,
    maxDifficulty: 3,
    hintSupport: "standard",
    complexity: "standard",
  },
  advancing: {
    minDifficulty: 3,
    maxDifficulty: 4,
    hintSupport: "light",
    complexity: "challenging",
  },
};

/**
 * On-level difficulty when the student has no recorded history.
 * Grade 3 starts a little easier.
 */
export function gradeDefaultDifficulty(grade: Grade): AdaptiveDifficulty {
  return grade === 3 ? 2 : 3;
}

export function masteryBandFromScore(score: number): MasteryBand {
  if (score < SUPPORT_MASTERY_THRESHOLD) return "support";
  if (score <= ADVANCING_MASTERY_THRESHOLD) return "developing";
  return "advancing";
}

export function recentOutcomesFromCompleted(
  completed: readonly CompletedSidequest[],
): boolean[] {
  return completed
    .slice(-RECENT_OUTCOME_WINDOW)
    .map((quest) => quest.solved);
}

export function recentTrendFromOutcomes(
  recentOutcomes: readonly boolean[],
): RecentTrend {
  const recent = recentOutcomes.slice(-RECENT_OUTCOME_WINDOW);
  if (recent.length < RECENT_OUTCOME_WINDOW) return "insufficient_data";
  if (recent.every(Boolean)) return "improving";
  if (recent.every((solved) => !solved)) return "struggling";
  return "mixed";
}

/**
 * Recent performance may nudge difficulty by at most one level.
 * Mixed results, or fewer than three completed Sidequests, do nothing.
 */
export function recentDifficultyAdjustment(
  recentOutcomes: readonly boolean[],
): -1 | 0 | 1 {
  const trend = recentTrendFromOutcomes(recentOutcomes);
  if (trend === "improving") return 1;
  if (trend === "struggling") return -1;
  return 0;
}

export function getAdaptiveProfile(input: AdaptationInput): AdaptiveProfile {
  const completed = input.progress?.totalAttempts ?? 0;
  const recent = input.recentOutcomes.slice(-RECENT_OUTCOME_WINDOW);
  const recentTrend = recentTrendFromOutcomes(recent);
  const coldStart = completed < COLD_START_COMPLETIONS;

  if (input.progress === null || completed <= 0) {
    return {
      masteryBand: "developing",
      targetDifficulty: gradeDefaultDifficulty(input.grade),
      hintSupport: "standard",
      complexity: "standard",
      recentTrend: "insufficient_data",
    };
  }

  // Fewer than three completed Sidequests is not enough to call the
  // student "struggling" or "advanced". Keep the band on-level so one
  // lucky or unlucky quest cannot reclassify them.
  // Displayed Progress mastery is a separate evidence score. Adaptation
  // keeps using the solve-rate of completed Sidequests so the two systems
  // cannot chase each other.
  const solveRate = masteryScore(
    input.progress.correctAttempts,
    input.progress.totalAttempts,
  );
  const masteryBand = coldStart
    ? "developing"
    : masteryBandFromScore(solveRate);

  const guidance = BAND_GUIDANCE[masteryBand];

  return {
    masteryBand,
    targetDifficulty: chooseTargetDifficulty({
      grade: input.grade,
      currentLevel: input.progress.currentLevel,
      completed,
      band: masteryBand,
      recent,
    }),
    hintSupport: guidance.hintSupport,
    complexity: guidance.complexity,
    recentTrend,
  };
}

/**
 * Server-side generation notes. These never go to the student.
 */
export function adaptationGenerationGuidance(profile: AdaptiveProfile): string {
  const hint =
    profile.hintSupport === "strong"
      ? 'Hint 1 should give a clearer conceptual direction. Example: "Start with the amount shown on your bottle, then subtract the amount poured out."'
      : profile.hintSupport === "light"
        ? "Hint 1 should be less explicit while still useful."
        : "Hint 1 should give a normal nudge.";

  const complexity =
    profile.complexity === "clean"
      ? "Prefer clean whole-number values when appropriate, smaller operands, and a simpler single-step application. Avoid unnecessary conversions or multi-step reasoning."
      : profile.complexity === "challenging"
        ? "Use more challenging grade-appropriate values. Add a second related step only when the selected skill and existing computation schema support it. Do not invent extra properties of the photographed object."
        : "Use a normal grade-level application with moderate numeric complexity.";

  return [
    `Target difficulty: ${profile.targetDifficulty}. Automatic generation uses 1 to 4 only.`,
    `Hint support: ${profile.hintSupport}. ${hint} Hint 2 stays stronger. Do not reveal the answer in Hint 1. Do not omit hints.`,
    `Numeric complexity: ${profile.complexity}. ${complexity}`,
    "OBJECT GROUNDING BEATS DIFFICULTY: if the object's real properties only support a simple problem, write that simple grounded problem. Extra numbers must be given_in_problem. Do not invent object facts to raise difficulty. Do not weaken the object/skill connection to hit a target.",
    "GRADE RULES BEAT DIFFICULTY: stay within the given grade. Difficulty does not unlock decimals, extra fraction denominators, conversions, or geometry the grade does not allow.",
  ].join("\n");
}

function chooseTargetDifficulty(input: {
  grade: Grade;
  currentLevel: number;
  completed: number;
  band: MasteryBand;
  recent: readonly boolean[];
}): AdaptiveDifficulty {
  const base = baseDifficulty(
    input.grade,
    input.currentLevel,
    input.completed,
  );
  const { minDifficulty, maxDifficulty } = BAND_GUIDANCE[input.band];

  if (input.completed < COLD_START_COMPLETIONS) {
    return base;
  }

  let candidate = base;
  if (candidate < minDifficulty) candidate += 1;
  else if (candidate > maxDifficulty) candidate -= 1;

  const recentAdj = recentDifficultyAdjustment(input.recent);
  const inBand =
    candidate >= minDifficulty && candidate <= maxDifficulty;

  if (inBand) {
    return clampAutoDifficulty(
      Math.min(maxDifficulty, Math.max(minDifficulty, candidate + recentAdj)),
    );
  }

  // Still approaching the band. Recent outcomes may help one more step
  // toward it, but cannot push the student further away.
  if (
    (candidate < minDifficulty && recentAdj > 0) ||
    (candidate > maxDifficulty && recentAdj < 0)
  ) {
    candidate += recentAdj;
  }

  return clampAutoDifficulty(candidate);
}

/**
 * Long-term current_level is the starting point. During cold start it is
 * blended with the grade default so one completion cannot drop a Grade 5
 * student from 3 to 1, or jump anyone to 4.
 */
function baseDifficulty(
  grade: Grade,
  currentLevel: number,
  completed: number,
): AdaptiveDifficulty {
  const gradeDefault = gradeDefaultDifficulty(grade);
  const level = usableCurrentLevel(currentLevel);

  if (level === null) return gradeDefault;

  const capped = clampAutoDifficulty(level);

  if (completed < COLD_START_COMPLETIONS) {
    if (capped > gradeDefault) {
      return clampAutoDifficulty(gradeDefault + 1);
    }
    if (capped < gradeDefault) {
      return clampAutoDifficulty(gradeDefault - 1);
    }
    return gradeDefault;
  }

  return capped;
}

function usableCurrentLevel(level: number): number | null {
  if (!Number.isInteger(level) || level < 1 || level > 5) return null;
  return level;
}

function clampAutoDifficulty(value: number): AdaptiveDifficulty {
  if (value <= AUTO_MIN_DIFFICULTY) return AUTO_MIN_DIFFICULTY;
  if (value >= AUTO_MAX_DIFFICULTY) return AUTO_MAX_DIFFICULTY;
  return value as AdaptiveDifficulty;
}
