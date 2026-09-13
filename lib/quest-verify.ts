import "server-only";

import type { RegenerationHint } from "@/lib/ai/challenge";
import {
  ChallengeSchema,
  CorrectAnswerSchema,
  GenerationMetadataSchema,
  type ObjectAnalysis,
  ObjectAnalysisSchema,
  type QuestGenerationFailure,
  QuestGenerationFailureSchema,
  type ReadySkillFit,
  SkillFitAnalysisSchema,
} from "@/lib/ai/schemas";
import { copy } from "@/lib/copy";
import {
  guidanceForFailure,
  planAfterVerification,
  type VerificationReason,
  type VerificationResult,
  verifyChallenge,
} from "@/lib/math/verify";
import { generateQuestChallenge } from "@/lib/quest-challenge";
import { setQuestStatus } from "@/lib/quest-status";
import { createAdminClient } from "@/lib/supabase/admin";
import { type Grade, parseGrade, parseSkillId, type SkillId } from "@/lib/types";

/**
 * Deterministic verification of a stored candidate challenge.
 *
 * Callable by quest id. Reloads the reading, the investigation, and the
 * challenge row. Does not download the photograph. May call Challenge
 * Generation exactly once if the first candidate fails.
 *
 * A pass marks the quest ready. Two failures delete every candidate row
 * and mark the quest failed. The student never sees verifier detail.
 */

export type QuestVerificationResult =
  | { status: "ok" }
  | { status: "failed"; failure: QuestGenerationFailure };

type StoredChallenge = {
  id: string;
  question: string;
  correct_answer: unknown;
  solution: string | null;
  hint_1: string | null;
  hint_2: string | null;
  difficulty: number;
  object_connection: string | null;
  generation_metadata: unknown;
};

type LoadedContext = {
  status: "ok";
  analysis: ObjectAnalysis;
  fit: ReadySkillFit;
  skillId: SkillId;
  grade: Grade;
  challenge: StoredChallenge;
};

export async function verifyQuestChallenge(
  questId: string,
): Promise<QuestVerificationResult> {
  const loaded = await loadVerificationContext(questId);
  if (loaded.status === "already_ready") return { status: "ok" };
  if (loaded.status !== "ok") return loaded;

  const first = verifyLoaded(loaded);

  if (planAfterVerification(1, first) === "accept" && first.ok) {
    const marked = await setQuestStatus(questId, "ready");
    return marked ? { status: "ok" } : mathFailed();
  }

  const firstReason = first.ok ? "invalid_values" : first.reason;
  console.warn("[quest-verify] first candidate failed", firstReason);
  await deleteQuestChallenges(questId);

  const regenerated = await generateQuestChallenge(questId, {
    regeneration: hintFor(firstReason),
  });

  if (regenerated.status !== "ok") {
    await deleteQuestChallenges(questId);
    await setQuestStatus(questId, "failed");
    return mathFailed();
  }

  const secondLoad = await loadVerificationContext(questId);
  if (secondLoad.status === "already_ready") return { status: "ok" };
  if (secondLoad.status !== "ok") {
    await deleteQuestChallenges(questId);
    await setQuestStatus(questId, "failed");
    return mathFailed();
  }

  const second = verifyLoaded(secondLoad);

  if (planAfterVerification(2, second) === "accept" && second.ok) {
    const marked = await setQuestStatus(questId, "ready");
    return marked ? { status: "ok" } : mathFailed();
  }

  console.warn(
    "[quest-verify] second candidate failed",
    second.ok ? "invalid_values" : second.reason,
  );
  await deleteQuestChallenges(questId);
  await setQuestStatus(questId, "failed");
  return mathFailed();
}

async function loadVerificationContext(
  questId: string,
): Promise<
  | LoadedContext
  | { status: "already_ready" }
  | { status: "failed"; failure: QuestGenerationFailure }
