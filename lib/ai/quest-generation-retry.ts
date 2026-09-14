import type { RegenerationHint } from "@/lib/ai/generation-failure";
import type { WireChallenge } from "@/lib/ai/challenge-grounding";
import { finalizeChallenge } from "@/lib/ai/challenge-grounding";
import {
  candidatePipelineStage,
  hintForDeclinedChallenge,
  hintForIssue,
  hintForMissingChallenge,
  hintForSemanticArithmetic,
  hintForVerification,
  stageForIssue,
  type CandidateDiagnostic,
  type GenerationFailureStage,
  type GenerationRunDiagnostic,
} from "@/lib/ai/generation-failure";
import {
  finalizeQuestSections,
  generationFailed,
  type QuestGenerationResult,
  type QuestGenerationWire,
  type ReadyQuestSections,
} from "@/lib/ai/quest-generation-finalize";
import type {
  ContextualPayload,
  GeneratedChallenge,
  ObjectAnalysis,
  ReadySkillFit,
} from "@/lib/ai/schemas";
import { inferSemanticPurpose } from "@/lib/ai/semantic-purpose";
import { createQuestLogger, type QuestLogger, type SafeZodIssue } from "@/lib/quest-trace";
import { planAfterVerification, verifyChallenge } from "@/lib/math/verify";
import type { Grade, SkillId } from "@/lib/types";

/**
 * One shared challenge-repair budget.
 *
 * Combined generation still produces path, Discovery, and a first
 * candidate. If that candidate is the only thing that failed, the
 * already-validated path is kept and exactly one challenge-only call
 * is made. Path or Discovery failures retry the combined call instead.
 * There is never a second extra call.
 */

export const MAX_CHALLENGE_CANDIDATES = 2;

export type CombinedRequestResult =
  | {
      status: "ok";
      wire: QuestGenerationWire;
      challengeIssues?: SafeZodIssue[];
    }
  | { status: "api_failure" }
  | { status: "parse_failure"; zodIssues?: SafeZodIssue[] };

export type ChallengeRequestResult =
  | { status: "ok"; wire: WireChallenge }
  | { status: "api_failure" }
  | { status: "parse_failure"; zodIssues?: SafeZodIssue[] };

export type QuestGenerationRetryInput = {
  analysis: ObjectAnalysis;
  skillId: SkillId;
  grade: Grade;
  requestCombined: (input?: {
    hint?: RegenerationHint;
  }) => Promise<CombinedRequestResult>;
  requestChallenge: (input: {
    fit: ReadySkillFit;
    contextualGrounding: ContextualPayload | null;
    hint: RegenerationHint;
  }) => Promise<ChallengeRequestResult>;
  logger?: QuestLogger;
};

type CandidateEvaluation =
  | {
      status: "ok";
      challenge: GeneratedChallenge;
    }
  | {
      status: "rejected";
      hint: RegenerationHint;
      diagnostic: Omit<CandidateDiagnostic, "candidate_attempt" | "timing_ms">;
    };

export async function runQuestGenerationWithRetry(
  input: QuestGenerationRetryInput,
): Promise<QuestGenerationResult> {
  const logger = input.logger ?? createQuestLogger("generation");
  const firstStarted = Date.now();
  logger.stage({
    stage: "generation_candidate_1",
    status: "started",
    attempt: 1,
    grade: input.grade,
    skill: input.skillId,
  });
  const firstCall = await input.requestCombined();
  const firstTiming = elapsedMs(firstStarted);

  if (firstCall.status !== "ok") {
    const firstDiag = diagnostic(
      1,
      callStage(firstCall.status),
      firstTiming,
      {
        code: firstCall.status,
        zodIssues: firstCall.status === "parse_failure" ? firstCall.zodIssues : undefined,
      },
    );
    logCandidate(logger, firstDiag, input, firstCall.status === "parse_failure" ? firstCall.zodIssues : undefined);
    logger.stage({
      stage: "generation_candidate_1",
      status: "failed",
      attempt: 1,
      failureCode: firstCall.status,
      grade: input.grade,
      skill: input.skillId,
    });

    const second = await runCombinedAttempt(input, logger, {
      attempt: 2,
      previous: firstDiag,
    });
    return second;
  }

  return finishCombinedAttempt(firstCall.wire, input, logger, {
    attempt: 1,
    timing: firstTiming,
    previous: null,
    allowChallengeRetry: true,
    challengeIssues: firstCall.challengeIssues ?? [],
  });
}

