import "server-only";

import { readProfileXpTotal } from "@/lib/progress/rewards";
import { getProfileId } from "@/lib/profile";
import {
  completedSidequests,
  type SkillAttemptRow,
} from "@/lib/progress/mastery";
import {
  countCompletedSidequests,
  presentProgress,
  type DiscoveryQuest,
  type PresentedProgress,
  type SkillProgressRecord,
} from "@/lib/progress/presentation";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseGrade, parseSkillId } from "@/lib/types";

/**
 * Load the current anonymous profile's progress and shape it for /progress.
 *
 * Ownership is the HttpOnly profile cookie. The browser Supabase client
 * is not used: RLS has no policies, so the only safe read is the secret
 * key behind this boundary, after the profile match.
 */
export async function loadProgressSummary(): Promise<PresentedProgress> {
  const profileId = await getProfileId();
  if (profileId === null) {
    return presentProgress({
      grade: null,
      skillProgress: [],
      completedSidequestCount: 0,
      totalXp: 0,
      quests: [],
    });
  }

  const supabase = createAdminClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("grade_level")
    .eq("id", profileId)
    .maybeSingle();

  if (profileError !== null) {
    throw new Error(`Could not load profile: ${profileError.message}`);
  }

  const grade = parseGrade(profile?.grade_level);

  const { data: gradeSkills, error: gradeSkillError } =
    grade === null
      ? { data: [] as { id: string; skill_code: string }[], error: null }
      : await supabase
          .from("skills")
          .select("id, skill_code")
          .eq("grade_level", grade);

  if (gradeSkillError !== null) {
    throw new Error(`Could not load skills: ${gradeSkillError.message}`);
  }

  const currentSkillIds = (gradeSkills ?? []).map((row) => row.id);
  const skillCodeById = new Map<string, SkillProgressRecord["skillCode"]>();

  for (const row of gradeSkills ?? []) {
    const skillId = parseSkillId(row.skill_code);
    if (skillId !== null) skillCodeById.set(row.id, skillId);
  }

  const { data: progressRows, error: progressError } =
    currentSkillIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("skill_progress")
          .select(
            "skill_id, total_attempts, correct_attempts, mastery_score, current_level, last_practiced_at",
          )
          .eq("profile_id", profileId)
          .in("skill_id", currentSkillIds);

  if (progressError !== null) {
    throw new Error(
      `Could not load skill progress: ${progressError.message}`,
    );
  }

  const { data: attemptRows, error: attemptError } = await supabase
    .from("attempts")
    .select("challenge_id, is_correct, attempt_number, created_at")
    .eq("profile_id", profileId);

  if (attemptError !== null) {
    throw new Error(`Could not load attempts: ${attemptError.message}`);
  }

  const totalXp = await readProfileXpTotal(profileId);

  const { data: questRows, error: questError } = await supabase
    .from("quests")
    .select("id, status, identified_object")
    .eq("profile_id", profileId);

  if (questError !== null) {
    throw new Error(`Could not load quests: ${questError.message}`);
  }

  const attempts: SkillAttemptRow[] = (attemptRows ?? []).map((row) => ({
    challengeId: row.challenge_id,
    isCorrect: row.is_correct,
    attemptNumber: row.attempt_number,
    createdAt: row.created_at,
  }));

  const completedChallengeIds = new Set(
    completedSidequests(attempts).map((quest) => quest.challengeId),
  );

  const questIds = (questRows ?? []).map((row) => row.id);
  const completedQuestIds = new Set<string>();

  if (questIds.length > 0 && completedChallengeIds.size > 0) {
    const { data: challengeRows, error: challengeError } = await supabase
      .from("challenges")
      .select("id, quest_id")
      .in("quest_id", questIds);

    if (challengeError !== null) {
      throw new Error(
        `Could not load challenges: ${challengeError.message}`,
      );
    }

    for (const row of challengeRows ?? []) {
      if (completedChallengeIds.has(row.id)) {
        completedQuestIds.add(row.quest_id);
      }
    }
  }

  const skillProgress: SkillProgressRecord[] = [];

  for (const row of progressRows ?? []) {
    const skillCode = skillCodeById.get(row.skill_id);
    if (skillCode === undefined || grade === null) continue;

    skillProgress.push({
      skillCode,
      gradeLevel: grade,
      totalAttempts: row.total_attempts,
      correctAttempts: row.correct_attempts,
      masteryScore: Number(row.mastery_score),
      currentLevel: row.current_level,
      lastPracticedAt: row.last_practiced_at,
    });
  }

  const quests: DiscoveryQuest[] = (questRows ?? []).map((row) => ({
    status: row.status,
    identifiedObject: row.identified_object,
    completed: completedQuestIds.has(row.id),
  }));

  return presentProgress({
    grade,
    skillProgress,
    completedSidequestCount: countCompletedSidequests(attempts),
    totalXp,
    quests,
  });
}
