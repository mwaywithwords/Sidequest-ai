/**
 * Optimized quest-pipeline invariant checks.
 *
 * Run with: npx tsx lib/quest-pipeline.check.ts
 *
 * These do not call a model or the database. They replay the live POST
 * /api/quests stage order with injectable hooks and compare it against
 * the old fail-closed contract.
 */

import type { ImageSafetyReason } from "@/lib/ai/schemas";
import type { QuestGenerationResult } from "@/lib/ai/quest-generation-finalize";
import type { VisionAnalysisResult } from "@/lib/ai/vision-finalize";
import { imageSafetyVerdict } from "@/lib/ai/image-safety-verdict";
import { copy } from "@/lib/copy";
import { planAfterVerification } from "@/lib/math/verify";
import { createPipelineTimer } from "@/lib/pipeline-timing";
import {
  type QuestCreateResult,
  type QuestPipelineDeps,
  runQuestPipeline,
  toClientCreateBody,
} from "@/lib/quest-pipeline";
import { isSupportedMission, parseMission } from "@/lib/skill-catalogue";
import { GRADES, SKILL_IDS } from "@/lib/types";
import type { GeneratedChallenge, ObjectAnalysis, ReadySkillFit } from "@/lib/ai/schemas";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

const bottle: ObjectAnalysis = {
  objectName: "protein shake bottle",
  category: "packaged beverage",
  brand: "Premier Protein",
  confidence: 0.92,
  visibleText: ["Premier Protein", "11 FL OZ"],
  visibleMeasurements: [
    { value: 11, unit: "fl oz", label: "printed bottle volume" },
  ],
  countableProperties: [],
  shapeProperties: ["rectangular carton with a screw cap"],
  observableProperties: ["purple plastic cap"],
};

const readyFit: ReadySkillFit = {
  selectedSkillCode: "subtraction",
  fitScore: 0.8,
  challengeMode: "object_math",
  canGenerateChallenge: true,
  usableProperties: ["printed bottle volume: 11 fl oz"],
  reason: "The printed volume anchors subtraction.",
  suggestedObjectCharacteristics: [],
  alternativeSkillCodes: [],
  anchors: [
    { property: "printed bottle volume: 11 fl oz", origin: "observed" },
  ],
  evidenceRequest: null,
  inspirationContext: null,
};

const challenge: GeneratedChallenge = {
  question:
    "The bottle in your photo contains 11 fluid ounces. If 4 fluid ounces are poured out, how many remain?",
  skillCode: "subtraction",
  correctAnswer: { type: "number", value: 7, unit: "fl oz" },
  solution: "11 − 4 = 7 fluid ounces.",
  hint1: "Start with the printed volume.",
  hint2: "Take 4 away from 11.",
  difficulty: 2,
  objectConnection:
    "Your bottle shows 11 fl oz, so that real measurement becomes the starting amount.",
  valuesUsed: [
    {
      label: "printed bottle volume",
      value: 11,
      unit: "fl oz",
      origin: "observed",
    },
    {
      label: "amount poured out",
      value: 4,
      unit: "fl oz",
      origin: "given_in_problem",
    },
  ],
  verificationStrategy: "Subtract 4 from 11.",
  computation: {
    type: "arithmetic",
    operation: "subtract",
    operands: [
      {
        label: "printed bottle volume",
        value: 11,
        unit: "fl oz",
        origin: "observed",
      },
      {
        label: "amount poured out",
        value: 4,
        unit: "fl oz",
        origin: "given_in_problem",
      },
    ],
  },
};

const okVision: VisionAnalysisResult = {
  status: "ok",
  safety: imageSafetyVerdict("appropriate"),
  analysis: bottle,
};

const okGeneration: QuestGenerationResult = {
  status: "ok",
  fit: readyFit,
  discovery: {
    title: "Made to carry a drink",
    text: "Drink bottles are designed to hold liquids securely while being easy to carry. Their shape and labels also help people quickly see how much they contain.",
    category: "design",
  },
  challenge,
  contextualGrounding: null,
};

function fileStub(): File {
  return new File(["x"], "photo.jpg", { type: "image/jpeg" });
}

