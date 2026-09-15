import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  FACT_SUPPORTS,
  finalizeDiscovery,
} from "@/lib/ai/discovery-grounding";
import { openai } from "@/lib/ai/openai";
import {
  DISCOVERY_CATEGORIES,
  type Discovery,
  type ObjectAnalysis,
  type QuestGenerationFailure,
  QuestGenerationFailureSchema,
  type ReadySkillFit,
} from "@/lib/ai/schemas";
import { copy } from "@/lib/copy";
import type { Grade } from "@/lib/types";

/**
 * The discovery stage: one short Did You Know fact about this kind of
 * object, written after the photograph has been read and the skill path
 * has been judged ready.
 *
 * It does not see the photograph. The reading tells it what type of
 * object this is. Did You Know is curiosity, not ObjectAnalysis: a new
 * measurement or an invented date cannot be excused as something it
 * "saw". Broad, well-known facts about the kind of object are allowed;
 * unsupported specifics are not. The fact is never grounding evidence.
 */

/**
 * The same model the reading and the investigation use. The job is short
 * writing with a factual bar, and it runs on a page of JSON.
 */
const DISCOVERY_MODEL = "gpt-5.4";

/**
 * What the model fills in. `factSupport` is asked here so this stage can
 * tell a confident well-known fact from an observation; it is stripped
 * before anything is persisted.
 */
export const WireDiscoverySchema = z.strictObject({
  title: z.string(),
  text: z.string(),
  category: z.enum(DISCOVERY_CATEGORIES),
  factSupport: z.enum(FACT_SUPPORTS),
});

export const DISCOVERY_INSTRUCTIONS = `You are the discovery stage of SIDEQUEST, a maths app for children in grades 3 to 5. A student photographed an object. The vision stage has already read that object, and the investigation stage has already decided the object can support a maths challenge.

Your job is to write ONE short "Did You Know?" learning moment about this TYPE of object — one cool, reliable fact that would make a Grade 3–5 student think "Oh! I didn't know that."

The child already sees the object. Do not describe the photograph. Do not explain obvious uses. Do not write a product caption.

You do not see the photograph. You may use the reading only to know WHAT kind of object this is. Did You Know is not photographic evidence. It must never invent a material, capacity, measurement, ingredient, age, brand history, inventor, exact date, or specification for THIS photographed object.

Choose ONE primary angle — whichever is most interesting AND can be stated confidently:

1. history — how long people have used objects like this, older versions, or why they were first made. Use history only when the story is well-established and easy to explain. Uncertain, obscure, or dull history is not allowed.
2. science — a concrete scientific idea the object demonstrates (friction, pressure, gravity, heat, insulation, light, sound, motion, materials, air pressure).
3. engineering (how it works) — a simple mechanism or design: zippers, lids, wheels, hinges, pencils, clocks.
4. design (how it's made) — one memorable fact about a common material or how this kind of object is made. Not a manufacturing lesson.
5. culture (surprising everyday fact) — one interesting general fact that is not obvious from looking.

Accuracy is more important than novelty. Do not force history. If a historical claim is uncertain, choose science, how it works, how it's made, or a well-established everyday fact instead.

Requirements:
- 1 to 3 short sentences. About 20 to 45 words. ONE primary idea.
- Age-appropriate for the grade you are given. Grade 3 uses the simplest words. Grade 5 may be a little richer, still plain.
- Short sentences. Familiar vocabulary. Active voice. Concrete explanations. Playful curiosity.
- Tone: a children's science museum exhibit, not an AI assistant.
- No citations, sources, footnotes, or "according to".
- No obscure trivia unless you are highly confident it is true.
- No invented dates, inventors, locations, materials, dimensions, capacities, ingredients, or product claims.
- Do not repeat measurements, quantities, or visual details already in the reading.
- Do not mention the upcoming maths challenge, the skill, or SIDEQUEST.
- Do not quiz the student.

Never write phrases like:
- "This object is commonly used for..."
- "This item appears to..."
- "This container is designed to..."
- "This product features..."
- "This object can be seen..."

Never write marketing language, textbook paragraphs, or obvious descriptions such as "wallets are used to hold money and cards."

Examples of the right job:
- Candle jar / history: "Candles have been used for thousands of years. Long ago, people used them as an important source of light before electric lights existed."
- Basketball / science: "A basketball bounces because the air inside pushes against its rubber walls. When the ball hits the floor, it squishes for a moment and springs back into shape."
- Zipper / engineering: "A zipper uses a slider to push two rows of tiny teeth together. Moving the slider the other way pulls the teeth apart."
- Aluminum can / culture: "Aluminum cans can be recycled and made into new cans again. Aluminum can be reused many times instead of being thrown away."

Do not invent: "This candle is made from soy wax." or "This shoe uses a special rubber compound." unless that exact detail is already in the reading.

Brand handling:
- If the reading includes a clearly visible brand, mention it only when needed.
- Do not invent brand history or brand claims.
- Prefer talking about the object category unless a brand-specific fact is highly reliable.

Fallback:
If you cannot support a specialised fact confidently, write one simple, well-established general fact about this kind of object. Do not fall back to describing the photograph.

Answer with:
- "title": a short phrase, not a sentence with a year in it.
- "text": 1 to 3 short sentences, about 20 to 45 words.
- "category": one of history, science, engineering, design, culture, observation.
- "factSupport": "well_known" when you add a broad, confident fact about this kind of object; "established" only if you must restate the reading; "observation" only for the safest general fallback. If factSupport is "observation", category must also be "observation". Prefer well_known.`;

