import "server-only";

import {
  CHALLENGE_MODEL,
  generateChallenge,
  type ChallengeGenerationResult,
  type RegenerationHint,
} from "@/lib/ai/challenge";
import {
  ObjectAnalysisSchema,
  type ReadySkillFit,
  QuestGenerationFailureSchema,
  SkillFitAnalysisSchema,
} from "@/lib/ai/schemas";
import { copy } from "@/lib/copy";
import { getAdaptiveProfile } from "@/lib/progress/adaptation";
import { loadAdaptationState } from "@/lib/progress/load";
import { setQuestStatus } from "@/lib/quest-status";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseGrade, parseSkillId } from "@/lib/types";

/**
 * Challenge Generation, run against a stored quest.
 *
 * Callable by quest id so the upload handler and a later worker share one
 * path. It reloads the validated reading and investigation from the row. It
 * does not download the photograph, and it does not call Object Analysis or
 * Skill Fit again.
 *
 * A success writes one `challenges` row and leaves the quest `pending`.
 * Generation produces a candidate. Verification — not this stage — is what
 * makes a challenge displayable and a quest ready.
 */

export async function generateQuestChallenge(
  questId: string,
  options?: { regeneration?: RegenerationHint },
): Promise<ChallengeGenerationResult> {
  const supabase = createAdminClient();

  const { data: quest, error: questError } = await supabase
    .from("quests")
    .select(
      "id, status, object_metadata, validation_result, selected_skill_id, profile_id",
    )
    .eq("id", questId)
    .single();

  if (questError !== null || quest === null) {
    throw new Error(
      `No quest ${questId} to generate from: ${questError?.message ?? "not found"}`,
    );
  }

  if (quest.status === "failed" || quest.status === "rejected") {
    console.warn("[quest-challenge] refused to generate for a closed quest", {
      questId,
      status: quest.status,
    });

    return closed();
  }

  const analysis = ObjectAnalysisSchema.safeParse(quest.object_metadata);
  const fitParsed = SkillFitAnalysisSchema.safeParse(quest.validation_result);

  if (!analysis.success || !fitParsed.success) {
    await setQuestStatus(questId, "failed");

    return closed();
  }

  const fit = fitParsed.data;
  if (
    fit.challengeMode !== "direct" &&
    fit.challengeMode !== "grounded_scenario"
  ) {
    console.warn("[quest-challenge] refused mode", fit.challengeMode);

    return closed();
  }

  const { data: skill, error: skillError } = await supabase
    .from("skills")
    .select("id, skill_code, grade_level, description")
    .eq("id", quest.selected_skill_id)
    .single();

  if (skillError !== null || skill === null) {
    throw new Error(
      `No skill row for quest ${questId}: ${skillError?.message ?? "not found"}`,
    );
  }

  const skillId = parseSkillId(skill.skill_code);
  const grade = parseGrade(skill.grade_level);

  if (skillId === null || grade === null) {
    await setQuestStatus(questId, "failed");

    return closed();
  }

  const readyFit = fit as ReadySkillFit;
  const { progress, recentOutcomes } = await loadAdaptationState(
    quest.profile_id,
    quest.selected_skill_id,
  );
  const adaptation = getAdaptiveProfile({
    grade,
    progress,
    recentOutcomes,
  });

  const result = await generateChallenge({
    analysis: analysis.data,
    fit: readyFit,
    skillId,
    skillDescription: skill.description,
    grade,
    adaptation,
    regeneration: options?.regeneration,
  });

  if (result.status === "failed") {
    await setQuestStatus(questId, "failed");

    return result;
  }

  if (result.status === "poorFit") {
    await setQuestStatus(questId, "rejected");

    return result;
  }

  const { error: insertError } = await supabase.from("challenges").insert({
    quest_id: questId,
    skill_id: skill.id,
    question: result.challenge.question,
    correct_answer: result.challenge.correctAnswer,
    solution: result.challenge.solution,
    hint_1: result.challenge.hint1,
    hint_2: result.challenge.hint2,
    difficulty: result.challenge.difficulty,
    object_connection: result.challenge.objectConnection,
    generation_metadata: {
      valuesUsed: result.challenge.valuesUsed,
      computation: result.challenge.computation,
      verificationStrategy: result.challenge.verificationStrategy,
      model: CHALLENGE_MODEL,
      challengeMode: readyFit.challengeMode,
      adaptation,
    },
  });

  if (insertError) {
    throw new Error(
      `Could not store the challenge for quest ${questId}: ${insertError.message}`,
    );
  }

  // Status stays pending. A stored candidate is not a verified challenge.

  return result;
}

function closed(): ChallengeGenerationResult {
  return {
    status: "failed",
    failure: QuestGenerationFailureSchema.parse({
      reason: "generation_failure",
      studentMessage: copy.challenge.failure,
      recommendedNextAction: "retry",
    }),
  };
}
