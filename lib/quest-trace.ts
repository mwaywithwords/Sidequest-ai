/**
 * Server-side quest tracing for Vercel Function Logs.
 *
 * Every log line is a single JSON object written to stdout/stderr. The
 * student-facing API never receives these fields.
 */

export const QUEST_PIPELINE_LOG_PREFIX = "[quest-pipeline]";
export const QUEST_GENERATION_FAILED_EVENT = "QUEST_GENERATION_FAILED";
export const QUEST_READY_EVENT = "QUEST_READY";

export type PipelineStageStatus = "started" | "passed" | "failed" | "skipped";

export const PIPELINE_STAGES = [
  "mission_validation",
  "skill_lookup",
  "moderation",
  "vision",
  "object_analysis",
  "skill_fit",
  "generation_candidate_1",
  "candidate_1_schema",
  "candidate_1_grounding",
  "candidate_1_framing_repair",
  "candidate_1_solution_repair",
  "candidate_1_verification",
  "generation_candidate_2",
  "candidate_2_schema",
  "candidate_2_grounding",
  "candidate_2_framing_repair",
  "candidate_2_solution_repair",
  "candidate_2_verification",
  "persistence",
  "ready",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type SafeZodIssue = {
  path: string;
  code: string;
  expected?: string;
};

export type QuestPipelineLogEntry = {
  questTraceId: string;
  stage: string;
  attempt: number;
  status: PipelineStageStatus;
  failureCode?: string;
  zodIssues?: SafeZodIssue[];
  challengeMode?: string;
  selectedPath?: string;
  identifiedObject?: string;
  semanticDomains?: string[];
  typicalUses?: string[];
  valueOrigins?: string[];
  groundingResult?: string;
  verificationResult?: string;
  computationType?: string;
  answerType?: string;
  repair?: string;
  grade?: number;
  skill?: string;
  event?: typeof QUEST_GENERATION_FAILED_EVENT | typeof QUEST_READY_EVENT;
  candidate1FailureStage?: string;
  candidate1FailureCode?: string;
  candidate2FailureStage?: string;
  candidate2FailureCode?: string;
  attemptsUsed?: number;
};

export type QuestLogSink = (
  level: "info" | "error",
  message: string,
  payload: Record<string, unknown>,
) => void;

export type QuestLogger = {
  questTraceId: string;
  stage: (input: {
    stage: string;
    status: PipelineStageStatus;
    attempt?: number;
    failureCode?: string;
    zodIssues?: SafeZodIssue[];
    challengeMode?: string;
    selectedPath?: string;
    identifiedObject?: string;
    semanticDomains?: string[];
    typicalUses?: string[];
    valueOrigins?: string[];
    groundingResult?: string;
    verificationResult?: string;
    computationType?: string;
    answerType?: string;
    repair?: string;
    grade?: number;
    skill?: string;
  }) => void;
  generationFailed: (input: {
    challengeMode?: string;
    grade?: number;
    skill?: string;
    candidate1FailureStage?: string;
    candidate1FailureCode?: string;
    candidate2FailureStage?: string;
    candidate2FailureCode?: string;
  }) => void;
  ready: (input: {
    challengeMode?: string;
    grade?: number;
    skill?: string;
    attemptsUsed: number;
  }) => void;
};

const FORBIDDEN_KEY =
  /^(image|base64|url|signed|authorization|apiKey|api_key|question|answer|correctAnswer|correct_answer|solution|payload|output|raw|hint|student)/i;

const SAFE_EXPECTED_MAX = 64;

export function createQuestTraceId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export function defaultQuestLogSink(
  level: "info" | "error",
  message: string,
  payload: Record<string, unknown>,
): void {
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(message, line);
    return;
  }

  console.info(message, line);
}

