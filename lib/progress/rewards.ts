import "server-only";

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
): Promise<QuestReward | null> {
  const { data, error } = await createAdminClient()
    .from("quest_rewards")
    .select("xp, reason")
    .eq("profile_id", profileId)
    .eq("challenge_id", challengeId)
    .maybeSingle();

  if (error !== null) {
    console.error("[quest-rewards] could not read reward", error);
    return null;
  }

  return parseReward(data);
}

export async function readProfileXpTotal(profileId: string): Promise<number> {
  const { data, error } = await createAdminClient()
    .from("quest_rewards")
    .select("xp")
    .eq("profile_id", profileId);

  if (error !== null) {
    throw new Error(`Could not load XP: ${error.message}`);
  }

  return (data ?? []).reduce((sum, row) => {
    const xp = typeof row.xp === "number" ? row.xp : 0;
    if (!Number.isFinite(xp) || xp < 0) return sum;
    return sum + Math.floor(xp);
  }, 0);
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
    console.error("[quest-rewards] could not store reward", error);
  }

  const stored = await readQuestReward(input.profileId, input.challengeId);
  return stored ?? input.reward;
}

function parseReward(row: { xp: unknown; reason: unknown } | null): QuestReward | null {
  if (row === null) return null;
  if (typeof row.xp !== "number" || !Number.isFinite(row.xp)) return null;

  if (
    row.reason === "correct_attempt_1" ||
    row.reason === "correct_attempt_2" ||
    row.reason === "correct_attempt_3" ||
    row.reason === "solution_revealed"
  ) {
    return { xp: Math.floor(row.xp), reason: row.reason };
  }

  return null;
}
