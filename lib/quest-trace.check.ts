/**
 * Safe quest-pipeline logging checks.
 *
 * Run with: npx tsx lib/quest-trace.check.ts
 */

import {
  createQuestLogger,
  createQuestTraceId,
  formatQuestPipelineLine,
  sanitiseZodIssues,
} from "@/lib/quest-trace";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

const id = createQuestTraceId();
check("questTraceId is a short hex id", /^[a-f0-9]{12}$/.test(id));

const schemaIssues = sanitiseZodIssues({
  issues: [
    {
      path: ["computation", "type"],
      code: "invalid_union",
      expected: "union",
      input: { type: "add-them", secret: "12 dollars" },
      message: "Invalid input: 12 dollars",
    },
    {
      path: ["valuesUsed", 0, "origin"],
      code: "invalid_value",
      options: ["observed", "given_in_problem"],
      input: "from the wallet photo",
    },
  ],
});

check(
  "Zod issues keep path and code without received values",
  schemaIssues[0]?.path === "computation.type" &&
    schemaIssues[0]?.code === "invalid_union" &&
    schemaIssues[1]?.path === "valuesUsed.0.origin" &&
    schemaIssues[1]?.code === "invalid_value" &&
    !JSON.stringify(schemaIssues).includes("12 dollars") &&
    !JSON.stringify(schemaIssues).includes("from the wallet photo") &&
    !JSON.stringify(schemaIssues).includes("secret"),
);

const captured: Array<{ level: string; message: string; payload: Record<string, unknown> }> = [];
const logger = createQuestLogger("abc123", (level, message, payload) => {
  captured.push({ level, message, payload });
});

logger.stage({
  stage: "candidate_1_grounding",
  status: "failed",
  attempt: 1,
  failureCode: "ungrounded_observed_value",
});
logger.generationFailed({
  challengeMode: "inspired_math",
  grade: 4,
  skill: "addition",
  candidate1FailureStage: "generation_grounding_failure",
  candidate1FailureCode: "ungrounded_observed_value",
  candidate2FailureStage: "generation_schema_failure",
  candidate2FailureCode: "invalid_union",
});
logger.ready({
  challengeMode: "inspired_math",
  grade: 4,
  skill: "addition",
  attemptsUsed: 2,
});

const failedLog = captured.find((entry) =>
  entry.message.includes("QUEST_GENERATION_FAILED"),
);
const readyLog = captured.find((entry) => entry.message.includes("QUEST_READY"));
const stageLog = captured.find(
  (entry) => entry.payload.stage === "candidate_1_grounding",
);

check(
  "failed stages emit error-level quest-pipeline lines",
  stageLog?.level === "error" &&
    stageLog.payload.questTraceId === "abc123" &&
    stageLog.payload.attempt === 1 &&
    stageLog.payload.failureCode === "ungrounded_observed_value",
);

check(
  "QUEST_GENERATION_FAILED is a searchable error summary",
  failedLog?.level === "error" &&
    failedLog.message === "[quest-pipeline] QUEST_GENERATION_FAILED" &&
    failedLog.payload.candidate1FailureCode === "ungrounded_observed_value" &&
    failedLog.payload.candidate2FailureCode === "invalid_union" &&
    !JSON.stringify(failedLog.payload).includes("question") &&
    !JSON.stringify(failedLog.payload).includes("answer"),
);

check(
  "QUEST_READY includes attemptsUsed",
  readyLog?.payload.attemptsUsed === 2 &&
    readyLog.payload.skill === "addition",
);

logger.stage({
  stage: "skill_fit",
  status: "passed",
  identifiedObject: "wallet",
  semanticDomains: ["money"],
  typicalUses: ["holding money", "carrying cards"],
  selectedPath: "inspired_math",
  challengeMode: "inspired_math",
  valueOrigins: ["given_in_problem"],
  groundingResult: "ok",
  verificationResult: "ok",
});

const fitLog = captured.find((entry) => entry.payload.stage === "skill_fit");

check(
  "skill_fit logs object, domains, path, origins, and results",
  fitLog?.payload.identifiedObject === "wallet" &&
    Array.isArray(fitLog.payload.semanticDomains) &&
    fitLog.payload.semanticDomains.includes("money") &&
    fitLog.payload.selectedPath === "inspired_math" &&
    Array.isArray(fitLog.payload.valueOrigins) &&
    fitLog.payload.valueOrigins.includes("given_in_problem") &&
    fitLog.payload.groundingResult === "ok" &&
    fitLog.payload.verificationResult === "ok",
);

const line = formatQuestPipelineLine({
  questTraceId: "abc123",
  stage: "candidate_2_verification",
  attempt: 2,
  status: "failed",
  failureCode: "incorrect_answer",
  question: "secret",
  correctAnswer: 55,
} as never);

check(
  "payload formatter strips forbidden keys",
  line.includes("incorrect_answer") &&
    line.includes('"attempt":2') &&
    !line.includes("secret") &&
    !line.includes("55"),
);

logger.stage({
  stage: "candidate_1_solution_repair",
  status: "passed",
  attempt: 1,
  repair: "deterministic_solution",
});

const repairLog = captured.find(
  (entry) => entry.payload.stage === "candidate_1_solution_repair",
);

check(
  "repair events keep a safe repair tag and drop question or answer keys",
  repairLog?.payload.repair === "deterministic_solution" &&
    repairLog.payload.status === "passed" &&
    !JSON.stringify(repairLog.payload).includes("question") &&
    !JSON.stringify(repairLog.payload).includes("answer"),
);

if (failed > 0) {
  console.error(`\n${failed} quest-trace checks failed`);
  process.exit(1);
}

console.log("\nall quest-trace checks passed");
