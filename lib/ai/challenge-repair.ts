import {
  type ChallengeContext,
  type ChallengeFinalization,
  SOLUTION_MAX,
  finalizeChallenge,
  type WireChallenge,
} from "@/lib/ai/challenge-grounding";
import type { GeneratedChallenge } from "@/lib/ai/schemas";
import { evaluateComputation } from "@/lib/math/evaluate";
import { deterministicSolution } from "@/lib/math/solution";
import { answersAgree, solutionAgreesWithAnswer } from "@/lib/math/verify";

/**
 * Presentation-level candidate repair.
 *
 * Grounding and arithmetic stay authoritative. This only replaces
 * student-facing solution prose when the structured computation already
 * independently verifies, and it never rewrites origins.
 */

export function prepareCandidateChallenge(
  wire: WireChallenge,
  context: ChallengeContext,
): ChallengeFinalization {
  const finalized = finalizeChallenge(wire, context);
  if (finalized.status !== "ok") return finalized;

  const solution = applyDeterministicSolution(finalized.challenge);
  return {
    status: "ok",
    challenge: solution.challenge,
    repairs: [
      ...finalized.repairs,
      ...(solution.repaired ? (["deterministic_solution"] as const) : []),
    ],
  };
}

export function applyDeterministicSolution(
  challenge: GeneratedChallenge,
): { challenge: GeneratedChallenge; repaired: boolean } {
  const evaluated = evaluateComputation(challenge.computation);
  if (!evaluated.ok) return { challenge, repaired: false };
  if (!answersAgree(evaluated.answer, challenge.correctAnswer)) {
    return { challenge, repaired: false };
  }

  const solution = deterministicSolution(
    challenge.computation,
    evaluated.answer,
  );
  if (solution === null) return { challenge, repaired: false };
  if (solution.length === 0 || solution.length > SOLUTION_MAX) {
    return { challenge, repaired: false };
  }
  if (!solutionAgreesWithAnswer(solution, evaluated.answer)) {
    return { challenge, repaired: false };
  }
  if (solution === challenge.solution) {
    return { challenge, repaired: false };
  }

  return {
    challenge: { ...challenge, solution },
    repaired: true,
  };
}