async function runCombinedAttempt(
  input: QuestGenerationRetryInput,
  logger: QuestLogger,
  options: {
    attempt: 2;
    previous: CandidateDiagnostic;
  },
): Promise<QuestGenerationResult> {
  logger.stage({
    stage: "generation_candidate_2",
    status: "started",
    attempt: 2,
    grade: input.grade,
    skill: input.skillId,
  });
  const started = Date.now();
  const call = await input.requestCombined({
    hint: hintForSemanticArithmetic(),
  });
  const timing = elapsedMs(started);

  if (call.status !== "ok") {
    const secondDiag = diagnostic(2, callStage(call.status), timing, {
      code: call.status,
      zodIssues: call.status === "parse_failure" ? call.zodIssues : undefined,
    });
    logCandidate(logger, secondDiag, input, call.status === "parse_failure" ? call.zodIssues : undefined);
    return failBoth(logger, input, options.previous, secondDiag);
  }

  return finishCombinedAttempt(call.wire, input, logger, {
    attempt: 2,
    timing,
    previous: options.previous,
    allowChallengeRetry: false,
    challengeIssues: call.challengeIssues ?? [],
  });
}

async function finishCombinedAttempt(
  wire: QuestGenerationWire,
  input: QuestGenerationRetryInput,
  logger: QuestLogger,
  options: {
    attempt: 1 | 2;
    timing: number;
    previous: CandidateDiagnostic | null;
    allowChallengeRetry: boolean;
    challengeIssues: SafeZodIssue[];
  },
): Promise<QuestGenerationResult> {
  const sections = finalizeQuestSections(wire, {
    analysis: input.analysis,
    skillId: input.skillId,
  });

  if (sections.status === "needsEvidence") {
    logger.stage({
      stage: "skill_fit",
      status: "passed",
      attempt: options.attempt,
      challengeMode: "investigation_math",
      selectedPath: "investigation_math",
      grade: input.grade,
      skill: input.skillId,
      ...analysisTrace(input.analysis),
    });
    logger.stage({
      stage:
        options.attempt === 1 ? "generation_candidate_1" : "generation_candidate_2",
      status: "skipped",
      attempt: options.attempt,
      failureCode: "investigation_math",
    });
    return { status: "needsEvidence", fit: sections.fit };
  }

  if (sections.status === "poorFit") {
    logger.stage({
      stage: "skill_fit",
      status: "passed",
      attempt: options.attempt,
      challengeMode: "poor_fit",
      selectedPath: "poor_fit",
      grade: input.grade,
      skill: input.skillId,
      ...analysisTrace(input.analysis),
    });
    return {
      status: "poorFit",
      fit: sections.fit,
      failure: sections.failure,
    };
  }

  if (sections.status === "failed") {
    logger.stage({
      stage: "skill_fit",
      status: sections.stage === "generation_schema_failure" ? "failed" : "passed",
      attempt: options.attempt,
      failureCode: sections.stage,
      grade: input.grade,
      skill: input.skillId,
      ...analysisTrace(input.analysis),
    });
    const diag = diagnostic(options.attempt, sections.stage, options.timing, {
      code: sections.stage,
    });
    logCandidate(logger, diag, input);

    if (!options.allowChallengeRetry) {
      return failBoth(logger, input, options.previous ?? diag, diag);
    }

    return runCombinedAttempt(input, logger, {
      attempt: 2,
      previous: diag,
    });
  }

  logger.stage({
    stage: "skill_fit",
    status: "passed",
    attempt: options.attempt,
    challengeMode: sections.fit.challengeMode,
    selectedPath: sections.fit.challengeMode,
    grade: input.grade,
    skill: input.skillId,
    ...analysisTrace(input.analysis),
  });

  const evaluated = evaluateChallengeCandidate(
    sections.challengeWire,
    sections,
    input,
    options.attempt,
    options.challengeIssues,
  );

  if (evaluated.status === "ok") {
    logger.stage({
      stage: candidatePipelineStage(options.attempt, "ok"),
      status: "passed",
      attempt: options.attempt,
      challengeMode: sections.fit.challengeMode,
      selectedPath: sections.fit.challengeMode,
      valueOrigins: originList(evaluated.challenge.valuesUsed),
      groundingResult: "ok",
      verificationResult: "ok",
      ...analysisTrace(input.analysis),
    });
    logPassedCandidateStages(
      logger,
      options.attempt,
      sections.fit.challengeMode,
      originList(evaluated.challenge.valuesUsed),
    );
    return {
      status: "ok",
      fit: sections.fit,
      discovery: sections.discovery,
      challenge: evaluated.challenge,
      contextualGrounding: sections.contextualGrounding,
      attemptsUsed: options.attempt,
    };
  }

  const first = {
    candidate_attempt: options.attempt,
    timing_ms: options.timing,
    ...evaluated.diagnostic,
  };
  logCandidate(logger, first, input, evaluated.diagnostic.zodIssues);

  if (!options.allowChallengeRetry) {
    return failBoth(logger, input, options.previous ?? first, {
      candidate_attempt: 2,
      timing_ms: options.timing,
      ...evaluated.diagnostic,
    });
  }

  return retryChallengeOnly(sections, evaluated.hint, input, logger, first);
}