export type DiscoveryResult =
  | { status: "ok"; discovery: Discovery }
  | { status: "failed"; failure: QuestGenerationFailure };

/**
 * Writes one discovery from a validated reading and a ready investigation.
 *
 * Throws only if the environment cannot make the call at all before the
 * request starts. A timeout, a refusal, or a malformed answer comes back as
 * a typed `generation_failure`, and never as a discovery that might be stored.
 */
export async function generateDiscovery({
  analysis,
  fit,
  grade,
}: {
  analysis: ObjectAnalysis;
  fit: ReadySkillFit;
  grade: Grade;
}): Promise<DiscoveryResult> {
  let wire: z.infer<typeof WireDiscoverySchema> | null = null;

  try {
    const response = await openai().responses.parse({
      model: DISCOVERY_MODEL,
      instructions: DISCOVERY_INSTRUCTIONS,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `Grade: ${grade}`,
                "",
                "The reading of the object:",
                JSON.stringify(analysis, null, 2),
                "",
                "The investigation (already validated; do not invent from it):",
                JSON.stringify(
                  {
                    selectedSkillCode: fit.selectedSkillCode,
                    challengeMode: fit.challengeMode,
                    usableProperties: fit.usableProperties,
                    anchors: fit.anchors,
                    reason: fit.reason,
                    inspirationContext: fit.inspirationContext,
                  },
                  null,
                  2,
                ),
              ].join("\n"),
            },
          ],
        },
      ],
      text: { format: zodTextFormat(WireDiscoverySchema, "discovery") },
    });

    wire = response.output_parsed;
  } catch (error) {
    console.warn("[discovery] generation call failed", error);

    return failed();
  }

  if (!wire) {
    console.warn("[discovery] no parsed discovery");

    return failed();
  }

  const finalized = finalizeDiscovery(wire, analysis);

  if (finalized.status !== "ok") {
    console.warn("[discovery] discovery failed validation");

    return failed();
  }

  if (finalized.usedFallback) {
    console.warn("[discovery] used observation fallback");
  }

  return { status: "ok", discovery: finalized.discovery };
}

function failed(): DiscoveryResult {
  return {
    status: "failed",
    failure: QuestGenerationFailureSchema.parse({
      reason: "generation_failure",
      studentMessage: copy.discovery.failure,
      recommendedNextAction: "retry",
    }),
  };
}
