import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  type StudentEvidenceValue,
  finalizeChallenge,
  type WireChallenge,
} from "@/lib/ai/challenge-grounding";
import {
  type ChallengeGenerationResult,
  challengeFailed,
  resultFromFinalization,
} from "@/lib/ai/challenge-result";
import type { RegenerationHint } from "@/lib/ai/generation-failure";
import { openai } from "@/lib/ai/openai";
import {
  CHALLENGE_VALUE_ORIGINS,
  type ContextualPayload,
  type ObjectAnalysis,
  type ReadySkillFit,
} from "@/lib/ai/schemas";
import {
  adaptationGenerationGuidance,
  getAdaptiveProfile,
  type AdaptiveProfile,
} from "@/lib/progress/adaptation";
import { getSkill } from "@/lib/skills";
import { SKILL_IDS, type Grade, type SkillId } from "@/lib/types";

/**
 * Challenge Generation: one object-grounded, grade-appropriate maths
 * problem, written from validated structured data only.
 *
 * It does not see the photograph. It may invent a scenario. It may not
 * invent a fact about the object. A candidate that survives this stage is
 * still not displayable — verification has to recompute the answer first.
 * This function may be called a second time with a short regeneration hint.
 */

export const CHALLENGE_MODEL = "gpt-5.4";

const WireOperandSchema = z.strictObject({
  label: z.string(),
  value: z.number(),
  unit: z.string().nullable(),
  origin: z.enum(CHALLENGE_VALUE_ORIGINS),
  kind: z.enum(["value", "step_result"]).nullable().optional(),
  step: z.number().nullable().optional(),
});

const WireShapeSchema = z.strictObject({
  label: z.string(),
  form: z.string(),
  aspect: z.string(),
  origin: z.enum(["observed", "student_provided"]),
});

export const WireChallengeSchema = z.strictObject({
  canGenerate: z.boolean(),
  question: z.string(),
  skillCode: z.enum(SKILL_IDS),
  solution: z.string(),
  hint1: z.string(),
  hint2: z.string(),
  difficulty: z.number(),
  objectConnection: z.string(),
  verificationStrategy: z.string(),
  valuesUsed: z.array(WireOperandSchema),
  shapesUsed: z.array(WireShapeSchema),
  correctAnswer: z.strictObject({
    type: z.enum(["number", "fraction", "choice"]),
    value: z.number().nullable(),
    numerator: z.number().nullable(),
    denominator: z.number().nullable(),
    unit: z.string().nullable(),
    label: z.string().nullable(),
    set: z.string().nullable(),
  }),
  computation: z.strictObject({
    type: z.enum([
      "arithmetic",
      "multi_step_arithmetic",
      "division",
      "fraction_of",
      "fraction_remaining",
      "conversion",
      "geometry",
      "shape_identify",
      "shape_count",
    ]),
    operation: z.string(),
    shape: z.string().nullable(),
    numerator: z.number().nullable(),
    denominator: z.number().nullable(),
    simplify: z.boolean().nullable(),
    operands: z.array(WireOperandSchema),
    steps: z
      .array(
        z.strictObject({
          operation: z.enum(["add", "subtract", "multiply"]),
          operands: z.array(
            WireOperandSchema.extend({
              kind: z.enum(["value", "step_result"]),
              step: z.number().nullable(),
            }),
          ),
        }),
      )
      .nullable(),
  }),
});

