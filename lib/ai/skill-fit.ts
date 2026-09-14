import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { openai } from "@/lib/ai/openai";
import {
  CHALLENGE_MODES,
  EVIDENCE_REQUEST_TYPES,
  type ObjectAnalysis,
} from "@/lib/ai/schemas";
import {
  finalizeSkillFit,
  type SkillFitResult,
  skillFitFailed,
} from "@/lib/ai/skill-fit-finalize";
import { getSkill, SKILLS } from "@/lib/skills";
import { type Grade, SKILL_IDS, type SkillId } from "@/lib/types";

/**
 * The math-investigation stage: can this object support a legitimate,
 * grade-appropriate investigation for the skill the student chose?
 *
 * Object Analysis has already been conservative. This stage does not get the
 * photograph again, and it may not invent a fact about the object. What it may
 * do is be creative about the *path*: a bottle that shows 11 fl oz can anchor
 * subtraction; a sneaker with no visible number can still be investigated; a
 * basketball with no printed score can still inspire basketball maths.
 *
 * The photographed object must meaningfully anchor the exploration. It does
 * not always have to contain every number used later. The camera starts the
 * investigation. It does not have to finish it.
 */

/**
 * The same model the reading uses. The judgement is pedagogical — whether a
 * path is honest, and whether it suits the grade — and it runs on a page of
 * JSON, so it is cheap to do properly.
 */
const FIT_MODEL = "gpt-5.4";

/**
 * What each skill has a natural claim on, including paths that need one more
 * observation. Model-facing pedagogy, so it lives here rather than on the
 * `Skill` records shipped to the browser.
 */
const SKILL_INVESTIGATION: Record<SkillId, string> = {
  addition:
    "adding to an observed quantity; combining groups; totals; counts; measurements; hypothetical increases from the object's ordinary use. Example: 8 visible eyelets → object_math. A wallet with no visible amount → inspired_math via money, not investigation_math and not poor_fit.",
  subtraction:
    "removing from an observed quantity; amounts remaining; differences; capacity remaining; comparisons; hypothetical remaining amounts from the object's ordinary use. Example: a bottle labelled 11 fl oz → object_math. A wallet with no printed total → inspired_math via money. Do not ask for a measurement just because no number is visible.",
  multiplication:
    "repeated units; repeated groups; rows; columns; pairs; scaling a real observed quantity; hypothetical repeated groups from the object's ordinary use. Example: 8 visible eyelets → object_math. A sneaker with no count → inspired_math via walking or steps, not a forced eyelet count.",
  division:
    "equal sharing; grouping; portions; quantities per group; hypothetical sharing from the object's ordinary use. Example: 12 visible objects → object_math. A cup with no printed capacity → inspired_math via servings. A basketball can use quarters or equal teams as inspired_math.",
  fractions:
    "equal parts; portions; sections; fractional use of a real quantity; hypothetical parts from the object's ordinary use. A visible whole or circular structure can be enough. A book with no page count → inspired_math via chapters or pages.",
  measurement:
    "visible measurements; student measurement of length, width, height, volume, capacity, or time; comparisons. Prefer investigation_math when measuring THIS object is the better lesson. Do not invent a capacity or length.",
  geometry:
    "recognisable 2D shapes; recognisable 3D forms; angles; symmetry; curves; circular tops; spheres; rectangles; parallel or perpendicular lines; faces, edges, vertices; repeated geometric structures. Observable shape is enough for qualitative or structure geometry. Do not require printed dimensions and do not ask for a measurement when a visible form can support the skill.",
};

/**
 * What the model answers, which is less than the schema holds.
 *
 * `selectedSkillCode` is the student's choice and is filled in afterwards.
 * `canGenerateChallenge` and `anchors` are derived from the resolved path, not
 * asked of the model. `evidenceRequest` is nullable on the wire so structured
 * outputs can return null when the path does not need one.
 */
export const WireEvidenceRequestSchema = z.strictObject({
  type: z.enum(EVIDENCE_REQUEST_TYPES),
  prompt: z.string(),
  targetProperty: z.string(),
  reason: z.string(),
});

