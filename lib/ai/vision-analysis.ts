import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { COMBINED_REQUEST_TIMEOUT_MS, openai } from "@/lib/ai/openai";
import { WireAnalysisSchema, OBJECT_ANALYSIS_INSTRUCTIONS } from "@/lib/ai/object-analysis";
import { SuitabilityVerdictSchema } from "@/lib/ai/image-suitability";
import { SUITABILITY_INSTRUCTIONS } from "@/lib/ai/suitability-rules";
import {
  finalizeVisionAnalysis,
  type VisionAnalysisResult,
} from "@/lib/ai/vision-finalize";

/**
 * Combined multimodal vision: product suitability and object reading in
 * one structured response, after OpenAI Moderation has already passed.
 *
 * The two concerns stay separate in the output. Each section is validated
 * on its own. A malformed payload fails the stage. An unsafe suitability
 * section never becomes a reading the rest of the pipeline can teach from.
 */

const VISION_MODEL = "gpt-5.4";

const WireVisionSchema = z.strictObject({
  suitability: SuitabilityVerdictSchema,
  object: WireAnalysisSchema,
});

const INSTRUCTIONS = `You are the vision stage of SIDEQUEST, a maths app for children in grades 3 to 5. A student has photographed an object. OpenAI Moderation has already screened this photograph for harmful content. You are doing TWO separate jobs in one response. Keep them logically distinct. Do not let one section invent facts for the other.

SECTION 1 — suitability
Decide whether the photograph is usable for SIDEQUEST. This is a product rule, not a maths reading.

${SUITABILITY_INSTRUCTIONS}

Fill "suitability" with verdict, confidence, and note exactly as that screen requires.

SECTION 2 — object
Report what the photograph actually shows. This is the reading a later maths stage will be allowed to use.

${OBJECT_ANALYSIS_INSTRUCTIONS}

Fill "object" with that reading. If suitability is not "usable", still fill the object fields honestly from what you can see, or with empty arrays and identifiable=false. The application will ignore the object section when suitability refuses.

Never invent a number in the object section, even if you recognise the product. An empty array is a correct answer.`;

export type { VisionAnalysisResult };

/**
 * Analyses one already-moderated photograph, supplied as a data URL.
 *
 * Throws when the call fails or the structured payload cannot be parsed.
 * That is a stop: an unanswered vision question is not a usable reading,
 * and it is not an allow.
 */
export async function analyzeVision(
  image: string,
): Promise<VisionAnalysisResult> {
  const response = await openai().responses.parse(
    {
      model: VISION_MODEL,
      instructions: INSTRUCTIONS,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Screen this photograph for suitability, then read the object.",
            },
            { type: "input_image", image_url: image, detail: "high" },
          ],
        },
      ],
      text: { format: zodTextFormat(WireVisionSchema, "vision_analysis") },
    },
    { timeout: COMBINED_REQUEST_TIMEOUT_MS },
  );

  const wire = response.output_parsed;
  if (!wire) {
    console.warn("[vision] no parsed vision analysis");
    throw new Error("Vision analysis returned no parsed output");
  }

  const suitability = wire.suitability;
  if (
    suitability.verdict !== "usable" ||
    suitability.confidence !== "high"
  ) {
    console.warn("[vision] screened image", {
      verdict: suitability.verdict,
      note: suitability.note,
      confidence: suitability.confidence,
    });
  }

  const droppedMeasurements =
    wire.object.visibleMeasurements.length -
    wire.object.visibleMeasurements.filter(
      (measurement) =>
        Number.isFinite(measurement.value) &&
        measurement.unit.trim().length > 0 &&
        measurement.label.trim().length > 0,
    ).length;

  if (droppedMeasurements > 0) {
    console.warn("[vision] dropped malformed measurements", {
      dropped: droppedMeasurements,
    });
  }

  return finalizeVisionAnalysis(wire);
}
