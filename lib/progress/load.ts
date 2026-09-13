import "server-only";

import type { SkillProgressInput } from "@/lib/ai/challenge-grounding";
import {
  recentOutcomesFromCompleted,
} from "@/lib/progress/adaptation";
import {
  completedSidequests,
  type SkillAttemptRow,
} from "@/lib/progress/mastery";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Load the stored skill_progress row and the last completed Sidequest
 * outcomes for one profile + skill.
 *
 * A missing progress row is not a pipeline failure. Adaptation then
 * treats the student as having no history and uses the grade default.
 */

export type AdaptationState = {
  progress: SkillProgressInput;
  recentOutcomes: boolean[];
};

export async function loadAdaptationState(
  profileId: string,
  skillId: string,
): Promise<AdaptationState> {
  const [progress, recentOutcomes] = await Promise.all([
    loadSkillProgress(profileId, skillId),
    loadRecentOutcomes(profileId, skillId),
  ]);

  if (progress === null) {
    return { progress: null, recentOutcomes: [] };
  }

  return { progress, recentOutcomes };
}

async function loadSkillProgress(
  profileId: string,
  skillId: string,
): Promise<SkillProgressInput> {
  const { data, error } = await createAdminClient()
    .from("skill_progress")
    .select("current_level, mastery_score, total_attempts, correct_attempts")
    .eq("profile_id", profileId)
    .eq("skill_id", skillId)
    .maybeSingle();

  if (error !== null) {
    console.warn("[adaptation] skill_progress unavailable", error);
    return null;
  }

  if (data === null) return null;

  return {
    currentLevel: data.current_level,
    masteryScore: Number(data.mastery_score),
    totalAttempts: data.total_attempts,
    correctAttempts: data.correct_attempts,
  };
}

async function loadRecentOutcomes(
  profileId: string,
  skillId: string,
): Promise<boolean[]> {
  const supabase = createAdminClient();

  const { data: skillChallenges, error: skillError } = await supabase
    .from("challenges")
    .select("id")
    .eq("skill_id", skillId);

  if (skillError !== null) {
    console.warn("[adaptation] recent-outcome challenges unavailable", skillError);
    return [];
  }

  const challengeIds = (skillChallenges ?? []).map((row) => row.id);
  if (challengeIds.length === 0) return [];

  const { data: rows, error } = await supabase
    .from("attempts")
    .select("is_correct, attempt_number, created_at, challenge_id")
    .eq("profile_id", profileId)
    .in("challenge_id", challengeIds);

  if (error !== null) {
    console.warn("[adaptation] recent-outcome attempts unavailable", error);
    return [];
  }

  const history: SkillAttemptRow[] = (rows ?? []).map((row) => ({
    challengeId: row.challenge_id,
    isCorrect: row.is_correct,
    attemptNumber: row.attempt_number,
    createdAt: row.created_at,
  }));

  return recentOutcomesFromCompleted(completedSidequests(history));
}