const SKILL_PATTERNS: Record<SkillId, string> = {
  addition:
    "adding to an observed count; combining related quantities; hypothetical totals from the object's ordinary use. Example: 8 visible eyelets → 'if 3 more were added, how many would there be?' Wallet with no printed total → 'Suppose your wallet has $35 and you add $40.'",
  subtraction:
    "amount remaining; differences; hypothetical remaining amounts from the object's ordinary use. Example: bottle labelled 11 fl oz → 'If 4 fluid ounces are poured out, how many remain?' Wallet → 'Suppose your wallet has $20. How much more would you need to reach $125?'",
  multiplication:
    "repeated groups; scaling an observed quantity; hypothetical repeated groups from the object's ordinary use. Example: 8 visible eyelets on one sneaker. Numberless sneaker → 'Imagine you walk 12 steps in each of 3 laps.' Numberless wallet → 'Imagine your wallet contains 6 five-dollar bills.'",
  division:
    "equal sharing; quantities per group; hypothetical sharing from the object's ordinary use. Example: 12 visible eggs shared among 3 cartons. Numberless cup → 'Suppose 80 mL is poured equally into 4 cups.'",
  fractions:
    "equal parts; portions of an observed whole; hypothetical parts from the object's ordinary use. Example: pizza cut into 8 equal slices. Numberless book → 'Suppose your book has 12 pages and you read 1/3 of them.' Numberless wallet → 'Suppose your wallet has $80 and you spend 1/4 of it.'",
  measurement:
    "comparing measurements; converting only when the conversion factor is written in the problem; remaining capacity; differences in length or volume. Never invent this object's capacity or length as observed.",
  geometry:
    "Prefer qualitative or structure geometry from visible shape: name a 2D shape or 3D form, or count faces/edges/vertices/sides of an identified form. Use perimeter or area only when those dimensions are already observed or student-provided. Do not invent a length, width, or angle measure merely to make a geometry question.",
};

