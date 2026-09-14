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
import type { GenerationFailureStage, GenerationRunDiagnostic } from "@/lib/ai/generation-failure";
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
      attemptsUsed?: 1 | 2;
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
  | { status: "failed"; failure: QuestGenerationFailure; diagnostic?: GenerationRunDiagnostic };

export type ReadyQuestSections = {
  status: "ready";
  fit: ReadySkillFit;
  discovery: Discovery;
  contextualGrounding: ContextualPayload | null;
  challengeWire: WireChallenge | null;
};

export type QuestGenerationSections =
  | ReadyQuestSections
  | {
      status: "needsEvidence";
      fit: Extract<SkillFitResult, { status: "needsEvidence" }>["fit"];
    }
  | {
      status: "poorFit";
      fit: SkillFitAnalysis;
      failure: QuestGenerationFailure;
    }
  | {
      status: "failed";
      stage: GenerationFailureStage;
      failure: QuestGenerationFailure;
    };

/**
 * Validates the investigation and Discovery sections independently of
 * the challenge candidate. A ready path with a broken challenge can
 * keep these values for a challenge-only retry.
 */
export function finalizeQuestSections(
  wire: QuestGenerationWire,
  {
    analysis,
    skillId,
  }: {
    analysis: ObjectAnalysis;
    skillId: SkillId;
  },
): QuestGenerationSections {
  const investigation = finalizeSkillFit(wire.investigation, analysis, skillId);

  if (investigation.status === "failed") {
    return {
      status: "failed",
      stage: "generation_schema_failure",
      failure: investigation.failure,
    };
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
    return {
      status: "failed",
      stage: "generation_schema_failure",
      failure: generationFailed().failure,
    };
  }

  const discovery = finalizeDiscovery(wire.discovery, analysis);
  if (discovery.status !== "ok") {
    return {
      status: "failed",
      stage: "generation_schema_failure",
      failure: generationFailed().failure,
    };
  }

  const contextualGrounding =
    fit.challengeMode === "inspired_math"
      ? buildContextualPayload(analysis, fit.inspirationContext)
      : null;

  return {
    status: "ready",
    fit,
    discovery: discovery.discovery,
    contextualGrounding,
    challengeWire: wire.challenge,
  };
}

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
  const sections = finalizeQuestSections(wire, { analysis, skillId });

  if (sections.status === "failed") {
    return { status: "failed", failure: sections.failure };
  }

  if (sections.status === "needsEvidence") {
    return { status: "needsEvidence", fit: sections.fit };
  }

  if (sections.status === "poorFit") {
    return {
      status: "poorFit",
      fit: sections.fit,
      failure: sections.failure,
    };
  }

  if (sections.challengeWire === null) {
    return generationFailed();
  }

  const finalized: ChallengeFinalization = finalizeChallenge(
    sections.challengeWire,
    {
      analysis,
      fit: sections.fit,
      skillId,
      grade,
      studentEvidence: [],
      contextualGrounding: sections.contextualGrounding,
    },
  );

  const challenge = resultFromFinalization(finalized, skillId);

  if (challenge.status === "failed") {
    if (finalized.status === "generation_failure") {
      console.error(
        "[quest-pipeline]",
        JSON.stringify({
          stage: "candidate_1_schema",
          status: "failed",
          failureCode: finalized.issue.code,
          path: finalized.issue.path,
          computationType: sections.challengeWire.computation.type,
          answerType: sections.challengeWire.correctAnswer.type,
          challengeMode: sections.fit.challengeMode,
        }),
      );
    }
    return challenge;
  }

  if (challenge.status === "poorFit") {
    return {
      status: "poorFit",
      fit: sections.fit,
      failure: challenge.failure,
    };
  }

  return {
    status: "ok",
    fit: sections.fit,
    discovery: sections.discovery,
    challenge: challenge.challenge,
    contextualGrounding: sections.contextualGrounding,
  };
}

export function generationFailed(
  diagnostic?: GenerationRunDiagnostic,
): Extract<QuestGenerationResult, { status: "failed" }> {
  return {
    status: "failed",
    failure: QuestGenerationFailureSchema.parse({
      reason: "generation_failure",
      studentMessage: copy.challenge.failure,
      recommendedNextAction: "retry",
    }),
    ...(diagnostic === undefined ? {} : { diagnostic }),
  };
}
