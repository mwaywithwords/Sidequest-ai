import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { openai } from "@/lib/ai/openai";
import {
  finalizeObjectReading,
  sanitizeObservations,
} from "@/lib/ai/object-observations";
import {
  type ObjectAnalysis,
  type QuestFailureReason,
  type QuestGenerationFailure,
  QuestGenerationFailureSchema,
  type RecommendedNextAction,
} from "@/lib/ai/schemas";
import { copy } from "@/lib/copy";

/**
 * Reading the photograph: what the object is, and what it shows.
 *
 * Runs only on an image the safety gate already passed. Everything downstream —
 * skill fit, the discovery, the challenge and its answer — is built on what
 * comes out of here, which makes one rule more important than all the rest: a
 * number in this analysis must have been legible in the photograph. A model
 * that knows a soda can holds 12 fl oz will happily supply that figure for a
 * can whose label is turned away, and a student who then measures the real can
 * finds the maths was about nothing. Everything in this module — the wire
 * schema, the instructions, the failure paths — exists to make an honest empty
 * answer easier for the model to give than an invented full one.
 */

/**
 * A stronger model than the safety gate uses.
 *
 * This is the stage that has to read small print off a curved label and, harder
 * than that, decline to fill in what it cannot read. That trade is worth paying
 * for once per quest; the gate's job is coarse by comparison.
 */
const ANALYSIS_MODEL = "gpt-5.4";

/**
 * The shape the model fills in, which is not the shape the application uses.
 *
 * Kept separate from `ObjectAnalysisSchema` for two reasons. It carries
 * `identifiable`, a question only worth asking of the model. And it is written
 * to what strict structured outputs accept — every field required, `null`
 * instead of absent, no string or number constraints — so the constraints that
 * matter stay where they belong: in the schema that validates the answer.
 */
export const WireAnalysisSchema = z.strictObject({
  identifiable: z.boolean(),
  objectName: z.string(),
  category: z.string(),
  brand: z.string().nullable(),
  confidence: z.number(),
  visibleText: z.array(z.string()),
  visibleMeasurements: z.array(
    z.strictObject({
      value: z.number(),
      unit: z.string(),
      label: z.string(),
    }),
  ),
  countableProperties: z.array(z.string()),
  shapeProperties: z.array(z.string()),
  observableProperties: z.array(z.string()),
});

/**
 * Half of this is the list of things not to say.
 *
 * The prohibitions are spelled out one by one, with the reason attached, because
 * a general instruction to avoid guessing does not survive contact with an
 * object the model recognises. It knows what a basketball weighs. The only way
 * to keep that out of a challenge is to make the specific temptation explicit
 * and to make an empty array an obviously correct answer.
 */
export const OBJECT_ANALYSIS_INSTRUCTIONS = `You are the vision stage of SIDEQUEST, a maths app for children in grades 3 to 5. A student has photographed an object near them, and a maths challenge will be built only from what you report. Report what the photograph shows, and nothing you merely know.

Identify the object:

- "objectName": what the object is, at the narrowest level the photograph actually supports. If the branding or label is not clearly legible, widen the answer rather than guess: "soft drink can" is a correct answer, "Pepsi Zero Sugar can" is only correct if you can read it.
- "category": the everyday kind of thing it is, such as "packaged food", "sports equipment", "stationery", "kitchen tool".
- "brand": only when a brand is clearly legible on the object itself. Otherwise null.
- "confidence": 0 to 1, how sure you are of "objectName".
- "identifiable": false when you cannot say what the object is at all.

Report what is visible:

- "visibleText": text you can actually read in the photograph, transcribed as it appears. Do not include text you expect to be on this kind of object but cannot read. Never transcribe anything identifying a person — a name, an address, an account or card number, a phone number — leave it out entirely.
- "visibleMeasurements": numbers you can read, each with the unit as printed and a label saying where you read it. Sources are printed labels, moulded or engraved markings, measurement graduations, readable packaging, or a ruler or scale that is itself in the photograph. A can whose label reads "12 FL OZ" gives {"value": 12, "unit": "fl oz", "label": "printed can volume"}.
- "countableProperties": things a student could count in this photograph, such as "6 visible buttons", "12 window panes".
- "shapeProperties": geometric description in words — 2D shapes, 3D forms, symmetry, curves, angles, parallel or perpendicular edges, faces, or cross-sections. Examples: "approximately spherical", "cylinder-like body", "circular top", "left-right symmetry", "rectangular cover". No dimensions and no invented face or edge counts.
- "observableProperties": material, colour, texture, condition, or state, such as "clear plastic", "about half full", "worn leather".

Never invent a number. Specifically, do not report a diameter, circumference, weight, volume, capacity, price, model number, or product specification unless that value is legible in the photograph. Do not assume a basketball is regulation size, that a baby bottle holds 8 oz, or that a soda can holds 12 fl oz. Do not estimate the dimensions of furniture or of a room. Do not infer a price, and do not infer specifications from recognising a brand.

An empty array is a correct and useful answer. A photograph of a plain wooden spoon has no visible text and no visible measurements, and saying so is right. Do not describe or identify people.`;