async function retryChallengeOnly(
  sections: ReadyQuestSections,
  hint: RegenerationHint,
  input: QuestGenerationRetryInput,
  logger: QuestLogger,
  first: CandidateDiagnostic,
): Promise<QuestGenerationResult> {
  logger.stage({
    stage: "generation_candidate_2",
    status: "started",
    attempt: 2,
    challengeMode: sections.fit.challengeMode,
    grade: input.grade,
    skill: input.skillId,
  });
  const started = Date.now();
  const response = await input.requestChallenge({
    fit: sections.fit,
    contextualGrounding: sections.contextualGrounding,
    hint,
  });
  const timing = elapsedMs(started);

  if (response.status !== "ok") {
    const second = diagnostic(2, callStage(response.status), timing, {
      challengeMode: sections.fit.challengeMode,
      code: response.status,
      zodIssues: response.status === "parse_failure" ? response.zodIssues : undefined,
    });
    logCandidate(logger, second, input, second.zodIssues);
    return failBoth(logger, input, first, second);
  }

  const evaluated = evaluateChallengeCandidate(
    response.wire,
    sections,
    input,
    2,
    [],
  );

  if (evaluated.status === "ok") {
    logPassedCandidateStages(
      logger,
      2,
      sections.fit.challengeMode,
      originList(evaluated.challenge.valuesUsed),
    );
    return {
      status: "ok",
      fit: sections.fit,
      discovery: sections.discovery,
      challenge: evaluated.challenge,
      contextualGrounding: sections.contextualGrounding,
      attemptsUsed: 2,
    };
  }

  const second = {
    candidate_attempt: 2 as const,
    timing_ms: timing,
    ...evaluated.diagnostic,
  };
  logCandidate(logger, second, input, evaluated.diagnostic.zodIssues);
  return failBoth(logger, input, first, second);
}

function evaluateChallengeCandidate(
  wire: WireChallenge | null,
  sections: ReadyQuestSections,
  input: QuestGenerationRetryInput,
  attempt: 1 | 2,
  priorSchemaIssues: SafeZodIssue[],
): CandidateEvaluation {
  if (wire === null) {
    return {
      status: "rejected",
      hint: hintForMissingChallenge(),
      diagnostic: {
        failure_stage: "generation_schema_failure",
        challengeMode: sections.fit.challengeMode,
        code: priorSchemaIssues[0]?.code ?? "missing_challenge",
        zodIssues: priorSchemaIssues.length > 0 ? priorSchemaIssues : undefined,
      },
    };
  }

  const finalized = finalizeChallenge(wire, {
    analysis: input.analysis,
    fit: sections.fit,
    skillId: input.skillId,
    grade: input.grade,
    studentEvidence: [],
    contextualGrounding: sections.contextualGrounding,
  });

  if (finalized.status === "poor_fit") {
    return {
      status: "rejected",
      hint: hintForDeclinedChallenge(),
      diagnostic: {
        failure_stage: "generation_grounding_failure",
        challengeMode: sections.fit.challengeMode,
        code: "challenge_declined",
        valueOrigins: originList(wire.valuesUsed),
        groundingResult: "challenge_declined",
      },
    };
  }

  if (finalized.status === "generation_failure") {
    return {
      status: "rejected",
      hint: hintForIssue(finalized.issue),
      diagnostic: {
        failure_stage: stageForIssue(finalized.issue),
        computationType: wire.computation.type,
        answerType: wire.correctAnswer.type,
        challengeMode: sections.fit.challengeMode,
        path: finalized.issue.path,
        code: finalized.issue.code,
        zodIssues: finalized.issue.issues,
        valueOrigins: originList(wire.valuesUsed),
        groundingResult: finalized.issue.code,
      },
    };
  }

  const verified = verifyChallenge({
    challenge: finalized.challenge,
    analysis: input.analysis,
    fit: sections.fit,
    skillId: input.skillId,
    grade: input.grade,
    contextualGrounding: sections.contextualGrounding,
  });

  if (planAfterVerification(attempt, verified) === "accept" && verified.ok) {
    return { status: "ok", challenge: finalized.challenge };
  }

  const reason = verified.ok ? "invalid_values" : verified.reason;

  return {
    status: "rejected",
    hint: hintForVerification(reason),
    diagnostic: {
      failure_stage: "verification_failure",
      computationType: finalized.challenge.computation.type,
      answerType: finalized.challenge.correctAnswer.type,
      challengeMode: sections.fit.challengeMode,
      code: reason,
      valueOrigins: originList(finalized.challenge.valuesUsed),
      groundingResult: "ok",
      verificationResult: reason,
    },
  };
}