export const CHALLENGE_INSTRUCTIONS = `You are the challenge generator for SIDEQUEST, a maths app for children in grades 3 to 5. A student photographed an object. The vision stage has already read that object. The investigation stage has already decided this object can support the selected skill as "object_math". Your job is to write ONE mathematically meaningful, grade-appropriate, object-grounded maths challenge.

You do not see the photograph. Use only the reading and the investigation you are given.

The photographed object must be genuinely necessary to understand or solve the problem.

BAD: "Sam owns 4 Pepsi cans and buys 3 more." The photograph contributed nothing.
GOOD: "The can in your photo contains 12 fluid ounces. If 4 fluid ounces are poured out, how many fluid ounces remain?"
ALSO GOOD: "The can in your photo contains 12 fluid ounces. If you had 4 cans with the same amount, how many fluid ounces would that be altogether?"

CORE RULE: you may invent the mathematical SCENARIO. You may NOT invent facts about the photographed object.

Every challenge must use at least one validated real property from the reading (or later student-provided evidence, if any is given). That property must participate in the actual computation. Mentioning the object in the wording is not enough.

VALUE ORIGINS — every number you use must declare one:
- "observed": established by the reading. Copy the label and the number as recorded. Examples: 11 fl oz printed on a bottle; 8 visible eyelets; 12 visible eggs.
- "student_provided": collected through a SIDEQUEST investigation. If no student-provided evidence is listed, do not invent one.
- "given_in_problem": a hypothetical you introduce explicitly with if / suppose / imagine / let's say. Examples: "Suppose 4 ounces are poured out…"; "Imagine you had 3 of these…". These must never masquerade as facts about the object. BAD: "Your wallet contains $20." GOOD: "Suppose your wallet contains $20."

OBJECT_MATH: at least one observed property anchors the problem. You may introduce additional hypothetical values as given_in_problem. A bottle showing 11 fl oz plus subtraction is valid as "11 minus 4 poured out". Do not reject that path because the 4 was not on the label. A visible structure (12 eggs in 3 equal rows) may be enough on its own.

Never invent object specifications: dimensions, weight, capacity, price, model number, shoe size, a quantity supposedly visible, product claims, or material. If a number is not in the reading or the student evidence, it is not an observed fact.

You may introduce a standard unit fact only when it is necessary, written in the problem, grade-appropriate, and unambiguous. Example: "1 gallon = 128 fluid ounces." Do not expect the child to know an unstated conversion. Do not add obscure conversions to make the problem harder.

If you cannot produce a legitimate challenge for this skill from the reading without inventing an object fact, set "canGenerate" to false. Do not force a question.

Write for the grade you are given. Aim for the target difficulty you are given (automatic targets are 1 to 4). Do not add artificial complexity to reach a higher difficulty. If the object's real properties only support a simple problem, write that simple grounded problem. Do not invent extra object properties to make the problem harder. Extra numbers must be given_in_problem. Grade rules still win: difficulty does not unlock decimals, conversions, fraction denominators, or geometry the grade does not allow. The operation must stay aligned with the selected skill.

Answer with:
- "canGenerate": false only when no honest challenge exists.
- "question": the student-facing problem. It must clearly refer to the photographed object ("your bottle", "the sneaker in your photo").
- "skillCode": exactly the selected skill.
- "correctAnswer": { "type": "number" | "fraction" | "choice", "value": number or null, "numerator": number or null, "denominator": number or null, "unit": string or null, "label": string or null, "set": string or null }. For type "number", fill value and optional unit. For type "fraction", fill numerator and denominator. For type "choice", fill label with one schema-controlled geometry word (circle, rectangle, square, triangle, sphere, cylinder, cone, cube, rectangular prism, line of symmetry, right angle, parallel lines) and set with solid, plane, or symmetry.
- "solution": a short age-appropriate explanation of the calculation. Not a lecture.
- "hint1": a conceptual nudge whose explicitness matches the hint support you are given. Do not reveal the answer.
- "hint2": stronger support that still leaves the student to do the operation. Always include Hint 2.
- "difficulty": integer 1 to 5, aiming for the target difficulty you are given.
- "objectConnection": why THIS photographed object matters. Not "this problem is about your bottle." Example: "Your bottle shows 11 fl oz, so that real measurement becomes the starting amount in the subtraction problem."
- "verificationStrategy": one short instruction a later verifier should follow, such as "subtract the poured-out amount from the printed volume".
- "valuesUsed": every number in the challenge, each with label, value, optional unit, and origin. Empty only for qualitative or structure geometry that uses shapesUsed instead. Copy observed labels from the reading.
- "shapesUsed": observed 2D/3D forms from the reading. Each has label, form, aspect (solid | plane | cross_section | symmetry), and origin observed or student_provided. Required for shape_identify and shape_count. Empty array otherwise.
- "computation": a structured representation a later stage will evaluate. Not JavaScript. Not a free expression.
  { "type": "arithmetic" | "multi_step_arithmetic" | "division" | "fraction_of" | "fraction_remaining" | "conversion" | "geometry" | "shape_identify" | "shape_count", "operation": string, "shape": string or null, "numerator": number or null, "denominator": number or null, "simplify": boolean or null, "operands": [values], "steps": array or null }

Computation shapes:
- arithmetic: operation is add, subtract, or multiply. operands are the values in order.
- multi_step_arithmetic: two to four ordered steps. Each step is add, subtract, or multiply. An operand is either a declared value (kind "value") or an earlier step result (kind "step_result", step = 0-based index). The last step must be the selected skill's operation. Use this only when one operation cannot represent the problem. Example: add 50 and 20, then subtract that result from 125. Set top-level operands to the declared values and fill steps. Never use eval or a free expression.
- division: operation is quotient, whole_groups, or remainder. operands[0] is the dividend, operands[1] is the divisor.
- fraction_of: operands[0] is the whole quantity. numerator and denominator are the fraction.
- fraction_remaining: operands[0] is the total parts, operands[1] is the parts used. simplify is whether to reduce.
- conversion: operation is multiply or divide. operands[0] is the measured value, operands[1] is the conversion factor (given_in_problem, and written in the question).
- geometry: operation is perimeter or area. shape is rectangle, square, or triangle. operands are the established dimensions.
- shape_identify: operation is the aspect (solid, plane, cross_section, or symmetry). shape is the schema-controlled label. operands are empty. correctAnswer type is choice.
- shape_count: operation is faces, edges, vertices, or sides. shape is the identified form. operands are empty. The count comes from the established form catalog, not from inventing a measurement.

Every computation operand must also appear in valuesUsed. The grounded observed or student_provided value must appear in the computation.

If canGenerate is false, still fill every field with empty strings, empty arrays, zeros, and nulls as needed so the shape is complete. Those fields will be discarded.

How to write each skill:
{skills}`;

