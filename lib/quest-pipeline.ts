import type { ImageSafetyReason } from "@/lib/ai/schemas";
import type { VisionAnalysisResult } from "@/lib/ai/vision-finalize";
import type { QuestGenerationResult } from "@/lib/ai/quest-generation-finalize";
import type {
  ContextualPayload,
  Discovery,
  EvidenceRequest,
  GeneratedChallenge,
  ObjectAnalysis,
  ReadySkillFit,
  SkillFitAnalysis,
} from "@/lib/ai/schemas";
import { detourKindFromReason, sanitiseSuggestions } from "@/lib/detour";
import type { PipelineTimer } from "@/lib/pipeline-timing";
import { createPipelineTimer } from "@/lib/pipeline-timing";
import type { SkillProgressInput } from "@/lib/ai/challenge-grounding";
import type { AdaptiveProfile } from "@/lib/progress/adaptation";
import type { Grade, SkillId } from "@/lib/types";

export type QuestVerificationView =
  | { status: "ok" }
  | { status: "failed"; failure: { reason: string } };

/**
 * The ordered quest-creation stages, with injectable I/O so the call
 * sequence can be tested without a network.
 *
 * The selected skill is resolved first. That is application configuration,
 * not a model judgement, and a missing row must not spend OpenAI work.
 * Moderation runs next. Vision never runs if moderation refuses.
 * Generation never runs if vision is unsafe or the reading failed.
 * Verification never runs unless generation produced a candidate.
 * Only verification may mark a quest ready.
 */

export type QuestCreateResult =
  | { kind: "ready"; questId: string }
  | {
      kind: "needsEvidence";
      questId: string;
      objectName: string;
      evidenceRequest: EvidenceRequest;
    }
  | {
      kind: "refused";
      reason: string;
      suggestions: string[];
      offerSkillChange: boolean;
    }
  | { kind: "generationFailed" }
  | { kind: "failed" };

export type SkillRecord = {
  id: string;
  description: string | null;
};

export type QuestPipelinePersist = {
  /**
   * Application configuration. Must run before any model call so a missing
   * or unsupported mission cannot spend OpenAI work.
   */
  resolveSkill: (
    grade: Grade,
    skillId: SkillId,
  ) => Promise<SkillRecord>;
  loadProfile: (grade: Grade) => Promise<{ profileId: string }>;
  uploadAndInsert: (input: {
    file: File;
    profileId: string;
    skillRowId: string;
  }) => Promise<{ questId: string }>;
  storeReading: (questId: string, analysis: ObjectAnalysis) => Promise<void>;
  storeFit: (questId: string, fit: SkillFitAnalysis) => Promise<void>;
  storeDiscovery: (questId: string, discovery: Discovery) => Promise<void>;
  storeChallenge: (input: {
    questId: string;
    skillRowId: string;
    challenge: GeneratedChallenge;
    fit: ReadySkillFit;
    adaptation: AdaptiveProfile;
    contextualGrounding: ContextualPayload | null;
  }) => Promise<void>;
  loadAdaptation: (
    profileId: string,
    skillRowId: string,
  ) => Promise<{
    progress: SkillProgressInput;
    recentOutcomes: boolean[];
  }>;
  markRejected: (questId: string) => Promise<void>;
  markFailed: (questId: string) => Promise<void>;
};

export type QuestPipelineDeps = {
  moderateImage: (image: string) => Promise<ImageSafetyReason>;
  analyzeVision: (image: string) => Promise<VisionAnalysisResult>;
  generateQuest: (input: {
    analysis: ObjectAnalysis;
    skillId: SkillId;
    skillDescription: string | null;
    grade: Grade;
    adaptation: AdaptiveProfile;
  }) => Promise<QuestGenerationResult>;
  verifyQuest: (questId: string) => Promise<QuestVerificationView>;
  persist: QuestPipelinePersist;
  adaptiveProfile: (input: {
    grade: Grade;
    progress: SkillProgressInput;
    recentOutcomes: boolean[];
  }) => AdaptiveProfile;
  timer?: PipelineTimer;
};