function callStage(
  status: "api_failure" | "parse_failure",
): GenerationFailureStage {
  return status === "api_failure"
    ? "generation_api_failure"
    : "generation_schema_failure";
}

function diagnostic(
  attempt: 1 | 2,
  stage: GenerationFailureStage,
  timing: number,
  extra: Partial<CandidateDiagnostic> = {},
): CandidateDiagnostic {
  return {
    candidate_attempt: attempt,
    failure_stage: stage,
    timing_ms: timing,
    ...extra,
  };
}

function elapsedMs(started: number): number {
  return Math.max(0, Date.now() - started);
}

function analysisTrace(analysis: ObjectAnalysis) {
  const purpose = inferSemanticPurpose(analysis);
  return {
    identifiedObject: analysis.objectName,
    semanticDomains: purpose.domains,
    typicalUses: analysis.typicalUses,
  };
}

function originList(
  values: readonly { origin: string }[] | undefined,
): string[] | undefined {
  if (values === undefined || values.length === 0) return undefined;
  return [...new Set(values.map((value) => value.origin))];
}

function logCandidate(
  logger: QuestLogger,
  diagnostic: CandidateDiagnostic,
  input: QuestGenerationRetryInput,
  zodIssues?: SafeZodIssue[],
) {
  const failedStage = candidatePipelineStage(
    diagnostic.candidate_attempt,
    diagnostic.failure_stage,
  );
  logger.stage({
    stage: failedStage,
    status: "failed",
    attempt: diagnostic.candidate_attempt,
    failureCode: diagnostic.code ?? diagnostic.failure_stage,
    zodIssues,
    challengeMode: diagnostic.challengeMode,
    selectedPath: diagnostic.challengeMode,
    computationType: diagnostic.computationType,
    answerType: diagnostic.answerType,
    valueOrigins: diagnostic.valueOrigins,
    groundingResult: diagnostic.groundingResult,
    verificationResult: diagnostic.verificationResult,
    grade: input.grade,
    skill: input.skillId,
    ...analysisTrace(input.analysis),
  });
  skipRemainingCandidateStages(logger, diagnostic);
}

function skipRemainingCandidateStages(
  logger: QuestLogger,
  diagnostic: CandidateDiagnostic,
) {
  const attempt = diagnostic.candidate_attempt;
  const failed = candidatePipelineStage(attempt, diagnostic.failure_stage);
  const stages = [
    `candidate_${attempt}_schema`,
    `candidate_${attempt}_grounding`,
    `candidate_${attempt}_verification`,
  ];
  let seenFailed = false;
  for (const stage of stages) {
    if (stage === failed) {
      seenFailed = true;
      continue;
    }
    if (!seenFailed) {
      logger.stage({
        stage,
        status: "passed",
        attempt,
        challengeMode: diagnostic.challengeMode,
      });
      continue;
    }
    logger.stage({
      stage,
      status: "skipped",
      attempt,
      failureCode: diagnostic.code ?? diagnostic.failure_stage,
    });
  }
}

function logPassedCandidateStages(
  logger: QuestLogger,
  attempt: 1 | 2,
  challengeMode: string,
  valueOrigins?: string[],
) {
  for (const stage of [
    `candidate_${attempt}_schema`,
    `candidate_${attempt}_grounding`,
    `candidate_${attempt}_verification`,
  ]) {
    logger.stage({
      stage,
      status: "passed",
      attempt,
      challengeMode,
      selectedPath: challengeMode,
      valueOrigins,
      groundingResult: "ok",
      verificationResult: "ok",
    });
  }
}

function failBoth(
  logger: QuestLogger,
  input: QuestGenerationRetryInput,
  first: CandidateDiagnostic,
  second: CandidateDiagnostic,
): QuestGenerationResult {
  const diagnostic: GenerationRunDiagnostic = {
    challengeMode: second.challengeMode ?? first.challengeMode,
    candidate1FailureStage: first.failure_stage,
    candidate1FailureCode: first.code ?? first.failure_stage,
    candidate2FailureStage: second.failure_stage,
    candidate2FailureCode: second.code ?? second.failure_stage,
    attemptsUsed: 2,
  };
  logger.generationFailed({
    challengeMode: diagnostic.challengeMode,
    grade: input.grade,
    skill: input.skillId,
    candidate1FailureStage: diagnostic.candidate1FailureStage,
    candidate1FailureCode: diagnostic.candidate1FailureCode,
    candidate2FailureStage: diagnostic.candidate2FailureStage,
    candidate2FailureCode: diagnostic.candidate2FailureCode,
  });
  return generationFailed(diagnostic);
}