> {
  const supabase = createAdminClient();

  const { data: quest, error: questError } = await supabase
    .from("quests")
    .select("id, status, object_metadata, validation_result, selected_skill_id")
    .eq("id", questId)
    .single();

  if (questError !== null || quest === null) {
    throw new Error(
      `No quest ${questId} to verify: ${questError?.message ?? "not found"}`,
    );
  }

  if (quest.status === "ready") {
    return { status: "already_ready" };
  }

  if (quest.status === "failed" || quest.status === "rejected") {
    return mathFailed();
  }

  const analysis = ObjectAnalysisSchema.safeParse(quest.object_metadata);
  const fitParsed = SkillFitAnalysisSchema.safeParse(quest.validation_result);

  if (!analysis.success || !fitParsed.success) {
    return mathFailed();
  }

  const fit = fitParsed.data;
  if (
    fit.challengeMode !== "direct" &&
    fit.challengeMode !== "grounded_scenario"
  ) {
    return mathFailed();
  }

  const { data: skill, error: skillError } = await supabase
    .from("skills")
    .select("id, skill_code, grade_level")
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
    return mathFailed();
  }

  const { data: rows, error: challengeError } = await supabase
    .from("challenges")
    .select(
      "id, question, correct_answer, solution, hint_1, hint_2, difficulty, object_connection, generation_metadata",
    )
    .eq("quest_id", questId)
    .order("created_at", { ascending: false });

  if (challengeError !== null) {
    throw new Error(
      `Could not load challenges for quest ${questId}: ${challengeError.message}`,
    );
  }

  const challenge = rows?.[0];
  if (challenge === undefined || (rows?.length ?? 0) !== 1) {
    console.warn("[quest-verify] expected exactly one candidate", {
      questId,
      count: rows?.length ?? 0,
    });
    return mathFailed();
  }

  return {
    status: "ok",
    analysis: analysis.data,
    fit,
    skillId,
    grade,
    challenge,
  };
}

function verifyLoaded(loaded: LoadedContext): VerificationResult {
  const metadata = GenerationMetadataSchema.safeParse(
    loaded.challenge.generation_metadata,
  );
  const answer = CorrectAnswerSchema.safeParse(loaded.challenge.correct_answer);

  if (!metadata.success || !answer.success) {
    return {
      ok: false,
      reason: "invalid_values",
      detail: "The stored candidate was missing structured generation metadata.",
    };
  }

  const parsed = ChallengeSchema.safeParse({
    question: loaded.challenge.question,
    skillCode: loaded.skillId,
    correctAnswer: answer.data,
    solution: loaded.challenge.solution ?? "",
    hint1: loaded.challenge.hint_1 ?? "",
    hint2: loaded.challenge.hint_2 ?? "",
    difficulty: loaded.challenge.difficulty,
    objectConnection: loaded.challenge.object_connection ?? "",
    valuesUsed: metadata.data.valuesUsed,
    verificationStrategy: metadata.data.verificationStrategy,
    computation: metadata.data.computation,
  });

  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid_values",
      detail: "The stored candidate did not match ChallengeSchema.",
    };
  }

  return verifyChallenge({
    challenge: parsed.data,
    analysis: loaded.analysis,
    fit: loaded.fit,
    skillId: loaded.skillId,
    grade: loaded.grade,
  });
}

async function deleteQuestChallenges(questId: string) {
  const { error } = await createAdminClient()
    .from("challenges")
    .delete()
    .eq("quest_id", questId);

  if (error) {
    throw new Error(
      `Could not remove failed candidates for quest ${questId}: ${error.message}`,
    );
  }
}

function hintFor(reason: VerificationReason): RegenerationHint {
  return { reason, guidance: guidanceForFailure(reason) };
}

function mathFailed(): { status: "failed"; failure: QuestGenerationFailure } {
  return {
    status: "failed",
    failure: QuestGenerationFailureSchema.parse({
      reason: "invalid_math",
      studentMessage: copy.verify.failure,
      recommendedNextAction: "retry",
    }),
  };
}
