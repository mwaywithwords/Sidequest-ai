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
  // needs_evidence and poor_fit. `object_metadata`, `identified_object` and
  // `image_path` are not in the update. 'ready' is not a status this stage
  // may set: a quest is ready when a valid challenge exists, and none does yet.
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

  // direct, grounded_scenario, and needs_evidence all stay 'pending'.
  // needs_evidence is an investigation waiting for one more observation, which
  // is still work waiting to happen rather than a finished or abandoned quest.

  return result;
}