function recordingDeps(options?: {
  moderation?: ImageSafetyReason | (() => Promise<ImageSafetyReason>);
  vision?: VisionAnalysisResult | (() => Promise<VisionAnalysisResult>);
  generation?: QuestGenerationResult | (() => Promise<QuestGenerationResult>);
  verification?: "ok" | "failed";
}): { calls: string[]; readyMarked: boolean; deps: QuestPipelineDeps } {
  const calls: string[] = [];
  let readyMarked = false;

  const deps: QuestPipelineDeps = {
    async moderateImage() {
      calls.push("moderation");
      const value = options?.moderation ?? "appropriate";
      return typeof value === "function" ? value() : value;
    },
    async analyzeVision() {
      calls.push("vision");
      const value = options?.vision ?? okVision;
      return typeof value === "function" ? value() : value;
    },
    async generateQuest() {
      calls.push("generation");
      const value = options?.generation ?? okGeneration;
      return typeof value === "function" ? value() : value;
    },
    async verifyQuest() {
      calls.push("verification");
      if (options?.verification === "failed") {
        return {
          status: "failed",
          failure: { reason: "invalid_math" },
        };
      }
      readyMarked = true;
      return { status: "ok" };
    },
    adaptiveProfile: () => ({
      masteryBand: "developing",
      targetDifficulty: 2,
      hintSupport: "standard",
      complexity: "standard",
      recentTrend: "insufficient_data",
    }),
    persist: {
      async resolveSkill() {
        calls.push("db:skill");
        return { id: "skill-1", description: "Grade 4 subtraction" };
      },
      async loadProfile() {
        calls.push("db:profile");
        return { profileId: "profile-1" };
      },
      async uploadAndInsert() {
        calls.push("db:upload");
        return { questId: "quest-1" };
      },
      async storeReading() {
        calls.push("db:reading");
      },
      async storeFit() {
        calls.push("db:fit");
      },
      async storeDiscovery() {
        calls.push("db:discovery");
      },
      async storeChallenge() {
        calls.push("db:challenge");
      },
      async loadAdaptation() {
        calls.push("db:adaptation");
        return { progress: null, recentOutcomes: [] };
      },
      async markRejected() {
        calls.push("db:rejected");
      },
      async markFailed() {
        calls.push("db:failed");
      },
    },
  };

  return {
    calls,
    get readyMarked() {
      return readyMarked;
    },
    deps,
  };
}

async function run(
  deps: QuestPipelineDeps,
): Promise<QuestCreateResult> {
  return runQuestPipeline(
    {
      image: "data:image/jpeg;base64,AAA",
      file: fileStub(),
      grade: 4,
      skillId: "subtraction",
    },
    deps,
  );
}

