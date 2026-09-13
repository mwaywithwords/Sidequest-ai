import "server-only";

import type { ObjectAnalysis } from "@/lib/ai/schemas";
import { analyzeSkillFit, type SkillFitResult } from "@/lib/ai/skill-fit";
import { setQuestStatus } from "@/lib/quest-status";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Grade, SkillId } from "@/lib/types";

/**
 * The math-investigation stage, run against a stored quest.
 *
 * Sits between the reading and discovery. It decides whether a challenge may
 * later be attempted, whether the quest should wait for one more observation,
 * or whether this object honestly cannot support the skill. Discovery only
 * runs when this stage returns a ready path.
 *
 * The reading arrives as an argument rather than being re-read from the row: it
 * has already been through `ObjectAnalysisSchema` in this request, and the
 * photograph is not touched again.
 */
export async function assessQuestSkillFit({
  questId,
  analysis,
  grade,
  skillId,
  skillDescription,
}: {
  questId: string;
  analysis: ObjectAnalysis;
  grade: Grade;
  skillId: SkillId;
  skillDescription: string | null;
}): Promise<SkillFitResult> {
  const result = await analyzeSkillFit({
    analysis,
    grade,
    skillId,
    skillDescription,
  });

  if (result.status === "failed") {
    await setQuestStatus(questId, "failed");

    return result;
  }

  // The investigation is kept for every path that produced one, including
  // investigation_math, inspired_math, and poor_fit. `object_metadata`,
  // `identified_object` and `image_path` are not in the update. 'ready' is
  // not a status this stage may set: a quest is ready when verification
  // accepts a challenge.
  const { error } = await createAdminClient()
    .from("quests")
    .update({ validation_result: result.fit })
    .eq("id", questId);

  if (error) {
    throw new Error(
      `Could not store the skill fit for quest ${questId}: ${error.message}`,
    );
  }

  if (result.status === "poorFit") {
    // 'rejected': investigated, and no honest path remained. Nothing downstream
    // may pick it up, and the student is told what to try instead.
    await setQuestStatus(questId, "rejected");
  }

  // object_math, investigation_math, and inspired_math all stay 'pending'.
  // investigation_math waits for one more observation. inspired_math is a
  // valid path stored for a later stage; this step does not generate from it.

  return result;
}