export async function runQuestPipeline(
  input: {
    image: string;
    file: File;
    grade: Grade;
    skillId: SkillId;
  },
  deps: QuestPipelineDeps,
): Promise<QuestCreateResult> {
  const timer = deps.timer ?? createPipelineTimer();
  let insertedQuestId: string | null = null;

  try {
    const skill = await timer.measureDb(() =>
      deps.persist.resolveSkill(input.grade, input.skillId),
    );

    const harmful = await timer.measure("moderation", () =>
      deps.moderateImage(input.image),
    );

    if (harmful !== "appropriate") {
      timer.log();
      return refused(harmful);
    }

    const vision = await timer.measure("vision", () =>
      deps.analyzeVision(input.image),
    );

    if (vision.status === "unsafe") {
      timer.log();
      return refused(vision.safety.reason);
    }

    const { profileId } = await timer.measureDb(() =>
      deps.persist.loadProfile(input.grade),
    );

    const { questId } = await timer.measureDb(() =>
      deps.persist.uploadAndInsert({
        file: input.file,
        profileId,
        skillRowId: skill.id,
      }),
    );
    insertedQuestId = questId;

    if (vision.status === "failed") {
      await timer.measureDb(() =>
        vision.failure.reason === "generation_failure"
          ? deps.persist.markFailed(questId)
          : deps.persist.markRejected(questId),
      );
      timer.log();
      return refused(vision.failure.reason);
    }

    const analysis = vision.analysis;

    const [{ progress, recentOutcomes }] = await timer.measureDb(() =>
      Promise.all([
        deps.persist.loadAdaptation(profileId, skill.id),
        deps.persist.storeReading(questId, analysis),
      ]),
    );

    const adaptation = deps.adaptiveProfile({
      grade: input.grade,
      progress,
      recentOutcomes,
    });

    const generation = await timer.measure("generation", () =>
      deps.generateQuest({
        analysis,
        skillId: input.skillId,
        skillDescription: skill.description,
        grade: input.grade,
        adaptation,
      }),
    );

    if (generation.status === "failed") {
      await timer.measureDb(() => deps.persist.markFailed(questId));
      timer.log();
      return { kind: "generationFailed" };
    }

    if (generation.status === "needsEvidence") {
      await timer.measureDb(() =>
        deps.persist.storeFit(questId, generation.fit),
      );
      timer.log();
      return {
        kind: "needsEvidence",
        questId,
        objectName: analysis.objectName,
        evidenceRequest: generation.fit.evidenceRequest,
      };
    }

    if (generation.status === "poorFit") {
      await timer.measureDb(async () => {
        await deps.persist.storeFit(questId, generation.fit);
        await deps.persist.markRejected(questId);
      });
      timer.log();
      return refused(generation.failure.reason, {
        suggestions:
          generation.fit.challengeMode === "poor_fit"
            ? generation.fit.suggestedObjectCharacteristics
            : [],
        offerSkillChange:
          generation.fit.challengeMode === "poor_fit" &&
          generation.fit.alternativeSkillCodes.length > 0,
      });
    }

    await timer.measureDb(async () => {
      await Promise.all([
        deps.persist.storeFit(questId, generation.fit),
        deps.persist.storeDiscovery(questId, generation.discovery),
        deps.persist.storeChallenge({
          questId,
          skillRowId: skill.id,
          challenge: generation.challenge,
          fit: generation.fit,
          adaptation,
          contextualGrounding: generation.contextualGrounding,
        }),
      ]);
    });

    const verified = await timer.measure("verification", () =>
      deps.verifyQuest(questId),
    );

    if (verified.status !== "ok") {
      timer.log();
      return refused(verified.failure.reason);
    }

    timer.log();
    return { kind: "ready", questId };
  } catch (error) {
    console.error("[quest-pipeline]", error);
    if (insertedQuestId !== null) {
      await deps.persist.markFailed(insertedQuestId);
    }
    timer.log();
    return { kind: "failed" };
  }
}

export function toClientCreateBody(
  result: QuestCreateResult,
): Record<string, unknown> {
  switch (result.kind) {
    case "ready":
      return { questId: result.questId };
    case "needsEvidence":
      return {
        questId: result.questId,
        needsEvidence: true,
        objectName: result.objectName,
        evidenceRequest: result.evidenceRequest,
      };
    case "refused":
      return {
        error: "refused",
        kind: detourKindFromReason(result.reason),
        suggestions: sanitiseSuggestions(result.suggestions),
        offerSkillChange: result.offerSkillChange,
      };
    case "generationFailed":
      return { error: "generationFailed" };
    case "failed":
      return { error: "failed" };
  }
}

function refused(
  reason: string,
  extras?: { suggestions?: readonly string[]; offerSkillChange?: boolean },
): QuestCreateResult {
  return {
    kind: "refused",
    reason,
    suggestions: [...(extras?.suggestions ?? [])],
    offerSkillChange: extras?.offerSkillChange === true,
  };
}
