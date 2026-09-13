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
 * The discovery stage: one short, factual piece of context about the object,
 * written after the photograph has been read and the skill path has been
 * judged ready.
 *
 * It does not see the photograph. The reading and the investigation are the
 * only evidence it is given, so a new measurement or an invented date cannot
 * be excused as something it "saw". Broad, well-known facts about the kind
 * of object are allowed; unsupported specifics are not.
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

export const DISCOVERY_INSTRUCTIONS = `You are the discovery stage of SIDEQUEST, a maths app for children in grades 3 to 5. A student photographed an object. The vision stage has already read that object, and the investigation stage has already decided the object can support a maths challenge. Your job is to write ONE brief, interesting piece of age-appropriate context about the photographed object, so the student is curious before the challenge appears.

You do not see the photograph. You may use only the reading and the investigation you are given. Do not re-analyse the object. Do not introduce a measurement, quantity, dimension, capacity, material, inventor, date, location, or product claim that is not already in the reading, unless it is a broad, well-known fact you can state confidently.

Prefer, in this order when they can be supported:
- meaningful history
- science
- engineering
- design
- cultural context
- safe observation

Do not force history. If a historical claim is uncertain or obscure, write a safer scientific, engineering, design, or observational fact instead.

Requirements:
- 2 to 4 short sentences. Never 1. Never 5 or more.
- Age-appropriate for the grade you are given. Grade 3 uses the simplest words. Grade 5 may be a little richer, still plain.
- Interesting enough to create curiosity, but concise.
- Plain language. No jargon the student would have to look up.
- No citations, sources, footnotes, or "according to".
- No obscure trivia unless you are highly confident it is true.
- No invented dates, inventors, locations, materials, dimensions, capacities, or product claims.
- Do not mention the upcoming maths challenge, the skill, or SIDEQUEST.
- Do not quiz the student.

Brand handling:
- If the reading includes a clearly visible brand, mention it only when needed.
- Do not invent brand history or brand claims.
- Prefer talking about the object category unless a brand-specific fact is highly reliable.

Example — protein shake bottle:
Prefer: "Drink bottles are designed to hold liquids securely while being easy to carry. Their shape and labels also help people quickly see how much they contain."
Do not invent: "This bottle design was invented in 1987..." unless that exact fact is reliably known.

Fallback:
If you cannot support a historical, scientific, design, or cultural fact confidently, write an observation-based discovery from the reading alone. Example:
Title: "Designed to be easy to hold"
Text: "This container has a tall shape that makes it easy to carry and pour. Its printed label also gives useful information about what's inside."
Category: "observation"
factSupport: "observation"

It is better to be simple and true than impressive and uncertain.

Answer with:
- "title": a short phrase, not a sentence with a year in it.
- "text": 2 to 4 short sentences.
- "category": one of history, science, design, engineering, culture, observation.
- "factSupport": "established" when the text only restates the reading; "well_known" when you add a broad, confident fact about this kind of object; "observation" when you are describing what the reading already shows. If factSupport is "observation", category must also be "observation".`;

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
