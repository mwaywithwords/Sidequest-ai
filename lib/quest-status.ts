import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  canTransition,
  QUEST_STATUSES,
  type QuestStatus,
} from "@/lib/quest-status-rules";

export type { QuestStatus };
export { canTransition, QUEST_STATUSES };

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
 * Closed states (ready, rejected, failed) are terminal. The write filters
 * on the current status so a late timeout or a retried stage cannot mark a
 * dead quest ready, or un-ready a verified one.
 */

/**
 * Best effort, deliberately.
 *
 * The status is how an outcome is remembered, but the typed result is what the
 * student is answered with, so a write that does not land must not turn into a
 * different outcome. Returns false when the row is already closed in a
 * different state, or when the write itself failed.
 */
export async function setQuestStatus(
  questId: string,
  status: QuestStatus,
): Promise<boolean> {
  const allowedFrom = QUEST_STATUSES.filter((from) => canTransition(from, status));

  const { data, error } = await createAdminClient()
    .from("quests")
    .update({ status })
    .eq("id", questId)
    .in("status", allowedFrom)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(`[quest-status] could not mark ${questId} ${status}`, error);
    return false;
  }

  return data !== null;
}
