import "server-only";

import {
  ChallengeSchema,
  CorrectAnswerSchema,
  GenerationMetadataSchema,
  type ObjectAnalysis,
  ObjectAnalysisSchema,
  type QuestGenerationFailure,
  QuestGenerationFailureSchema,
  type ReadySkillFit,
  parseSkillFitAnalysis,
} from "@/lib/ai/schemas";
import { copy } from "@/lib/copy";
import {
  type VerificationResult,
  verifyChallenge,
} from "@/lib/math/verify";
import { setQuestStatus } from "@/lib/quest-status";
import { sanitiseZodIssues } from "@/lib/quest-trace";
import { createAdminClient } from "@/lib/supabase/admin";
import { type Grade, parseGrade, parseSkillId, type SkillId } from "@/lib/types";

/**
 * Deterministic verification of a stored candidate challenge.
 *
 * Callable by quest id. Reloads the reading, the investigation, and the
 * challenge row. Does not download the photograph. Regeneration now lives
 * in combined generation's one shared challenge-repair budget, so this
 * stage is a final gate only.
 *
 * A pass marks the quest ready. A failure deletes the candidate and
 * marks the quest failed. The student never sees verifier detail.
 */

export type QuestVerificationResult =
  | { status: "ok" }
  | { status: "failed"; failure: QuestGenerationFailure; code?: string };

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

  const verified = verifyLoaded(loaded);

  if (verified.ok) {
    const marked = await setQuestStatus(questId, "ready");
    return marked ? { status: "ok" } : mathFailed("status_update_failure");
  }

  console.error(
    "[quest-pipeline]",
    JSON.stringify({
      stage: "verification",
      status: "failed",
      failureCode: verified.reason,
    }),
  );
  await deleteQuestChallenges(questId);
  await setQuestStatus(questId, "failed");
  return mathFailed(verified.reason);
}

async function loadVerificationContext(
  questId: string,
): Promise<
  | LoadedContext
  | { status: "already_ready" }
  | { status: "failed"; failure: QuestGenerationFailure; code?: string }
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
    return mathFailed("quest_closed");
  }

  const analysis = ObjectAnalysisSchema.safeParse(quest.object_metadata);
  const fitParsed = parseSkillFitAnalysis(quest.validation_result);

  if (!analysis.success || !fitParsed.success) {
    return mathFailed("stored_context_invalid");
  }

  const fit = fitParsed.data;
  if (
    fit.challengeMode !== "object_math" &&
    fit.challengeMode !== "inspired_math"
  ) {
    return mathFailed("challenge_mode_not_ready");
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
    return mathFailed("skill_or_grade_invalid");
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
    console.error(
      "[quest-pipeline]",
      JSON.stringify({
        stage: "verification",
        status: "failed",
        failureCode: "candidate_count",
      }),
    );
    return mathFailed("candidate_count");
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
    ...(metadata.data.shapesUsed === undefined
      ? {}
      : { shapesUsed: metadata.data.shapesUsed }),
    verificationStrategy: metadata.data.verificationStrategy,
    computation: metadata.data.computation,
  });

  if (!parsed.success) {
    console.error(
      "[quest-pipeline]",
      JSON.stringify({
        stage: "verification",
        status: "failed",
        failureCode: "invalid_values",
        zodIssues: sanitiseZodIssues(parsed.error),
      }),
    );
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
    contextualGrounding: metadata.data.contextualGrounding ?? null,
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

function mathFailed(code?: string): {
  status: "failed";
  failure: QuestGenerationFailure;
  code?: string;
} {
  return {
    status: "failed",
    failure: QuestGenerationFailureSchema.parse({
      reason: "invalid_math",
      studentMessage: copy.verify.failure,
      recommendedNextAction: "retry",
    }),
    ...(code === undefined ? {} : { code }),
  };
}
