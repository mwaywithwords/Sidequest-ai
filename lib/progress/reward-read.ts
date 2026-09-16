import { totalXp, type QuestReward } from "@/lib/progress/xp";

/**
 * Classify quest_rewards reads without talking to Supabase.
 *
 * A missing row is not a failure. A missing table is a deployment error
 * and must not be collapsed into "this student has no reward."
 */

export type RewardStoreFailure = "schema" | "database";

export type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export type RewardReadResult =
  | { status: "found"; reward: QuestReward }
  | { status: "absent" }
  | {
      status: "unavailable";
      failure: RewardStoreFailure;
      code: string | null;
      message: string;
    };

export type XpTotalResult =
  | { status: "ok"; total: number }
  | {
      status: "unavailable";
      failure: RewardStoreFailure;
      code: string | null;
      message: string;
    };

const SCHEMA_CODES = new Set(["PGRST205", "PGRST204", "42P01"]);

export function classifyRewardStoreError(
  error: PostgrestLikeError,
): RewardStoreFailure {
  const code = error.code?.trim() ?? "";
  if (SCHEMA_CODES.has(code)) return "schema";

  const haystack = [error.message, error.details, error.hint]
    .filter((part): part is string => typeof part === "string")
    .join(" ");

  if (
    /schema cache/i.test(haystack) ||
    /could not find the table/i.test(haystack) ||
    /relation .+ does not exist/i.test(haystack)
  ) {
    return "schema";
  }

  return "database";
}

export function interpretRewardRead(input: {
  data: { xp: unknown; reason: unknown } | null;
  error: PostgrestLikeError | null;
}): RewardReadResult {
  if (input.error !== null) {
    return unavailableRead(input.error);
  }

  if (input.data === null) return { status: "absent" };

  const reward = parseStoredReward(input.data);
  if (reward === null) {
    return {
      status: "unavailable",
      failure: "database",
      code: null,
      message: "Stored quest reward could not be parsed",
    };
  }

  return { status: "found", reward };
}

export function interpretXpTotal(input: {
  data: readonly { xp: unknown }[] | null;
  error: PostgrestLikeError | null;
}): XpTotalResult {
  if (input.error !== null) {
    return {
      status: "unavailable",
      failure: classifyRewardStoreError(input.error),
      code: codeOf(input.error),
      message: input.error.message?.trim() || "Could not load XP",
    };
  }

  return {
    status: "ok",
    total: totalXp(
      (input.data ?? []).flatMap((row) =>
        typeof row.xp === "number" ? [{ xp: row.xp }] : [],
      ),
    ),
  };
}

/**
 * XP the student-facing quest may show. Failures and missing rows are 0 —
 * never a calculated stand-in from attempts.
 */
export function presentationAwardedXp(result: RewardReadResult): number {
  return result.status === "found" ? result.reward.xp : 0;
}

export function existingRewardForGrade(
  result: RewardReadResult,
): QuestReward | null {
  return result.status === "found" ? result.reward : null;
}

export function progressXpTotal(result: XpTotalResult): number {
  return result.status === "ok" ? result.total : 0;
}

export function parseStoredReward(row: {
  xp: unknown;
  reason: unknown;
}): QuestReward | null {
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

function unavailableRead(error: PostgrestLikeError): RewardReadResult {
  return {
    status: "unavailable",
    failure: classifyRewardStoreError(error),
    code: codeOf(error),
    message: error.message?.trim() || "Could not read quest reward",
  };
}

function codeOf(error: PostgrestLikeError): string | null {
  const code = error.code?.trim();
  return code ? code : null;
}
