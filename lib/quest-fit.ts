import "server-only";

import type { ObjectAnalysis } from "@/lib/ai/schemas";
import { analyzeSkillFit, type SkillFitResult } from "@/lib/ai/skill-fit";
import { setQuestStatus } from "@/lib/quest-status";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Grade, SkillId } from "@/lib/types";

/**
 * The skill-fit stage, run against a stored quest.
 *
 * Sits between the reading and the challenge that does not exist yet, and its
 * only job is to decide whether that challenge is allowed to be attempted. The
 * reading arrives as an argument rather than being re-read from the row: it has
 * already been through `ObjectAnalysisSchema` in this request, and the
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

  // The judgement is kept either way, because it is the record of why this quest
  // did or did not go on. `object_metadata`, `identified_object` and
  // `image_path` are not in the update, and 'ready' is not a status this stage
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
    // 'rejected': read, judged, and found to hold no honest maths for this
    // mission. Nothing downstream may pick it up, and the student is told what
    // to try instead.
    await setQuestStatus(questId, "rejected");
  }

  return result;
}
