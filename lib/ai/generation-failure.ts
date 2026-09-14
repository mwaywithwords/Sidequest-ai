import type { ChallengeValidationIssue } from "@/lib/ai/challenge-grounding";
import type { VerificationReason } from "@/lib/math/verify";
import type { SafeZodIssue } from "@/lib/quest-trace";

export type RegenerationHint = {
  reason: string;
  guidance: string;
};

/**
 * Internal generation-failure stages.
 *
 * These are for routing and logs. They are not database enums and they
 * never reach the student.
 */
export const GENERATION_FAILURE_STAGES = [
  "generation_api_failure",
  "generation_schema_failure",
  "generation_grounding_failure",
  "verification_failure",
  "persistence_failure",
] as const;

export type GenerationFailureStage = (typeof GENERATION_FAILURE_STAGES)[number];

export type CandidateDiagnostic = {
  candidate_attempt: 1 | 2;
  failure_stage: GenerationFailureStage;
  computationType?: string;
  answerType?: string;
  challengeMode?: string;
  path?: string;
  code?: string;
  zodIssues?: SafeZodIssue[];
  valueOrigins?: string[];
  groundingResult?: string;
  verificationResult?: string;
  timing_ms: number;
};

export type GenerationRunDiagnostic = {
  challengeMode?: string;
  candidate1FailureStage?: GenerationFailureStage;
  candidate1FailureCode?: string;
  candidate2FailureStage?: GenerationFailureStage;
  candidate2FailureCode?: string;
  attemptsUsed: 1 | 2;
};

const SCHEMA_CODES = new Set([
  "empty_required_text",
  "text_too_long",
  "invalid_difficulty",
  "invalid_used_value",
  "unrecognized_geometry_label",
  "invalid_choice_or_answer",
  "invalid_computation",
  "computation_value_mismatch",
  "missing_challenge",
  "invalid_union",
  "invalid_type",
  "invalid_value",
  "too_small",
  "too_big",
]);

const GROUNDING_CODES = new Set([
  "skill_mismatch",
  "ungrounded_value",
  "ungrounded_observed_value",
  "ungrounded_shape",
  "missing_object_reference",
  "missing_anchor_citation",
  "inspired_off_topic",
  "contextual_as_observed",
  "contextual_value_missing",
  "student_evidence_missing",
  "invalid_value_origin",
  "unframed_hypothetical",
  "invented_measurement",
  "invented_object_fact",
]);

const SAFE_ISSUE_REASONS: Record<string, string> = {
  empty_required_text: "malformed challenge fields",
  text_too_long: "malformed challenge fields",
  skill_mismatch: "wrong selected skill",
  invalid_difficulty: "application schema mismatch",
  invalid_used_value: "application schema mismatch",
  unrecognized_geometry_label: "invalid geometry label",
  invalid_choice_or_answer: "invalid geometry label",
  invalid_computation: "malformed multi-step computation",
  computation_value_mismatch: "malformed multi-step computation",
  ungrounded_value: "ungrounded observed value",
  ungrounded_observed_value: "ungrounded observed value",
  ungrounded_shape: "ungrounded observed value",
  missing_object_reference: "object relevance failure",
  missing_anchor_citation: "object relevance failure",
  inspired_off_topic: "object relevance failure",
  contextual_as_observed: "ungrounded observed value",
  contextual_value_missing: "contextual value missing",
  student_evidence_missing: "student evidence missing",
  invalid_value_origin: "invalid value origin",
  unframed_hypothetical: "missing given-in-problem framing",
  invented_measurement: "ungrounded observed value",
  invented_object_fact: "ungrounded observed value",
};

const SAFE_VERIFY_REASONS: Record<VerificationReason, string> = {
  incorrect_answer: "answer did not match computation",
  ungrounded_value: "ungrounded observed value",
  unit_mismatch: "application schema mismatch",
  invalid_values: "malformed challenge fields",
  solution_mismatch: "answer did not match computation",
  skill_mismatch: "wrong selected skill",
  grade_inappropriate: "application schema mismatch",
  weak_object_connection: "object relevance failure",
  unsupported_computation: "malformed multi-step computation",
};

