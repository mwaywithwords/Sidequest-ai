import type { CorrectAnswer } from "@/lib/ai/schemas";
import { formatRevealedAnswer } from "@/lib/math/answer";

/**
 * Attempt limits, hint reveal, and the student-facing grade view.
 *
 * Three tries is enough to show Hint 1, Hint 2, then the path through
 * the problem — without turning a Sidequest into an unbounded quiz.
 */

export const MAX_ANSWER_ATTEMPTS = 3;
export const VISUAL_XP = 10;

export type StoredAttempt = {
  attemptNumber: number;
  isCorrect: boolean;
};

export type GradeEligibility =
  | { ok: true }
  | {
      ok: false;
      reason: "missing" | "unowned" | "not_ready" | "no_challenge";
    };

export type ChallengeProgress =
  | { status: "open" }
  | { status: "incorrect"; attemptNumber: number; hint: string | null }
  | {
      status: "correct";
      attemptNumber: number;
      xp: number;
      explanation: string;
      revealedAnswer: string;
    }
  | {
      status: "complete";
      attemptNumber: number;
      explanation: string;
      solution: string;
      revealedAnswer: string;
    };

export type GradeView =
  | ChallengeProgress
  | { status: "invalid"; reason: "blank" | "malformed" | "zero_denominator" }
  | { status: "unavailable" };

/**
 * What the browser is allowed to see after a submission.
 *
 * Invalid reason codes stay on the server. The UI already has one
 * student-safe sentence for a bad number and one for a bad fraction.
 */
export type StudentGradeView =
  | ChallengeProgress
  | { status: "invalid" }
  | { status: "unavailable" };

export function toStudentGradeView(view: GradeView): StudentGradeView {
  if (view.status === "invalid") return { status: "invalid" };
  return view;
}

export function questIsGradeable(input: {
  exists: boolean;
  owned: boolean;
  status: string;
  challengeCount: number;
}): GradeEligibility {
  if (!input.exists) return { ok: false, reason: "missing" };
  if (!input.owned) return { ok: false, reason: "unowned" };
  if (input.status !== "ready") return { ok: false, reason: "not_ready" };
  if (input.challengeCount !== 1) return { ok: false, reason: "no_challenge" };
  return { ok: true };
}

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

/**
 * Whether this particular submission used a hint.
 *
 * After the first miss the server leaves Hint 1 on screen, so later
 * attempts count as hint_used even if the student does not tap Hint
 * again. The first attempt is hint_used only when they opened Hint 1
 * before sending.
 */
export function hintUsedForAttempt(
  attemptNumber: number,
  clientHintRevealed: boolean,
): boolean {
  return attemptNumber > 1 || clientHintRevealed;
}

export function hintForIncorrectAttempt(
  attemptNumber: number,
  hint1: string | null,
  hint2: string | null,
): string | null {
  if (attemptNumber <= 1) return emptyToNull(hint1);
  return emptyToNull(hint2) ?? emptyToNull(hint1);
}

export function progressAfterAttempt(input: {
  isCorrect: boolean;
  attemptNumber: number;
  hint1: string | null;
  hint2: string | null;
  solution: string | null;
  expected: CorrectAnswer;
}): ChallengeProgress {
  const revealedAnswer = formatRevealedAnswer(input.expected);
  const explanation = emptyToNull(input.solution) ?? revealedAnswer;

  if (input.isCorrect) {
    return {
      status: "correct",
      attemptNumber: input.attemptNumber,
      xp: VISUAL_XP,
      explanation,
      revealedAnswer,
    };
  }

  if (input.attemptNumber >= MAX_ANSWER_ATTEMPTS) {
    return {
      status: "complete",
      attemptNumber: input.attemptNumber,
      explanation,
      solution: explanation,
      revealedAnswer,
    };
  }

  return {
    status: "incorrect",
    attemptNumber: input.attemptNumber,
    hint: hintForIncorrectAttempt(input.attemptNumber, input.hint1, input.hint2),
  };
}

export function progressFromAttempts(input: {
  attempts: readonly StoredAttempt[];
  hint1: string | null;
  hint2: string | null;
  solution: string | null;
  expected: CorrectAnswer;
}): ChallengeProgress {
  if (input.attempts.length === 0) return { status: "open" };

  const last = [...input.attempts].sort(
    (left, right) => left.attemptNumber - right.attemptNumber,
  )[input.attempts.length - 1];

  if (last === undefined) return { status: "open" };

  if (last.isCorrect) {
    return progressAfterAttempt({
      isCorrect: true,
      attemptNumber: last.attemptNumber,
      hint1: input.hint1,
      hint2: input.hint2,
      solution: input.solution,
      expected: input.expected,
    });
  }

  if (isChallengeComplete(input.attempts)) {
    return progressAfterAttempt({
      isCorrect: false,
      attemptNumber: Math.max(
        last.attemptNumber,
        MAX_ANSWER_ATTEMPTS,
      ),
      hint1: input.hint1,
      hint2: input.hint2,
      solution: input.solution,
      expected: input.expected,
    });
  }

  return progressAfterAttempt({
    isCorrect: false,
    attemptNumber: last.attemptNumber,
    hint1: input.hint1,
    hint2: input.hint2,
    solution: input.solution,
    expected: input.expected,
  });
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
