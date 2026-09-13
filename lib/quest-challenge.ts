import "server-only";

import {
  CHALLENGE_MODEL,
  generateChallenge,
  type ChallengeGenerationResult,
  type RegenerationHint,
} from "@/lib/ai/challenge";
import { buildContextualPayload } from "@/lib/ai/inspired-context";
import {
  ObjectAnalysisSchema,
  type GeneratedChallenge,
  type ReadySkillFit,
  QuestGenerationFailureSchema,
  parseSkillFitAnalysis,
} from "@/lib/ai/schemas";
import type { ContextualPayload } from "@/lib/ai/schemas";
import type { AdaptiveProfile } from "@/lib/progress/adaptation";
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

  if (
    quest.status === "failed" ||
    quest.status === "rejected" ||
    quest.status === "ready"
  ) {
    console.warn("[quest-challenge] refused to generate for a closed quest", {
      questId,
      status: quest.status,
    });

    return closed();
  }

  const { count: existingCount, error: existingError } = await supabase
    .from("challenges")
    .select("id", { count: "exact", head: true })
    .eq("quest_id", questId);

  if (existingError !== null) {
    throw new Error(
      `Could not count candidates for quest ${questId}: ${existingError.message}`,
    );
  }

  if ((existingCount ?? 0) > 0) {
    console.warn("[quest-challenge] refused to store a second candidate", {
      questId,
      count: existingCount,
    });

    return closed();
  }

  const analysis = ObjectAnalysisSchema.safeParse(quest.object_metadata);
  const fitParsed = parseSkillFitAnalysis(quest.validation_result);

  if (!analysis.success || !fitParsed.success) {
    await setQuestStatus(questId, "failed");

    return closed();
  }

  const fit = fitParsed.data;
  if (
    fit.challengeMode !== "object_math" &&
    fit.challengeMode !== "inspired_math"
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

  const contextualGrounding =
    readyFit.challengeMode === "inspired_math"
      ? buildContextualPayload(analysis.data, readyFit.inspirationContext)
      : null;

  const result = await generateChallenge({
    analysis: analysis.data,
    fit: readyFit,
    skillId,
    skillDescription: skill.description,
    grade,
    adaptation,
    contextualGrounding,
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

  await persistQuestChallenge({
    questId,
    skillRowId: skill.id,
    challenge: result.challenge,
    fit: readyFit,
    contextualGrounding,
    adaptation,
  });

  return result;
}

export async function persistQuestChallenge({
  questId,
  skillRowId,
  challenge,
  fit,
  contextualGrounding,
  adaptation,
}: {
  questId: string;
  skillRowId: string;
  challenge: GeneratedChallenge;
  fit: ReadySkillFit;
  contextualGrounding: ContextualPayload | null;
  adaptation: AdaptiveProfile;
}): Promise<void> {
  const { error: insertError } = await createAdminClient()
    .from("challenges")
    .insert({
      quest_id: questId,
      skill_id: skillRowId,
      question: challenge.question,
      correct_answer: challenge.correctAnswer,
      solution: challenge.solution,
      hint_1: challenge.hint1,
      hint_2: challenge.hint2,
      difficulty: challenge.difficulty,
      object_connection: challenge.objectConnection,
      generation_metadata: {
        valuesUsed: challenge.valuesUsed,
        ...(challenge.shapesUsed === undefined
          ? {}
          : { shapesUsed: challenge.shapesUsed }),
        computation: challenge.computation,
        verificationStrategy: challenge.verificationStrategy,
        model: CHALLENGE_MODEL,
        challengeMode: fit.challengeMode,
        ...(contextualGrounding === null ? {} : { contextualGrounding }),
        adaptation,
      },
    });

  if (insertError) {
    throw new Error(
      `Could not store the challenge for quest ${questId}: ${insertError.message}`,
    );
  }
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
