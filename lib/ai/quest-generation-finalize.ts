import {
  type ChallengeFinalization,
  type WireChallenge,
  finalizeChallenge,
} from "@/lib/ai/challenge-grounding";
import { resultFromFinalization } from "@/lib/ai/challenge-result";
import { finalizeDiscovery, type WireDiscovery } from "@/lib/ai/discovery-grounding";
import { buildContextualPayload } from "@/lib/ai/inspired-context";
import {
  type ContextualPayload,
  type Discovery,
  type GeneratedChallenge,
  type ObjectAnalysis,
  type QuestGenerationFailure,
  QuestGenerationFailureSchema,
  type ReadySkillFit,
  type SkillFitAnalysis,
} from "@/lib/ai/schemas";
import {
  finalizeSkillFit,
  type SkillFitResult,
  type SkillFitWire,
} from "@/lib/ai/skill-fit-finalize";
import { copy } from "@/lib/copy";
import type { Grade, SkillId } from "@/lib/types";

/**
 * Deterministic half of combined quest generation.
 *
 * The model may return investigation, discovery, and a challenge candidate
 * in one payload. This module parses each section into its existing
 * application schema. Discovery and a challenge are required only when a
 * ready challenge path proceeds. A malformed section fails the stage.
 */

export type QuestGenerationWire = {
  investigation: SkillFitWire;
  discovery: WireDiscovery | null;
  challenge: WireChallenge | null;
};

export type QuestGenerationResult =
  | {
      status: "ok";
      fit: ReadySkillFit;
      discovery: Discovery;
      challenge: GeneratedChallenge;
      contextualGrounding: ContextualPayload | null;
    }
  | {
      status: "needsEvidence";
      fit: Extract<SkillFitResult, { status: "needsEvidence" }>["fit"];
    }
  | {
      status: "poorFit";
      fit: SkillFitAnalysis;
      failure: QuestGenerationFailure;
    }
  | { status: "failed"; failure: QuestGenerationFailure };

export function finalizeQuestGeneration(
  wire: QuestGenerationWire,
  {
    analysis,
    skillId,
    grade,
  }: {
    analysis: ObjectAnalysis;
    skillId: SkillId;
    grade: Grade;
  },
): QuestGenerationResult {
  const investigation = finalizeSkillFit(wire.investigation, analysis, skillId);

  if (investigation.status === "failed") {
    return investigation;
  }

  if (investigation.status === "needsEvidence") {
    return { status: "needsEvidence", fit: investigation.fit };
  }

  if (investigation.status === "poorFit") {
    return {
      status: "poorFit",
      fit: investigation.fit,
      failure: investigation.failure,
    };
  }

  const fit = investigation.fit;

  if (wire.discovery === null) {
    console.warn("[quest-generation] discovery missing on a ready path");
    return generationFailed();
  }

  const discovery = finalizeDiscovery(wire.discovery, analysis);
  if (discovery.status !== "ok") {
    console.warn("[quest-generation] discovery failed validation");
    return generationFailed();
  }

  if (wire.challenge === null) {
    console.warn("[quest-generation] challenge missing on a ready path");
    return generationFailed();
  }

  const contextualGrounding =
    fit.challengeMode === "inspired_math"
      ? buildContextualPayload(analysis, fit.inspirationContext)
      : null;

  const finalized: ChallengeFinalization = finalizeChallenge(wire.challenge, {
    analysis,
    fit,
    skillId,
    grade,
    studentEvidence: [],
    contextualGrounding,
  });

  const challenge = resultFromFinalization(finalized, skillId);

  if (challenge.status === "failed") {
    if (finalized.status === "generation_failure") {
      console.warn("[quest-generation] challenge failed validation", {
        path: finalized.issue.path,
        code: finalized.issue.code,
        computationType: wire.challenge.computation.type,
        answerType: wire.challenge.correctAnswer.type,
        shapesUsedCount: wire.challenge.shapesUsed?.length ?? 0,
        valuesUsedCount: wire.challenge.valuesUsed.length,
        challengeMode: fit.challengeMode,
      });
    }
    return challenge;
  }

  if (challenge.status === "poorFit") {
    return {
      status: "poorFit",
      fit,
      failure: challenge.failure,
    };
  }

  return {
    status: "ok",
    fit,
    discovery: discovery.discovery,
    challenge: challenge.challenge,
    contextualGrounding,
  };
}

export function generationFailed(): QuestGenerationResult {
  return {
    status: "failed",
    failure: QuestGenerationFailureSchema.parse({
      reason: "generation_failure",
      studentMessage: copy.challenge.failure,
      recommendedNextAction: "retry",
    }),
  };
}