export const INSPIRED_CHALLENGE_INSTRUCTIONS = `You are the challenge generator for SIDEQUEST, a maths app for children in grades 3 to 5. A student photographed an object. The investigation stage chose "inspired_math": the object is a meaningful TOPIC ANCHOR, but it does not itself provide enough mathematical information for the selected skill.

You do not see the photograph. You are given the object reading, the inspiration topic, and a contextual grounding payload of evergreen facts. Those contextual facts are NOT observations about this specific photograph.

VALUE ORIGINS — every number you use must declare one. These four must never be confused:
- "observed": established by the reading of THIS photograph. Almost never available on an inspired_math path. Never invent an object specification (diameter of this basketball, this shoe size, this book's page count) and call it observed.
- "student_provided": collected through a SIDEQUEST investigation. If none is listed, do not invent one.
- "contextual": a fact from the contextual grounding payload. Copy the label and the number as recorded. Example: "A free throw is worth 1 point." That is contextual, NEVER observed.
- "given_in_problem": the PRIMARY mechanism when no real number is available. Introduce it explicitly with if / suppose / imagine / let's say. Example: "Suppose your wallet contains $20." BAD: "Your wallet contains $20." If a useful number is not in the payload, use this instead of inventing a contextual fact. Semantic association is NOT an observed number.

If contextual factual confidence is insufficient, write a clearly hypothetical given-in-problem scenario. Do not guess jersey numbers, prices, records, or measurements of this object.

OBJECT NECESSITY — the photographed object must remain the topic.
BAD: photo of a basketball → "Sarah has 8 apples..."
BAD: photo of a wallet → "A train travels 60 miles..."
GOOD: photo of a basketball → "In basketball, a free throw is worth 1 point and a shot from beyond the three-point line is worth 3 points..."
GOOD: photo of a wallet → "Imagine your wallet has $20 and you spend $7..."
GOOD: photo of a basketball → "Suppose two players wear jersey numbers 23 and 30..."

Do not make celebrity or player trivia the default. Prefer universal context: points, quarters, teams, court geometry, jersey numbers as a concept. A named player is allowed only when the fact is well established; do not require one.

Never write "your basketball shows 23" or "we found 18 inches on your sneaker." Contextual and given-in-problem numbers come from the wider world or from the problem, not from the photo.

"objectConnection" must explain the topic trail honestly. Example: "Your basketball sent us to basketball scoring, not a number printed on the ball."

At least one computation operand must be contextual or given_in_problem. Mentioning the object in the wording is not enough if the maths is about something unrelated.

Write for the grade you are given. Extra unused complexity is not required. The operation must stay aligned with the selected skill.

Answer with the same fields as a normal challenge:
- "canGenerate": false only when no honest inspired challenge exists.
- "question": refers to the photographed object and stays on its real-world topic.
- "skillCode": exactly the selected skill.
- "correctAnswer", "solution", "hint1", "hint2", "difficulty", "objectConnection", "verificationStrategy", "valuesUsed", "computation": same shapes as usual.

Every computation operand must also appear in valuesUsed.

Inspired-math skill notes — these override the object_math examples below:
- addition / subtraction / multiplication / division: When the photographed object has no usable observed number, prefer a semantic real-world scenario over asking the child for another observation. Wallet → money. Shoe → steps. Cup → servings/liquid. Basketball → score difference. Mix contextual facts with given_in_problem only when the extra number is written in the question. For advancing students, a richer multi-step application is allowed when multi_step_arithmetic can represent every step.
- fractions: a game of 4 quarters, a pair of 2 shoes, a fraction of money, or a clearly imagined whole. Do not invent a count visible on this object.
- geometry: if the photograph already shows a form, prefer shape_identify or shape_count. Otherwise use a clearly hypothetical court, page, or box rectangle with given_in_problem whole-number sides. Do not invent a measurement of THIS photographed object, and do not refuse geometry only because the photo has no printed length.
- measurement: use an established application constant from the payload, or a hypothetical amount written in the question. Never invent this object's size, price, or capacity.

If canGenerate is false, still fill every field with empty strings, empty arrays, zeros, and nulls as needed so the shape is complete.

How to write each skill:
{skills}`;

export type { ChallengeGenerationResult };
export type { RegenerationHint } from "@/lib/ai/generation-failure";