export function createQuestLogger(
  questTraceId: string,
  sink: QuestLogSink = defaultQuestLogSink,
): QuestLogger {
  return {
    questTraceId,
    stage(input) {
      const payload = safePayload({
        questTraceId,
        stage: input.stage,
        attempt: input.attempt ?? 1,
        status: input.status,
        failureCode: input.failureCode,
        zodIssues: input.zodIssues,
        challengeMode: input.challengeMode,
        selectedPath: input.selectedPath,
        identifiedObject: clipIdentifiedObject(input.identifiedObject),
        semanticDomains: clipStringList(input.semanticDomains),
        typicalUses: clipStringList(input.typicalUses),
        valueOrigins: clipStringList(input.valueOrigins),
        groundingResult: input.groundingResult,
        verificationResult: input.verificationResult,
        computationType: input.computationType,
        answerType: input.answerType,
        repair: input.repair,
        grade: input.grade,
        skill: input.skill,
      });
      const level = input.status === "failed" ? "error" : "info";
      sink(level, QUEST_PIPELINE_LOG_PREFIX, payload);
    },
    generationFailed(input) {
      sink(
        "error",
        `${QUEST_PIPELINE_LOG_PREFIX} ${QUEST_GENERATION_FAILED_EVENT}`,
        safePayload({
          questTraceId,
          challengeMode: input.challengeMode,
          grade: input.grade,
          skill: input.skill,
          candidate1FailureStage: input.candidate1FailureStage,
          candidate1FailureCode: input.candidate1FailureCode,
          candidate2FailureStage: input.candidate2FailureStage,
          candidate2FailureCode: input.candidate2FailureCode,
        }),
      );
    },
    ready(input) {
      sink(
        "info",
        `${QUEST_PIPELINE_LOG_PREFIX} ${QUEST_READY_EVENT}`,
        safePayload({
          questTraceId,
          challengeMode: input.challengeMode,
          grade: input.grade,
          skill: input.skill,
          attemptsUsed: input.attemptsUsed,
        }),
      );
    },
  };
}

export function formatQuestPipelineLine(
  entry: QuestPipelineLogEntry,
): string {
  return JSON.stringify(safePayload(entry));
}

export function sanitiseZodIssues(error: {
  issues: readonly unknown[];
}): SafeZodIssue[] {
  return error.issues.slice(0, 16).map((issue) =>
    sanitiseOneZodIssue(
      typeof issue === "object" && issue !== null
        ? (issue as Record<string, unknown>)
        : { path: [], code: "invalid" },
    ),
  );
}

export function sanitiseOneZodIssue(
  issue: Record<string, unknown>,
): SafeZodIssue {
  const path = Array.isArray(issue.path)
    ? issue.path.map(String).join(".") || "root"
    : "root";
  const code = typeof issue.code === "string" ? issue.code : "invalid";
  const expected = safeExpected(issue);
  return expected === undefined ? { path, code } : { path, code, expected };
}

function safeExpected(issue: Record<string, unknown>): string | undefined {
  if (typeof issue.expected === "string") {
    return clipExpected(issue.expected);
  }

  if (issue.code === "invalid_union") {
    return "union";
  }

  if (typeof issue.format === "string") {
    return clipExpected(issue.format);
  }

  if (
    Array.isArray(issue.options) &&
    issue.options.every(
      (value) => typeof value === "string" && value.length <= 32,
    )
  ) {
    return clipExpected(issue.options.join("|"));
  }

  if (
    issue.code === "unrecognized_keys" &&
    Array.isArray(issue.keys) &&
    issue.keys.every(
      (value) => typeof value === "string" && /^[A-Za-z0-9_.]+$/.test(value),
    )
  ) {
    return clipExpected(`keys:${issue.keys.join(",")}`);
  }

  return undefined;
}

function clipExpected(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > SAFE_EXPECTED_MAX) {
    return undefined;
  }

  if (/data:|base64|\n/.test(trimmed)) return undefined;
  return trimmed;
}

function clipIdentifiedObject(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const clipped = value.trim().slice(0, 48);
  return clipped.length > 0 ? clipped : undefined;
}

function clipStringList(
  values: readonly string[] | undefined,
): string[] | undefined {
  if (values === undefined || values.length === 0) return undefined;
  const clipped = values
    .slice(0, 8)
    .map((value) => value.trim().slice(0, 48))
    .filter((value) => value.length > 0);
  return clipped.length > 0 ? clipped : undefined;
}

function safePayload(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || FORBIDDEN_KEY.test(key)) continue;
    payload[key] = entry;
  }

  return payload;
}
