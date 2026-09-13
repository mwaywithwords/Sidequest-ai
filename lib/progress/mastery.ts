import {
  isChallengeComplete,
  MAX_ANSWER_ATTEMPTS,
} from "@/lib/progress/outcome";

/**
 * Skill-progress rules for completed Sidequests.
 *
 * total_attempts counts finished Sidequests, not raw submissions, so a
 * three-try problem is one learning event. Totals and level are derived
 * from attempt history so a retried request cannot increment them twice.
 */

export const LEVEL_SAMPLE_THRESHOLD = 3;
export const LEVEL_UP_MASTERY = 0.8;
export const LEVEL_DOWN_MASTERY = 0.5;
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 5;

export type SkillAttemptRow = {
  challengeId: string;
  isCorrect: boolean;
  attemptNumber: number;
  createdAt: string;
};

export type CompletedSidequest = {
  challengeId: string;
  solved: boolean;
  completedAt: string;
};

export type SkillProgressSnapshot = {
  totalAttempts: number;
  correctAttempts: number;
  masteryScore: number;
  currentLevel: number;
};

export function masteryScore(correct: number, total: number): number {
  if (total <= 0) return 0;
  const score = correct / total;
  if (score < 0) return 0;
  if (score > 1) return 1;
  return score;
}

export function clampLevel(level: number): number {
  if (level < MIN_LEVEL) return MIN_LEVEL;
  if (level > MAX_LEVEL) return MAX_LEVEL;
  return level;
}

/**
 * Walk completed Sidequests in time order, applying +1 / −1 only after
 * the sample threshold. Starting level is 1, matching the table default.
 *
 * Replaying the same history always yields the same level, which is what
 * stops a double-submit from climbing twice.
 */
export function levelFromHistory(solvedInOrder: readonly boolean[]): number {
  let level = MIN_LEVEL;

  for (let index = 0; index < solvedInOrder.length; index += 1) {
    const completed = index + 1;
    if (completed < LEVEL_SAMPLE_THRESHOLD) continue;

    const correct = solvedInOrder.slice(0, completed).filter(Boolean).length;
    const mastery = masteryScore(correct, completed);

    if (mastery >= LEVEL_UP_MASTERY) level += 1;
    else if (mastery < LEVEL_DOWN_MASTERY) level -= 1;

    level = clampLevel(level);
  }

  return level;
}

export function completedSidequests(
  attempts: readonly SkillAttemptRow[],
): CompletedSidequest[] {
  const byChallenge = new Map<string, SkillAttemptRow[]>();

  for (const attempt of attempts) {
    const current = byChallenge.get(attempt.challengeId) ?? [];
    current.push(attempt);
    byChallenge.set(attempt.challengeId, current);
  }

  const completed: CompletedSidequest[] = [];

  for (const [challengeId, rows] of byChallenge) {
    const stored = rows.map((row) => ({
      attemptNumber: row.attemptNumber,
      isCorrect: row.isCorrect,
    }));

    if (!isChallengeComplete(stored)) continue;

    const solved = rows.some((row) => row.isCorrect);
    const completedAt = rows.reduce((latest, row) => {
      return row.createdAt > latest ? row.createdAt : latest;
    }, rows[0]!.createdAt);

    completed.push({ challengeId, solved, completedAt });
  }

  return completed.sort((left, right) =>
    left.completedAt < right.completedAt
      ? -1
      : left.completedAt > right.completedAt
        ? 1
        : left.challengeId.localeCompare(right.challengeId),
  );
}

export function skillProgressFromAttempts(
  attempts: readonly SkillAttemptRow[],
): SkillProgressSnapshot {
  const completed = completedSidequests(attempts);
  const correctAttempts = completed.filter((quest) => quest.solved).length;
  const totalAttempts = completed.length;

  return {
    totalAttempts,
    correctAttempts,
    masteryScore: masteryScore(correctAttempts, totalAttempts),
    currentLevel: levelFromHistory(completed.map((quest) => quest.solved)),
  };
}

export function shouldCountTowardProgress(
  previous: readonly { attemptNumber: number; isCorrect: boolean }[],
  inserted: { attemptNumber: number; isCorrect: boolean },
): boolean {
  if (isChallengeComplete(previous)) return false;
  return (
    inserted.isCorrect || inserted.attemptNumber >= MAX_ANSWER_ATTEMPTS
  );
}