export function stageForIssue(
  issue: ChallengeValidationIssue,
): Extract<
  GenerationFailureStage,
  "generation_schema_failure" | "generation_grounding_failure"
> {
  if (GROUNDING_CODES.has(issue.code)) return "generation_grounding_failure";
  if (SCHEMA_CODES.has(issue.code)) return "generation_schema_failure";
  return issue.path === "computation" || issue.path === "correctAnswer"
    ? "generation_schema_failure"
    : "generation_grounding_failure";
}

export function candidatePipelineStage(
  attempt: 1 | 2,
  stage: GenerationFailureStage | "ok",
): string {
  if (stage === "ok") {
    return attempt === 1 ? "generation_candidate_1" : "generation_candidate_2";
  }

  const prefix = attempt === 1 ? "candidate_1" : "candidate_2";
  switch (stage) {
    case "generation_api_failure":
    case "generation_schema_failure":
      return `${prefix}_schema`;
    case "generation_grounding_failure":
      return `${prefix}_grounding`;
    case "verification_failure":
      return `${prefix}_verification`;
    case "persistence_failure":
      return "persistence";
  }
}

/**
 * A short, model-safe retry hint. Never a Zod dump or a raw payload.
 */
export function hintForIssue(issue: ChallengeValidationIssue): RegenerationHint {
  return challengeRetryHint(
    SAFE_ISSUE_REASONS[issue.code] ?? "application schema mismatch",
  );
}

export function hintForVerification(reason: VerificationReason): RegenerationHint {
  return challengeRetryHint(SAFE_VERIFY_REASONS[reason]);
}

export function hintForMissingChallenge(): RegenerationHint {
  return challengeRetryHint("malformed challenge fields");
}

export function hintForDeclinedChallenge(): RegenerationHint {
  return challengeRetryHint("object relevance failure");
}

export function hintForSemanticArithmetic(): RegenerationHint {
  return {
    reason: "semantic arithmetic path",
    guidance: [
      "The previous investigation asked for another observation or declined too early.",
      "When the selected skill is arithmetic and the photographed object has no usable observed number, prefer a semantic real-world scenario over asking the child for another observation.",
      "Choose inspired_math. Write inspirationContext, discovery, and a challenge that uses given_in_problem numbers framed with suppose / imagine / if / let's say.",
      "Examples: wallet + addition → money; shoe + multiplication → steps; cup + division → servings/liquid; basketball + subtraction → score difference.",
      "Do not ask the child to measure or count something unless that is actually the stronger educational path.",
    ].join("\n"),
  };
}

export function challengeRetryHint(safeReason: string): RegenerationHint {
  return {
    reason: safeReason,
    guidance: [
      `The previous candidate was rejected for ${safeReason}.`,
      "Create a new challenge from the same validated object/path.",
      "Do not repeat that error.",
    ].join("\n"),
  };
}

export function logCandidateDiagnostic(diagnostic: CandidateDiagnostic) {
  console.error(
    "[quest-pipeline]",
    JSON.stringify({
      stage: candidatePipelineStage(
        diagnostic.candidate_attempt,
        diagnostic.failure_stage,
      ),
      attempt: diagnostic.candidate_attempt,
      status: "failed",
      failureCode: diagnostic.code ?? diagnostic.failure_stage,
      failureStage: diagnostic.failure_stage,
      path: diagnostic.path,
      challengeMode: diagnostic.challengeMode,
      computationType: diagnostic.computationType,
      answerType: diagnostic.answerType,
      zodIssues: diagnostic.zodIssues,
    }),
  );
}

export function logBothCandidatesFailed(
  first: CandidateDiagnostic,
  second: CandidateDiagnostic | null,
) {
  console.error(
    "[quest-pipeline] QUEST_GENERATION_FAILED",
    JSON.stringify({
      candidate1FailureStage: first.failure_stage,
      candidate1FailureCode: first.code ?? first.failure_stage,
      candidate2FailureStage: second?.failure_stage,
      candidate2FailureCode: second?.code ?? second?.failure_stage,
    }),
  );
}
