/**
 * Attempt limits shared by grading, mastery, and XP.
 *
 * Kept in a leaf module so XP policy can use the same complete/open
 * rules without importing the student-facing grade view.
 */

export const MAX_ANSWER_ATTEMPTS = 3;

export type StoredAttempt = {
  attemptNumber: number;
  isCorrect: boolean;
};

export function nextAttemptNumber(attempts: readonly StoredAttempt[]): number {
  if (attempts.length === 0) return 1;
  return Math.max(...attempts.map((attempt) => attempt.attemptNumber)) + 1;
}

export function isChallengeComplete(
  attempts: readonly StoredAttempt[],
): boolean {
  return attempts.some(
    (attempt) =>
      attempt.isCorrect || attempt.attemptNumber >= MAX_ANSWER_ATTEMPTS,
  );
}

export function canAcceptAttempt(
  attempts: readonly StoredAttempt[],
): boolean {
  return (
    !isChallengeComplete(attempts) &&
    nextAttemptNumber(attempts) <= MAX_ANSWER_ATTEMPTS
  );
}