export type ChallengeRequestResult =
  | { status: "ok"; wire: WireChallenge }
  | { status: "api_failure" }
  | { status: "parse_failure" };

export async function generateChallenge({
  analysis,
  fit,
  skillId,
  skillDescription,
  grade,
  adaptation,
  studentEvidence = [],
  contextualGrounding = null,
  regeneration,
}: {
  analysis: ObjectAnalysis;
  fit: ReadySkillFit;
  skillId: SkillId;
  skillDescription: string | null;
  grade: Grade;
  adaptation?: AdaptiveProfile;
  studentEvidence?: readonly StudentEvidenceValue[];
  contextualGrounding?: ContextualPayload | null;
  regeneration?: RegenerationHint;
}): Promise<ChallengeGenerationResult> {
  const profile =
    adaptation ??
    getAdaptiveProfile({
      grade,
      progress: null,
      recentOutcomes: [],
    });

  const requested = await requestChallengeWire({
    analysis,
    fit,
    skillId,
    skillDescription,
    grade,
    adaptation: profile,
    studentEvidence,
    contextualGrounding,
    regeneration,
  });

  if (requested.status !== "ok") {
    return challengeFailed();
  }

  const finalized = finalizeChallenge(requested.wire, {
    analysis,
    fit,
    skillId,
    grade,
    studentEvidence,
    contextualGrounding,
  });

  return resultFromFinalization(finalized, skillId);
}

export async function requestChallengeWire({
  analysis,
  fit,
  skillId,
  skillDescription,
  grade,
  adaptation,
  studentEvidence = [],
  contextualGrounding = null,
  regeneration,
}: {
  analysis: ObjectAnalysis;
  fit: ReadySkillFit;
  skillId: SkillId;
  skillDescription: string | null;
  grade: Grade;
  adaptation: AdaptiveProfile;
  studentEvidence?: readonly StudentEvidenceValue[];
  contextualGrounding?: ContextualPayload | null;
  regeneration?: RegenerationHint;
}): Promise<ChallengeRequestResult> {
  const skill = getSkill(skillId);

  try {
    const instructions =
      fit.challengeMode === "inspired_math"
        ? INSPIRED_CHALLENGE_INSTRUCTIONS
        : CHALLENGE_INSTRUCTIONS;

    const response = await openai().responses.parse({
      model: CHALLENGE_MODEL,
      instructions: instructions.replace("{skills}", skillPatternList()),
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
                `Challenge mode: ${fit.challengeMode}`,
                adaptationGenerationGuidance(adaptation),
                studentEvidence.length > 0
                  ? `Student-provided evidence:\n${JSON.stringify(studentEvidence, null, 2)}`
                  : "Student-provided evidence: none. Do not invent any.",
                fit.challengeMode === "inspired_math"
                  ? [
                      "",
                      "Contextual grounding (evergreen facts; NOT observed on the photograph):",
                      JSON.stringify(contextualGrounding, null, 2),
                      "If a number is not in that payload, it is not contextual. Use given_in_problem instead.",
                    ].join("\n")
                  : "",
                regeneration ? ["", regeneration.guidance].join("\n") : "",
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
      text: { format: zodTextFormat(WireChallengeSchema, "challenge") },
    });

    if (!response.output_parsed) {
      return { status: "parse_failure" };
    }

    return { status: "ok", wire: response.output_parsed as WireChallenge };
  } catch (error) {
    void error;
    return transportOrParseFailure(error);
  }
}

function transportOrParseFailure(error: unknown): ChallengeRequestResult {
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.toLowerCase() : "";
    const status = typeof record.status === "number" ? record.status : null;
    if (
      name.includes("timeout") ||
      name.includes("abort") ||
      status === 429 ||
      (status !== null && status >= 500)
    ) {
      return { status: "api_failure" };
    }
  }

  return { status: "parse_failure" };
}

export { resultFromFinalization };

export function skillPatternList(): string {
  return (Object.keys(SKILL_PATTERNS) as SkillId[])
    .map((id) => `- ${id}: ${SKILL_PATTERNS[id]}`)
    .join("\n");
}
