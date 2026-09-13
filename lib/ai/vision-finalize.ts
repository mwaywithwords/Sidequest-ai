import { imageSafetyVerdict } from "@/lib/ai/image-safety-verdict";
import {
  finalizeObjectReading,
  type WireObjectReading,
} from "@/lib/ai/object-observations";
import {
  type ImageSafetyAnalysis,
  type ObjectAnalysis,
  type QuestFailureReason,
  type QuestGenerationFailure,
  QuestGenerationFailureSchema,
  type RecommendedNextAction,
} from "@/lib/ai/schemas";
import {
  resolveSuitability,
  type SuitabilityJudgement,
} from "@/lib/ai/suitability-rules";
import { copy } from "@/lib/copy";

/**
 * Separate validation of the two vision sections that now share one
 * multimodal request. Suitability is decided first. An object reading is
 * only accepted when that section says the photograph is usable.
 */

export type VisionWire = {
  suitability: SuitabilityJudgement;
  object: WireObjectReading;
};

export type VisionAnalysisResult =
  | { status: "ok"; safety: ImageSafetyAnalysis; analysis: ObjectAnalysis }
  | { status: "unsafe"; safety: ImageSafetyAnalysis }
  | {
      status: "failed";
      safety: ImageSafetyAnalysis;
      failure: QuestGenerationFailure;
    };

type AnalysisFailureReason = Extract<
  QuestFailureReason,
  "unknown_object" | "insufficient_information" | "generation_failure"
>;

const FAILURES: Record<
  AnalysisFailureReason,
  { studentMessage: string; recommendedNextAction: RecommendedNextAction }
> = {
  unknown_object: {
    studentMessage: copy.analysis.unknownObject,
    recommendedNextAction: "find_different_object",
  },
  insufficient_information: {
    studentMessage: copy.analysis.insufficientInformation,
    recommendedNextAction: "retake_photo",
  },
  generation_failure: {
    studentMessage: copy.analysis.failure,
    recommendedNextAction: "retry",
  },
};

/**
 * Validates each vision section independently.
 *
 * A missing or unparsable suitability section never becomes an allow.
 * When suitability refuses, the object section is ignored so an unsafe
 * photograph cannot be treated as a reading. When suitability passes,
 * a malformed object section is a typed failure, not a partial reading.
 */
export function finalizeVisionAnalysis(wire: VisionWire): VisionAnalysisResult {
  const reason = resolveSuitability(wire.suitability);
  const safety = imageSafetyVerdict(reason);

  if (!safety.allowed) {
    return { status: "unsafe", safety };
  }

  const reading = finalizeObjectReading(wire.object);

  if (reading.status === "ok") {
    return { status: "ok", safety, analysis: reading.analysis };
  }

  if (reading.status === "unknown_object") {
    console.warn("[vision] object not identified");
  } else if (reading.status === "insufficient_information") {
    console.warn("[vision] nothing observable to build on");
  } else {
    console.warn("[vision] reading failed validation");
  }

  return {
    status: "failed",
    safety,
    failure: objectAnalysisFailure(reading.status),
  };
}

export function objectAnalysisFailure(
  reason: AnalysisFailureReason,
): QuestGenerationFailure {
  return QuestGenerationFailureSchema.parse({
    reason,
    ...FAILURES[reason],
  });
}
