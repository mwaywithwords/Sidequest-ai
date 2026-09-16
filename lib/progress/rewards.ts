import "server-only";

import {
  classifyRewardStoreError,
  existingRewardForGrade,
  interpretRewardRead,
  interpretXpTotal,
  type RewardReadResult,
  type XpTotalResult,
} from "@/lib/progress/reward-read";
import type { QuestReward } from "@/lib/progress/xp";
import { createAdminClient } from "@/lib/supabase/admin";

const UNIQUE_VIOLATION = "23505";

/**
 * Append-only XP rows. Inserts are idempotent on (profile_id, challenge_id).
 * Totals are summed from these rows; nothing increments a profile counter.
 */

export async function readQuestReward(
  profileId: string,
  challengeId: string,
): Promise<RewardReadResult> {
  const { data, error } = await createAdminClient()
    .from("quest_rewards")
    .select("xp, reason")
    .eq("profile_id", profileId)
    .eq("challenge_id", challengeId)
    .maybeSingle();

  const result = interpretRewardRead({ data, error });
  if (result.status === "unavailable") {
    reportOptionalRewardFailure("read", result);
  }

  return result;
}

export async function readProfileXpTotal(
  profileId: string,
): Promise<XpTotalResult> {
  const { data, error } = await createAdminClient()
    .from("quest_rewards")
    .select("xp")
    .eq("profile_id", profileId);

  const result = interpretXpTotal({ data, error });
  if (result.status === "unavailable") {
    reportOptionalRewardFailure("total", result);
  }

  return result;
}

export async function persistQuestReward(input: {
  profileId: string;
  questId: string;
  challengeId: string;
  reward: QuestReward;
}): Promise<QuestReward | null> {
  const { error } = await createAdminClient()
    .from("quest_rewards")
    .upsert(
      {
        profile_id: input.profileId,
        quest_id: input.questId,
        challenge_id: input.challengeId,
        xp: input.reward.xp,
        reason: input.reward.reason,
      },
      { onConflict: "profile_id,challenge_id", ignoreDuplicates: true },
    );

  if (error !== null && error.code !== UNIQUE_VIOLATION) {
    reportStoreFailure(error);
    const stored = await readQuestReward(input.profileId, input.challengeId);
    return existingRewardForGrade(stored);
  }

  const stored = await readQuestReward(input.profileId, input.challengeId);
  return existingRewardForGrade(stored) ?? input.reward;
}

function reportOptionalRewardFailure(
  operation: "read" | "total",
  result: Extract<RewardReadResult, { status: "unavailable" }>,
): void {
  const label =
    result.failure === "schema"
      ? "[quest-rewards] schema unavailable"
      : "[quest-rewards] store unavailable";

  // Optional presentation data. console.error is intercepted as the Next.js
  // development overlay; a missing table is still a configuration error, not
  // "this student has no reward."
  console.warn(label, {
    operation,
    failure: result.failure,
    code: result.code,
    message: result.message,
  });
}

function reportStoreFailure(error: {
  code?: string;
  message?: string;
}): void {
  const failure = classifyRewardStoreError(error);
  if (failure === "schema") {
    console.warn("[quest-rewards] schema unavailable", {
      operation: "store",
      failure,
      code: error.code ?? null,
      message: error.message ?? "Could not store quest reward",
    });
    return;
  }

  console.error("[quest-rewards] could not store reward", error);
}
