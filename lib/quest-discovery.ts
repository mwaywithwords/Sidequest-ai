import "server-only";

import {
  generateDiscovery,
  type DiscoveryResult,
} from "@/lib/ai/discovery";
import type { ObjectAnalysis, ReadySkillFit } from "@/lib/ai/schemas";
import { setQuestStatus } from "@/lib/quest-status";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Grade } from "@/lib/types";

/**
 * The discovery stage, run against a stored quest.
 *
 * Sits after a ready skill-fit and before a challenge that does not exist
 * yet. The reading and the investigation arrive as arguments: both have
 * already been through their schemas in this request, and the photograph is
 * not touched again.
 *
 * On success it writes only `discovery`. `object_metadata`,
 * `validation_result`, `identified_object`, and `image_path` stay as they
 * are. Status stays `pending`: a quest is ready when a valid challenge
 * exists, and none does yet.
 */
export async function recordQuestDiscovery({
  questId,
  analysis,
  fit,
  grade,
}: {
  questId: string;
  analysis: ObjectAnalysis;
  fit: ReadySkillFit;
  grade: Grade;
}): Promise<DiscoveryResult> {
  const result = await generateDiscovery({ analysis, fit, grade });

  if (result.status === "failed") {
    await setQuestStatus(questId, "failed");

    return result;
  }

  const { error } = await createAdminClient()
    .from("quests")
    .update({ discovery: result.discovery })
    .eq("id", questId);

  if (error) {
    throw new Error(
      `Could not store the discovery for quest ${questId}: ${error.message}`,
    );
  }

  return result;
}
