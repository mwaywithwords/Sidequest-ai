import {
  canAcceptAttempt,
  isChallengeComplete,
  type StoredAttempt,
} from "@/lib/progress/attempts";

/**
 * Persistent Sidequest XP. Motivation only — mastery, level, and
 * adaptation never read these amounts.
 *
 * Amounts are computed from trusted stored attempts. A browser-supplied
 * attempt number or XP value is not an input.
 */

export const XP_CORRECT_ATTEMPT_1 = 10;
export const XP_CORRECT_ATTEMPT_2 = 7;
export const XP_CORRECT_ATTEMPT_3 = 5;
export const XP_SOLUTION_REVEALED = 2;

export type XpReason =
  | "correct_attempt_1"
  | "correct_attempt_2"
  | "correct_attempt_3"
  | "solution_revealed";

export type QuestReward = {
  xp: number;
  reason: XpReason;
};

export type XpGradeDecision =
  | { persist: false; reward: QuestReward | null }
  | { persist: true; reward: QuestReward };

/**
 * XP for a correct answer, based on which numbered try solved it.
 *
 * Attempt 3 or later still maps to the third-try amount because the
 * grader never accepts a fourth try.
 */
export function xpAwardForCorrectAttempt(attemptNumber: number): QuestReward {
  if (attemptNumber <= 1) {
    return { xp: XP_CORRECT_ATTEMPT_1, reason: "correct_attempt_1" };
  }
  if (attemptNumber === 2) {
    return { xp: XP_CORRECT_ATTEMPT_2, reason: "correct_attempt_2" };
  }
  return { xp: XP_CORRECT_ATTEMPT_3, reason: "correct_attempt_3" };
}

/**
 * XP for a finished Sidequest, or null while it is still open.
 *
 * Correct on try 1 / 2 / 3 → 10 / 7 / 5. Three misses that reveal the
 * solution → 2. The completing attempt is the first correct row, else
 * the last stored miss once the challenge is complete.
 */
export function xpForCompletedSidequest(
  attempts: readonly StoredAttempt[],
): QuestReward | null {
  if (!isChallengeComplete(attempts)) return null;

  const ordered = [...attempts].sort(
    (left, right) => left.attemptNumber - right.attemptNumber,
  );
  const solved = ordered.find((attempt) => attempt.isCorrect);
  if (solved !== undefined) {
    return xpAwardForCorrectAttempt(solved.attemptNumber);
  }

  return { xp: XP_SOLUTION_REVEALED, reason: "solution_revealed" };
}

export function totalXp(rewards: readonly { xp: number }[]): number {
  return rewards.reduce((sum, reward) => {
    if (!Number.isFinite(reward.xp) || reward.xp < 0) return sum;
    return sum + Math.floor(reward.xp);
  }, 0);
}

/**
 * Whether this grading request may write a reward row.
 *
 * Persist only when the challenge was still open at the start of the
 * request. Unique-constraint races of that open request still persist
 * (the unique key is the lock). Revisiting a completed Sidequest —
 * including historical ones with no reward row — does not backfill.
 */
export function xpDecisionForGrade(input: {
  previousAttempts: readonly StoredAttempt[];
  nextAttempts: readonly StoredAttempt[];
  existingReward: QuestReward | null;
}): XpGradeDecision {
  if (input.existingReward !== null) {
    return { persist: false, reward: input.existingReward };
  }

  const computed = xpForCompletedSidequest(input.nextAttempts);
  if (computed === null) {
    return { persist: false, reward: null };
  }

  if (!canAcceptAttempt(input.previousAttempts)) {
    return { persist: false, reward: null };
  }

  return { persist: true, reward: computed };
}
