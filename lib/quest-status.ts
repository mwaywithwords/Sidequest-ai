import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * How a quest's progress through the pipeline is recorded.
 *
 * The five values are the ones `quests_status_known` allows, and they mean:
 *
 * - 'pending'    work is still waiting to happen: the photo has not been
 *                learned from yet, an investigation is waiting for one more
 *                observation, or a candidate challenge is waiting for
 *                deterministic verification.
 * - 'processing' picked up by a stage.
 * - 'ready'      a verified challenge exists. Only the verification stage
 *                may set this. Generation must not.
 * - 'rejected'   read successfully, but no honest maths came out of it. This is
 *                the student's cue to photograph something else.
 * - 'failed'     the pipeline itself did not work.
 *
 * The last two are the distinction the schema was built around, and keeping them
 * apart is what stops a later stage treating a dead end as work to retry.
 */
export type QuestStatus =
  | "pending"
  | "processing"
  | "ready"
  | "rejected"
  | "failed";

/**
 * Best effort, deliberately.
 *
 * The status is how an outcome is remembered, but the typed result is what the
 * student is answered with, so a write that does not land must not turn into a
 * different outcome.
 */
export async function setQuestStatus(questId: string, status: QuestStatus) {
  const { error } = await createAdminClient()
    .from("quests")
    .update({ status })
    .eq("id", questId);

  if (error) {
    console.error(`[quest-status] could not mark ${questId} ${status}`, error);
  }
}