export const WireInspirationContextSchema = z.strictObject({
  topic: z.string(),
  reason: z.string(),
});

export const WireSkillFitSchema = z.strictObject({
  challengeMode: z.enum(CHALLENGE_MODES),
  fitScore: z.number(),
  usableProperties: z.array(z.string()),
  reason: z.string(),
  suggestedObjectCharacteristics: z.array(z.string()),
  alternativeSkillCodes: z.array(z.enum(SKILL_IDS)),
  evidenceRequest: WireEvidenceRequestSchema.nullable(),
  inspirationContext: WireInspirationContextSchema.nullable(),
});

export const SKILL_FIT_INSTRUCTIONS = `You are the math-investigation stage of SIDEQUEST, a maths app for children in grades 3 to 5. A student chose a maths skill, then photographed an object. The vision stage has already read that object. Its reading is given to you as JSON. Your job is to decide whether this real-world object can support a legitimate, grade-appropriate mathematical investigation for the selected skill.

Do not ask: "Does this single photograph already contain every number needed to make a math problem?"
Ask: "Can this object meaningfully ANCHOR a mathematical exploration for this skill?"

The photographed object must stay the topic of the maths. It does not always have to contain every number used in a later calculation. An ordinary object must not be rejected simply because the first photograph contains no obvious numbers.

The reading is your only evidence about the object. Do not introduce any measurement, quantity, dimension, capacity, price, specification, or fact about the object that is not already in it. If a number is not in the reading, it does not exist as an OBSERVED fact.

You MAY plan a later hypothetical maths situation. You may NOT invent facts about the photographed object. You may NOT change the selected skill.

Value origins a later Challenge Generator will use — understand them, do not invent the third:
- OBSERVED: a fact in the reading.
- STUDENT_PROVIDED: something the student will look up, count, or measure.
- GIVEN_IN_PROBLEM: a hypothetical a later stage may introduce ("if 4 ounces are poured out"). You do not invent those values now.

Search for a challenge in this order. Only after the earlier paths fail may you return poor_fit.

1. "object_math" — REAL OBSERVED MATH. Use a visible/validated property when it naturally supports the selected skill.
   Examples: bottle says 20 FL OZ; clock has 12 visible hour marks; toy car has 4 visible wheels.
   A later stage may add a hypothetical given_in_problem value around that observed anchor.

2. "object_math" — VISIBLE STRUCTURE / FORM. Use non-numeric visible mathematical structure when appropriate.
   Examples: basketball → sphere; wallet → rectangle; bottle → cylinder; clock → circle.
   Do not invent dimensions. Geometry does NOT need a printed measurement.

3. "inspired_math" — SEMANTIC / REAL-WORLD CONNECTION. If the photo has no useful number, identify what the object naturally does, contains, represents, or is commonly used for. Then a later stage may introduce hypothetical given_in_problem numbers, framed with suppose / imagine / if / let's say.
   Reason from the identified object's ordinary purpose. Do not require a printed number.
   GOOD: wallet → money, bills, coins, spending, saving, making change.
   GOOD: sneakers or sandals → walking, steps, distance, pairs.
   GOOD: cup → drinking, filling, pouring, servings, capacity as a hypothetical.
   GOOD: basketball → scoring, teams, quarters, shots.
   GOOD: book → reading, pages, chapters.
   GOOD: backpack → carrying items, school supplies, groups.
   BAD: wallet → apples. BAD: sneaker → pizzas. BAD: basketball → pencils.
   The object must remain the reason the mathematical situation exists.
   Do not invent a measurement as if it were on the object. Put the connection in inspirationContext.

4. "investigation_math" — use this when interacting with the ACTUAL object would produce a BETTER educational experience, not merely because the first photograph lacks a number.
   GOOD: measurement + sneaker → "Measure your sneaker from heel to toe."
   BAD: addition + wallet with no printed total → do not ask them to count cards just to avoid inspired_math.

When the selected skill is arithmetic (addition, subtraction, multiplication, division, or fractions) and the photographed object has no usable observed number, prefer a semantic real-world scenario over asking the child for another observation.
Examples: wallet + addition → money; shoe + multiplication → steps; cup + division → servings/liquid; basketball + subtraction → score difference.
Do not ask the child to measure or count something unless that is actually the stronger educational path.

5. "poor_fit" — LAST RESORT. A safe, identifiable ordinary object must not become poor_fit merely because it contains no visible numbers, has no printed measurement, or ObjectAnalysis has no numeric anchor. Ask: can this object's ordinary real-world use honestly anchor the selected skill?

A photograph may serve as a semantic / real-world anchor rather than a numeric anchor. SIDEQUEST should find the math.

How to investigate each skill:
{skills}

Answer with:
- "challengeMode": one of the four paths above.
- "fitScore": 0 to 1, how naturally this object supports an investigation for the selected skill at this grade. A moderate score can still be an excellent investigation_math or inspired_math path.
- "usableProperties": entries of the reading that could anchor the maths, copied verbatim. Copy a countable, shape, or observable property exactly as written. Copy visible text exactly as written, and only when the text itself carries usable mathematical information. Write a measurement as "label: value unit", for example "printed bottle volume: 11 fl oz". Anything not copied verbatim will be discarded.
- "reason": one or two factual sentences on why this path was chosen. Written for an engineer or a teacher reading a log, not for the student.
- "suggestedObjectCharacteristics": what a better object for this skill would have. Fill this in only for poor_fit; use an empty array otherwise.
- "alternativeSkillCodes": skill codes that this object's properties would suit better than the selected skill. Never include the selected skill. Never change the selected skill. Empty when nothing else fits, and empty for investigation_math and inspired_math.
- "evidenceRequest": required when challengeMode is investigation_math; null otherwise. Shape:
  { "type": "second_photo" | "student_measurement" | "student_count" | "student_input", "prompt": string, "targetProperty": string, "reason": string }
  "prompt" and "reason" are shown to the student. Do not state a number as a fact about the object. Ask them to find, count, or measure it.
- "inspirationContext": required when challengeMode is inspired_math; null otherwise. Shape:
  { "topic": string, "reason": string }
  "topic" names the legitimate real-world connection (for example "basketball jersey numbers"). "reason" says why that connection can later support the selected skill. Do not invent a historical date, inventor, or object specification.

Grade matters. A property can support a skill in principle and still be wrong for the grade. Judge the path for the grade you are given. Prefer the simplest legitimate investigation.`;