/**
 * Either a validated reading, or a typed reason there is none.
 *
 * A failure is a value here rather than an exception because these are outcomes
 * the pipeline expects: some photographs of perfectly safe objects cannot be
 * read well enough to teach from, and that has to be something the caller can
 * record and explain rather than something it recovers from.
 */
export type ObjectAnalysisResult =
  | { status: "ok"; analysis: ObjectAnalysis }
  | { status: "failed"; failure: QuestGenerationFailure };

/**
 * Analyses one photograph, supplied as a data URL.
 *
 * Throws only if the call itself cannot be made. Anything the model gets wrong —
 * an unreadable object, an answer that does not fit the schema — comes back as a
 * typed failure, and never as a partly-trusted analysis.
 */
export async function analyzeObject(image: string): Promise<ObjectAnalysisResult> {
  const response = await openai().responses.parse({
    model: ANALYSIS_MODEL,
    instructions: OBJECT_ANALYSIS_INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: "Read this object." },
          // The only stage that needs the pixels: a volume moulded into the base
          // of a bottle is the difference between a real measurement and an
          // invented one.
          { type: "input_image", image_url: image, detail: "high" },
        ],
      },
    ],
    text: { format: zodTextFormat(WireAnalysisSchema, "object_analysis") },
  });

  const wire = response.output_parsed;
  if (!wire) {
    // A refusal or an answer that did not fit the wire schema at all.
    console.warn("[object-analysis] no parsed reading");

    return failure("generation_failure");
  }

  const droppedMeasurements =
    wire.visibleMeasurements.length -
    sanitizeObservations(wire).visibleMeasurements.length;

  if (droppedMeasurements > 0) {
    console.warn("[object-analysis] dropped malformed measurements", {
      dropped: droppedMeasurements,
    });
  }

  const reading = finalizeObjectReading(wire);

  if (reading.status === "ok") {
    return { status: "ok", analysis: reading.analysis };
  }

  if (reading.status === "unknown_object") {
    console.warn("[object-analysis] object not identified");
  } else if (reading.status === "insufficient_information") {
    console.warn("[object-analysis] nothing observable to build on");
  } else {
    console.warn("[object-analysis] reading failed validation");
  }

  return failure(reading.status);
}

/** The three ways this stage can decline. The other reasons belong to other stages. */
type AnalysisFailureReason = Extract<
  QuestFailureReason,
  "unknown_object" | "insufficient_information" | "generation_failure"
>;

/**
 * The student's side of a failure: one sentence and one thing to try next.
 *
 * Both are ours rather than the model's. A child needs a next step, and
 * 'unknown_object' is not one.
 */
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

/** Validated like everything else: a failure is application data too. */
function failure(reason: AnalysisFailureReason): ObjectAnalysisResult {
  return {
    status: "failed",
    failure: QuestGenerationFailureSchema.parse({
      reason,
      ...FAILURES[reason],
    }),
  };
}
