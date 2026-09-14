import type { CorrectAnswer } from "@/lib/ai/schemas";
import { formatRevealedAnswer } from "@/lib/math/answer";
import {
  MAX_ANSWER_ATTEMPTS,
  canAcceptAttempt,
  isChallengeComplete,
  nextAttemptNumber,
  type StoredAttempt,
} from "@/lib/progress/attempts";
import {
  XP_SOLUTION_REVEALED,
  xpAwardForCorrectAttempt,
} from "@/lib/progress/xp";

/**
 * Attempt limits, hint reveal, and the student-facing grade view.
 *
 * Three tries is enough to show Hint 1, Hint 2, then the path through
 * the problem — without turning a Sidequest into an unbounded quiz.
 */

export {
  MAX_ANSWER_ATTEMPTS,
  canAcceptAttempt,
  isChallengeComplete,
  nextAttemptNumber,
};
export type { StoredAttempt };

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
      xp: number;
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
      xp: xpAwardForCorrectAttempt(input.attemptNumber).xp,
      explanation,
      revealedAnswer,
    };
  }

  if (input.attemptNumber >= MAX_ANSWER_ATTEMPTS) {
    return {
      status: "complete",
      attemptNumber: input.attemptNumber,
      xp: XP_SOLUTION_REVEALED,
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
  awardedXp?: number | null;
}): ChallengeProgress {
  if (input.attempts.length === 0) return { status: "open" };

  const last = [...input.attempts].sort(
    (left, right) => left.attemptNumber - right.attemptNumber,
  )[input.attempts.length - 1];

  if (last === undefined) return { status: "open" };

  const view = last.isCorrect
    ? progressAfterAttempt({
        isCorrect: true,
        attemptNumber: last.attemptNumber,
        hint1: input.hint1,
        hint2: input.hint2,
        solution: input.solution,
        expected: input.expected,
      })
    : isChallengeComplete(input.attempts)
      ? progressAfterAttempt({
          isCorrect: false,
          attemptNumber: Math.max(
            last.attemptNumber,
            MAX_ANSWER_ATTEMPTS,
          ),
          hint1: input.hint1,
          hint2: input.hint2,
          solution: input.solution,
          expected: input.expected,
        })
      : progressAfterAttempt({
          isCorrect: false,
          attemptNumber: last.attemptNumber,
          hint1: input.hint1,
          hint2: input.hint2,
          solution: input.solution,
          expected: input.expected,
        });

  return applyAwardedXp(view, input.awardedXp);
}

/**
 * Overlay the persisted award. `undefined` keeps the policy amount
 * (fresh completion). `null` or a number is the stored total for this
 * Sidequest, including 0 for historical rows with no reward.
 */
export function applyAwardedXp(
  view: ChallengeProgress,
  awardedXp: number | null | undefined,
): ChallengeProgress {
  if (view.status !== "correct" && view.status !== "complete") return view;
  if (awardedXp === undefined) return view;
  const xp =
    awardedXp === null || !Number.isFinite(awardedXp)
      ? 0
      : Math.max(0, Math.floor(awardedXp));
  return { ...view, xp };
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
