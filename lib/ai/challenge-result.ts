import type { ChallengeFinalization } from "@/lib/ai/challenge-grounding";
import {
  type GeneratedChallenge,
  type QuestGenerationFailure,
  QuestGenerationFailureSchema,
} from "@/lib/ai/schemas";
import { copy } from "@/lib/copy";
import { getSkill } from "@/lib/skills";
import type { SkillId } from "@/lib/types";

export type ChallengeGenerationResult =
  | { status: "ok"; challenge: GeneratedChallenge }
  | { status: "poorFit"; failure: QuestGenerationFailure }
  | { status: "failed"; failure: QuestGenerationFailure };

export function resultFromFinalization(
  finalized: ChallengeFinalization,
  skillId: SkillId,
): ChallengeGenerationResult {
  if (finalized.status === "ok") {
    return { status: "ok", challenge: finalized.challenge };
  }

  if (finalized.status === "poor_fit") {
    return {
      status: "poorFit",
      failure: QuestGenerationFailureSchema.parse({
        reason: "poor_skill_fit",
        studentMessage: [
          copy.fit.noChallenge(getSkill(skillId).label.toLowerCase()),
          copy.fit.tryInstead(getSkill(skillId).lookFor),
        ].join(" "),
        recommendedNextAction: "find_different_object",
      }),
    };
  }

  if (finalized.status === "generation_failure") {
    console.warn("[challenge] challenge failed validation", {
      path: finalized.issue.path,
      code: finalized.issue.code,
    });
  } else {
    console.warn("[challenge] challenge failed validation", {
      path: "challenge",
      code: "invalid",
    });
  }

  return challengeFailed();
}

export function challengeFailed(): ChallengeGenerationResult {
  return {
    status: "failed",
    failure: QuestGenerationFailureSchema.parse({
      reason: "generation_failure",
      studentMessage: copy.challenge.failure,
      recommendedNextAction: "retry",
    }),
  };
}