/**
 * A path ready for a future challenge, a path waiting on one more observation,
 * a path that is honestly poor, or a stage that did not work.
 */
export type { SkillFitResult };

/**
 * Judges one object against one skill for one grade.
 *
 * Throws only if the call itself cannot be made. A malformed answer comes back
 * as a typed `generation_failure`, and never as a fit that might be positive.
 */
export async function analyzeSkillFit({
  analysis,
  grade,
  skillId,
  skillDescription,
}: {
  analysis: ObjectAnalysis;
  grade: Grade;
  skillId: SkillId;
  /** The grade's own wording for the skill, from the seeded catalogue. */
  skillDescription: string | null;
}): Promise<SkillFitResult> {
  const skill = getSkill(skillId);

  const response = await openai().responses.parse({
    model: FIT_MODEL,
    instructions: SKILL_FIT_INSTRUCTIONS.replace(
      "{skills}",
      skillInvestigationList(),
    ),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              `Grade: ${grade}`,
              `Selected skill: ${skillId} (${skill.label})`,
              `What that means in grade ${grade}: ${skillDescription ?? skill.blurb}`,
              "",
              "The reading of the object:",
              JSON.stringify(analysis, null, 2),
            ].join("\n"),
          },
        ],
      },
    ],
    text: { format: zodTextFormat(WireSkillFitSchema, "skill_fit") },
  });

  const wire = response.output_parsed;
  if (!wire) {
    console.warn("[skill-fit] no parsed judgement");

    return skillFitFailed();
  }

  return finalizeSkillFit(wire, analysis, skillId);
}

/** The investigation table as prompt text, in the order the setup screen offers. */
export function skillInvestigationList(): string {
  return SKILLS.map(
    (skill) => `- ${skill.id} (${skill.label}): ${SKILL_INVESTIGATION[skill.id]}`,
  ).join("\n");
}
