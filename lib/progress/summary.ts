import "server-only";

import { progressXpTotal } from "@/lib/progress/reward-read";
import { readProfileXpTotal } from "@/lib/progress/rewards";
import { getProfileId } from "@/lib/profile";
import { displayedSkillMastery } from "@/lib/progress/mastery-evidence";
import {
  completedSidequests,
  skillProgressFromAttempts,
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
 *
 * XP is summed from quest_rewards. A missing row is 0. A missing table
 * or store failure is not treated as "no reward"; it is logged and the
 * rest of Progress still renders at 0 XP rather than crashing.
 *
 * Skill-card mastery is recomputed on the server from attempts and
 * challenge metadata. Stored skill_progress.mastery_score is not trusted
 * for display, so a previous solve-rate of 100% after one Sidequest cannot
 * linger.
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

  const { data: attemptRows, error: attemptError } = await supabase
    .from("attempts")
    .select("challenge_id, is_correct, attempt_number, created_at")
    .eq("profile_id", profileId);

  if (attemptError !== null) {
    throw new Error(`Could not load attempts: ${attemptError.message}`);
  }

  const xpTotal = await readProfileXpTotal(profileId);
  const totalXp = progressXpTotal(xpTotal);

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

  const skillChallengeFacts =
    currentSkillIds.length === 0
      ? []
      : await (async () => {
          const { data, error } = await supabase
            .from("challenges")
            .select("id, skill_id, difficulty, generation_metadata")
            .in("skill_id", currentSkillIds);

          if (error !== null) {
            throw new Error(
              `Could not load skill challenges: ${error.message}`,
            );
          }

          return data ?? [];
        })();

  const attemptsByChallenge = new Map<string, SkillAttemptRow[]>();
  for (const attempt of attempts) {
    const current = attemptsByChallenge.get(attempt.challengeId) ?? [];
    current.push(attempt);
    attemptsByChallenge.set(attempt.challengeId, current);
  }

  const challengesBySkill = new Map<
    string,
    {
      id: string;
      difficulty: unknown;
      generationMetadata: unknown;
    }[]
  >();

  for (const row of skillChallengeFacts) {
    const list = challengesBySkill.get(row.skill_id) ?? [];
    list.push({
      id: row.id,
      difficulty: row.difficulty,
      generationMetadata: row.generation_metadata,
    });
    challengesBySkill.set(row.skill_id, list);
  }

  const skillProgress: SkillProgressRecord[] = [];

  if (grade !== null) {
    for (const skillRow of gradeSkills ?? []) {
      const skillCode = skillCodeById.get(skillRow.id);
      if (skillCode === undefined) continue;

      const facts = challengesBySkill.get(skillRow.id) ?? [];
      const skillAttempts: SkillAttemptRow[] = [];
      for (const fact of facts) {
        const rows = attemptsByChallenge.get(fact.id);
        if (rows !== undefined) skillAttempts.push(...rows);
      }

      const snapshot = skillProgressFromAttempts(skillAttempts);
      if (snapshot.totalAttempts <= 0) continue;

      const displayed = displayedSkillMastery({
        attempts: skillAttempts,
        challenges: facts,
        grade,
      });
      const lastPracticedAt =
        snapshot.totalAttempts > 0
          ? skillAttempts.reduce((latest, row) => {
              return row.createdAt > latest ? row.createdAt : latest;
            }, skillAttempts[0]!.createdAt)
          : null;

      skillProgress.push({
        skillCode,
        gradeLevel: grade,
        totalAttempts: snapshot.totalAttempts,
        correctAttempts: snapshot.correctAttempts,
        masteryScore: displayed.score,
        currentLevel: snapshot.currentLevel,
        lastPracticedAt,
      });
    }
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