async function main() {
const happy = recordingDeps();
const happyResult = await run(happy.deps);

check(
  "the selected skill is resolved before moderation or vision",
  happy.calls.indexOf("db:skill") === 0 &&
    happy.calls.indexOf("moderation") > happy.calls.indexOf("db:skill") &&
    happy.calls.indexOf("vision") > happy.calls.indexOf("moderation"),
);

check(
  "moderation still happens before educational vision reasoning",
  happy.calls.indexOf("moderation") >= 0 &&
    happy.calls.indexOf("vision") > happy.calls.indexOf("moderation"),
);

check(
  "an ordinary object still reaches analysis and generation",
  happy.calls.includes("vision") &&
    happy.calls.includes("generation") &&
    happyResult.kind === "ready",
);

check(
  "only verification marks a quest ready",
  happy.calls.indexOf("verification") > happy.calls.indexOf("generation") &&
    happy.readyMarked &&
    happyResult.kind === "ready",
);

const unsafeModeration = recordingDeps({ moderation: "adult_content" });
const unsafeModerationResult = await run(unsafeModeration.deps);

check(
  "if moderation fails, nothing downstream runs",
  unsafeModeration.calls.join(",") === "db:skill,moderation" &&
    !unsafeModeration.calls.includes("vision") &&
    !unsafeModeration.calls.includes("generation") &&
    !unsafeModeration.calls.includes("db:upload") &&
    unsafeModerationResult.kind === "refused",
);

const unsafeVision = recordingDeps({
  vision: {
    status: "unsafe",
    safety: imageSafetyVerdict("weapon"),
  },
});
const unsafeVisionResult = await run(unsafeVision.deps);

check(
  "unsafe images cannot reach challenge generation",
  unsafeVision.calls.includes("moderation") &&
    unsafeVision.calls.includes("vision") &&
    !unsafeVision.calls.includes("generation") &&
    !unsafeVision.calls.includes("db:challenge") &&
    unsafeVisionResult.kind === "refused" &&
    unsafeVisionResult.reason === "weapon",
);

const malformedVision = recordingDeps({
  vision: async () => {
    throw new Error("Vision analysis returned no parsed output");
  },
});
const malformedVisionResult = await run(malformedVision.deps);

check(
  "malformed structured vision output fails closed",
  malformedVisionResult.kind === "failed" &&
    !malformedVision.calls.includes("generation") &&
    !malformedVision.calls.includes("verification"),
);

const malformedGeneration = recordingDeps({
  generation: {
    status: "failed",
    failure: {
      reason: "generation_failure",
      studentMessage: "Try again.",
      recommendedNextAction: "retry",
    },
  },
});
const malformedGenerationResult = await run(malformedGeneration.deps);

check(
  "if generation fails, the quest never becomes ready",
  malformedGenerationResult.kind === "generationFailed" &&
    !malformedGeneration.readyMarked &&
    malformedGeneration.calls.includes("db:failed") &&
    !malformedGeneration.calls.includes("verification"),
);

const generationFailedBody = toClientCreateBody(malformedGenerationResult);

check(
  "a generation failure is not an object detour",
  generationFailedBody.error === "generationFailed" &&
    generationFailedBody.kind === undefined &&
    !JSON.stringify(generationFailedBody).includes("poorFit") &&
    !JSON.stringify(generationFailedBody).includes("wandered") &&
    !JSON.stringify(generationFailedBody).includes("Find Another Object"),
);

check(
  "generation failure copy does not blame the photographed object",
  !copy.scan.generationFailedBody.toLowerCase().includes("find another") &&
    !copy.scan.generationFailedBody.toLowerCase().includes("different object") &&
    copy.scan.generationFailedBody.toLowerCase().includes("photo is fine"),
);

const unverified = recordingDeps({ verification: "failed" });
const unverifiedResult = await run(unverified.deps);

check(
  "only a verified challenge sets ready",
  unverifiedResult.kind === "refused" &&
    unverifiedResult.reason === "invalid_math" &&
    !unverified.readyMarked,
);

check(
  "one regeneration maximum",
  planAfterVerification(1, {
    ok: false,
    reason: "incorrect_answer",
    detail: "no",
  }) === "regenerate" &&
    planAfterVerification(2, {
      ok: false,
      reason: "incorrect_answer",
      detail: "no",
    }) === "give_up",
);

const clientReady = toClientCreateBody(happyResult);
const clientRefused = toClientCreateBody(unsafeModerationResult);
const serialized = JSON.stringify({ clientReady, clientRefused });

check(
  "the client body never includes the answer or generation metadata",
  !serialized.includes("correctAnswer") &&
    !serialized.includes("correct_answer") &&
    !serialized.includes("generation_metadata") &&
    !serialized.includes("verificationStrategy") &&
    !serialized.includes("computation") &&
    !serialized.includes("given_in_problem") &&
    !("value" in (clientReady as { questId?: string })),
);

check(
  "timing internals are not sent to the student",
  !serialized.includes("moderation_ms") &&
    !serialized.includes("vision_ms") &&
    !serialized.includes("generation_ms") &&
    !serialized.includes("verification_ms") &&
    !serialized.includes("database_ms") &&
    !serialized.includes("total_ms") &&
    !serialized.includes("[quest-pipeline]"),
);

check(
  "a moderation refusal is mapped to a student-safe kind, not a category",
  clientRefused.kind === "unsafe" &&
    !serialized.includes("adult_content") &&
    !serialized.includes("sexual"),
);

const missingSkill = recordingDeps();
missingSkill.deps.persist.resolveSkill = async () => {
  missingSkill.calls.push("db:skill");
  throw new Error("No skill row for grade 4 / geometry");
};
const missingSkillResult = await runQuestPipeline(
  {
    image: "data:image/jpeg;base64,AAA",
    file: fileStub(),
    grade: 4,
    skillId: "geometry",
  },
  missingSkill.deps,
);

check(
  "a missing Grade 4 / geometry row fails before any AI call",
  missingSkillResult.kind === "failed" &&
    missingSkill.calls.join(",") === "db:skill" &&
    !missingSkill.calls.includes("moderation") &&
    !missingSkill.calls.includes("vision") &&
    !missingSkill.calls.includes("generation"),
);

for (const grade of GRADES) {
  for (const skillId of SKILL_IDS) {
    check(
      `Grade ${grade} / ${skillId} is a supported mission`,
      isSupportedMission(grade, skillId) &&
        parseMission(grade, skillId)?.skillCode === skillId,
    );
  }
}

const geometryHappy = recordingDeps();
const geometryResult = await runQuestPipeline(
  {
    image: "data:image/jpeg;base64,AAA",
    file: fileStub(),
    grade: 4,
    skillId: "geometry",
  },
  geometryHappy.deps,
);

check(
  "Grade 4 / geometry resolves as a supported mission and reaches the pipeline",
  parseMission(4, "geometry")?.skillCode === "geometry" &&
    geometryResult.kind === "ready" &&
    geometryHappy.calls[0] === "db:skill",
);

check(
  "an unsupported combination is rejected before createQuest",
  parseMission(4, "algebra") === null && parseMission(6, "geometry") === null,
);

const timer = createPipelineTimer();
await timer.measure("moderation", async () => undefined);
const snapshot = timer.snapshot();

check(
  "timing instrumentation records stage milliseconds without payload fields",
  snapshot.moderation_ms >= 0 &&
    snapshot.vision_ms === 0 &&
    snapshot.generation_ms === 0 &&
    snapshot.verification_ms === 0 &&
    snapshot.database_ms === 0 &&
    snapshot.total_ms >= 0 &&
    Object.keys(snapshot).join(",") ===
      "moderation_ms,vision_ms,generation_ms,verification_ms,database_ms,total_ms",
);

if (failed > 0) {
  console.error(`\n${failed} quest pipeline check(s) failed`);
  process.exit(1);
}

console.log("\nall quest pipeline checks passed");
}

void main();
