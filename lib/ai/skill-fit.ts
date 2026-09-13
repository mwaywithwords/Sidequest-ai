import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  buildAnchors,
  canGenerateFromMode,
  MIN_FIT_SCORE,
  recoverInvestigation,
  resolveInvestigation,
} from "@/lib/ai/investigation-path";
import { openai } from "@/lib/ai/openai";
import {
  CHALLENGE_MODES,
  EVIDENCE_REQUEST_TYPES,
  type EvidenceRequest,
  EvidenceRequestSchema,
  type InspirationContext,
  InspirationContextSchema,
  type InvestigationMathFit,
  type ObjectAnalysis,
  type QuestGenerationFailure,
  QuestGenerationFailureSchema,
  type ReadySkillFit,
  type SkillFitAnalysis,
  SkillFitAnalysisSchema,
} from "@/lib/ai/schemas";
import { copy } from "@/lib/copy";
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

export { MIN_FIT_SCORE };

/**
 * What each skill has a natural claim on, including paths that need one more
 * observation. Model-facing pedagogy, so it lives here rather than on the
 * `Skill` records shipped to the browser.
 */
const SKILL_INVESTIGATION: Record<SkillId, string> = {
  addition:
    "adding to an observed quantity; combining groups; totals; counts; measurements; hypothetical increases; comparing quantities; money and prices when the object is a wallet or similar. Example: 8 visible eyelets → object_math. A wallet with no visible amount → inspired_math via money, not poor_fit.",
  subtraction:
    "removing from an observed quantity; amounts remaining; differences; measurement differences; capacity remaining; counts remaining; comparisons. Example: a bottle labelled 11 fl oz → object_math, not a poor fit. One visible quantity is enough. A sneaker without a size → investigation_math.",
  multiplication:
    "repeated units; repeated groups; rows; columns; pairs; scaling a real observed quantity; inventory. Example: one sneaker with 8 eyelets → object_math. If eyelets are not counted yet, ask the student to count one side.",
  division:
    "equal sharing; grouping; portions; capacity divided among containers; quantities per group; repeated components. Example: 12 visible objects → object_math. A basketball can use quarters or equal teams as inspired_math.",
  fractions:
    "equal parts; portions; sections; ratios; containers; clocks; groups; quarters; fractional use of a real quantity. A visible whole or circular structure can be enough; do not require printed numerators.",
  measurement:
    "visible measurements; student measurement of length, width, height, volume, capacity, or time; comparisons. If no number is printed, asking the student to measure one side is investigation_math, not poor_fit.",
  geometry:
    "recognisable 2D shapes; recognisable 3D forms; angles; symmetry; curves; circular tops; spheres; rectangles; parallel or perpendicular lines; repeated geometric structures. Observable shape is enough. Do not require printed dimensions. A basketball, bottle, sneaker, or window is object_math when its shape is visible.",
};

/**
 * What the model answers, which is less than the schema holds.
 *
 * `selectedSkillCode` is the student's choice and is filled in afterwards.
 * `canGenerateChallenge` and `anchors` are derived from the resolved path, not
 * asked of the model. `evidenceRequest` is nullable on the wire so structured
 * outputs can return null when the path does not need one.
 */
const WireEvidenceRequestSchema = z.strictObject({
  type: z.enum(EVIDENCE_REQUEST_TYPES),
  prompt: z.string(),
  targetProperty: z.string(),
  reason: z.string(),
});

const WireInspirationContextSchema = z.strictObject({
  topic: z.string(),
  reason: z.string(),
});

const WireSkillFitSchema = z.strictObject({
  challengeMode: z.enum(CHALLENGE_MODES),
  fitScore: z.number(),
  usableProperties: z.array(z.string()),
  reason: z.string(),
  suggestedObjectCharacteristics: z.array(z.string()),
  alternativeSkillCodes: z.array(z.enum(SKILL_IDS)),
  evidenceRequest: WireEvidenceRequestSchema.nullable(),
  inspirationContext: WireInspirationContextSchema.nullable(),
});

const INSTRUCTIONS = `You are the math-investigation stage of SIDEQUEST, a maths app for children in grades 3 to 5. A student chose a maths skill, then photographed an object. The vision stage has already read that object. Its reading is given to you as JSON. Your job is to decide whether this real-world object can support a legitimate, grade-appropriate mathematical investigation for the selected skill.

Do not ask: "Does this single photograph already contain every number needed to make a math problem?"
Ask: "Can this object meaningfully ANCHOR a mathematical exploration for this skill?"

The photographed object must stay the topic of the maths. It does not always have to contain every number used in a later calculation. An ordinary object must not be rejected simply because the first photograph contains no obvious numbers.

The reading is your only evidence about the object. Do not introduce any measurement, quantity, dimension, capacity, price, specification, or fact about the object that is not already in it. If a number is not in the reading, it does not exist as an OBSERVED fact.

You MAY plan a later hypothetical maths situation. You may NOT invent facts about the photographed object. You may NOT change the selected skill.

Value origins a later Challenge Generator will use — understand them, do not invent the third:
- OBSERVED: a fact in the reading.
- STUDENT_PROVIDED: something the student will look up, count, or measure.
- GIVEN_IN_PROBLEM: a hypothetical a later stage may introduce ("if 4 ounces are poured out"). You do not invent those values now.

Exhaust three paths, in this order. Only after all three fail may you return poor_fit.

1. "object_math" — use properties already in the reading. Visible quantities, measurements, counts, shapes, symmetry, patterns, grouping, and spatial structure all count. A later stage may add a hypothetical given_in_problem value around an observed anchor.
   Examples:
   - Bottle showing 11 fl oz + subtraction. Future challenge: "This bottle holds 11 fluid ounces. If 4 fluid ounces are poured out, how many remain?" 11 is OBSERVED. 4 will be GIVEN_IN_PROBLEM. One visible quantity is enough.
   - Sneaker with 8 visible eyelets + multiplication.
   - Window with a rectangular shape + geometry.
   - Clock with numbers or a circular structure + fractions or geometry.
   Geometry does NOT need a printed measurement. A sphere, cylinder-like form, circle, rectangle, curve, angle, or symmetry is enough.

2. "investigation_math" — the object is promising, but one simple student observation would unlock the selected skill. Do NOT reject the quest. Keep the original image. Ask for ONE useful piece of evidence (supporting photo, measurement, count, or short answer).
   Examples:
   - Basketball + measurement: "Measure around the widest part of the basketball."
   - Sneaker + subtraction: "Find the size label or measure the shoe from heel to toe."
   - Pillow + geometry: "Measure the long side and short side."
   - Sneaker + multiplication: "Count the eyelets on one side."
   - Book + fractions: "How many chapters are in the book?"
   Choose the simplest legitimate request for this grade.

3. "inspired_math" — the object's physical properties do not naturally provide the selected skill, but its REAL-WORLD CONTEXT can legitimately inspire a grade-appropriate investigation. The object remains the topic anchor even when later numbers come from that context or are given in the problem.
   GOOD: photo of a basketball → jersey numbers, basketball scores, court dimensions, hoop geometry, team statistics, or quarters/fractions.
   GOOD: photo of a wallet → money, prices, budgeting, adding or subtracting amounts, grouping currency.
   GOOD: photo of a book → pages, chapters, reading quantities, publishing or design context.
   GOOD: photo of a sneaker → shoe sizes, pairs, inventory, measurement.
   GOOD: photo of a car → wheels, distance, speed, fuel, geometry.
   BAD: photo of a basketball → "There are 8 apples and 4 are eaten." That is not connected to the object.
   Do not invent unsupported historical facts. Do not invent a measurement as if it were on the object. Put the connection in inspirationContext.

4. "poor_fit" — LAST RESORT. Use this only after you have considered visible quantities, measurements, counts, shapes, symmetry, patterns, grouping, sharing, comparison, one additional student observation, and meaningful real-world context associated with the object. A common, identifiable, safe everyday object should usually have a path.

Ordinary-object reminders:
- Basketball: geometry is object_math from sphere, circles, curved surface, or symmetry. Measurement without a printed number is investigation_math. Addition, scores, jersey numbers, or quarters can be inspired_math. Never poor_fit just because no number is printed.
- Protein bottle + geometry is object_math from cylinder-like form, circular top, or symmetry. A printed volume supports the other skills as object_math.
- Wallet: addition and subtraction are not automatically poor_fit. Use inspired_math via money or prices, or investigation_math if a count or measurement would help.
- Sneaker: do not fail for lack of a printed size. Measurement asks for heel-to-toe length or a size-label photo. Geometry uses symmetry, curves, angles, or tread.
- Book: pages, chapters, rectangular geometry. If a count is not visible, ask for it or use inspired_math.

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
export type SkillFitResult =
  | { status: "ok"; fit: ReadySkillFit }
  | { status: "needsEvidence"; fit: InvestigationMathFit }
  | { status: "poorFit"; fit: Extract<SkillFitAnalysis, { challengeMode: "poor_fit" }>; failure: QuestGenerationFailure }
  | { status: "failed"; failure: QuestGenerationFailure };

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
    instructions: INSTRUCTIONS.replace("{skills}", skillInvestigationList()),
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

    return failed();
  }

  // Grounding, enforced rather than requested: each property the model listed
  // is looked up in the reading, and what survives is the reading's own wording.
  const grounded = groundProperties(wire.usableProperties, analysis);

  if (grounded.length < wire.usableProperties.length) {
    console.warn("[skill-fit] discarded properties absent from the reading", {
      listed: wire.usableProperties.length,
      grounded: grounded.length,
    });
  }

  const evidenceRequest = parseEvidenceRequest(wire.evidenceRequest);
  const inspirationContext = parseInspirationContext(wire.inspirationContext);

  const resolvedWire = resolveInvestigation(
    {
      challengeMode: wire.challengeMode,
      fitScore: wire.fitScore,
      reason: wire.reason,
      evidenceRequest,
      inspirationContext,
    },
    grounded,
  );

  const recovered = recoverInvestigation(resolvedWire, analysis, skillId);
  const resolved = recovered.resolved;
  const usableProperties = uniqueProperties([
    ...grounded,
    ...recovered.usableProperties,
  ]);

  const parsed = SkillFitAnalysisSchema.safeParse({
    selectedSkillCode: skillId,
    fitScore: wire.fitScore,
    challengeMode: resolved.challengeMode,
    canGenerateChallenge: canGenerateFromMode(resolved.challengeMode),
    usableProperties,
    reason: resolved.reason,
    suggestedObjectCharacteristics:
      resolved.challengeMode === "poor_fit"
        ? wire.suggestedObjectCharacteristics
        : [],
    alternativeSkillCodes: [
      ...new Set(wire.alternativeSkillCodes.filter((code) => code !== skillId)),
    ],
    anchors: buildAnchors(usableProperties, resolved.evidenceRequest),
    evidenceRequest: resolved.evidenceRequest,
    inspirationContext: resolved.inspirationContext,
  });

  if (!parsed.success) {
    console.warn(
      "[skill-fit] judgement failed validation",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
      })),
    );

    return failed();
  }

  const fit = parsed.data;

  if (fit.challengeMode === "investigation_math") {
    return { status: "needsEvidence", fit };
  }

  if (fit.challengeMode === "poor_fit") {
    return {
      status: "poorFit",
      fit,
      failure: QuestGenerationFailureSchema.parse({
        reason: "poor_skill_fit",
        studentMessage: poorFitMessage(skillId, fit.alternativeSkillCodes),
        recommendedNextAction:
          fit.alternativeSkillCodes.length > 0
            ? "choose_different_skill"
            : "find_different_object",
      }),
    };
  }

  return { status: "ok", fit };
}

/**
 * The evidence request is student-facing, so it has to pass the same schema
 * the rest of the application uses. A request the model shaped badly is
 * treated as absent, which may downgrade the path.
 */
function parseEvidenceRequest(value: unknown): EvidenceRequest | null {
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  const clip = (field: unknown, max: number) =>
    typeof field === "string" ? field.trim().slice(0, max) : field;

  const parsed = EvidenceRequestSchema.safeParse({
    ...record,
    prompt: clip(record.prompt, 200),
    targetProperty: clip(record.targetProperty, 80),
    reason: clip(record.reason, 200),
  });

  return parsed.success ? parsed.data : null;
}

function parseInspirationContext(value: unknown): InspirationContext | null {
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  const clip = (field: unknown, max: number) =>
    typeof field === "string" ? field.trim().slice(0, max) : field;

  const parsed = InspirationContextSchema.safeParse({
    topic: clip(record.topic, 120),
    reason: clip(record.reason, 280),
  });

  return parsed.success ? parsed.data : null;
}

function uniqueProperties(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/**
 * Matches the model's list against the reading, and returns the reading's
 * wording for everything that matched.
 *
 * Comparison is loose about punctuation, case, and spacing, and strict about
 * everything else. A measurement can be cited three ways — the full
 * "label: value unit", the label alone, or the value and unit — because all
 * three name the same recorded fact, and none of them is a new one.
 */
function groundProperties(
  listed: readonly string[],
  analysis: ObjectAnalysis,
): string[] {
  const recorded = new Map<string, string>();

  const record = (canonical: string, ...spellings: string[]) => {
    for (const spelling of [canonical, ...spellings]) {
      const key = normalise(spelling);
      if (key && !recorded.has(key)) recorded.set(key, canonical);
    }
  };

  for (const text of analysis.visibleText) record(text);

  for (const measurement of analysis.visibleMeasurements) {
    const { label, value, unit } = measurement;
    record(`${label}: ${value} ${unit}`, label, `${value} ${unit}`);
  }

  for (const property of [
    ...analysis.countableProperties,
    ...analysis.shapeProperties,
    ...analysis.observableProperties,
  ]) {
    record(property);
  }

  const grounded = listed
    .map((property) => recorded.get(normalise(property)))
    .filter((property): property is string => property !== undefined);

  return [...new Set(grounded)];
}

function normalise(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/, "");
}

/**
 * The student's side of a poor fit: what could not be found, what to look for
 * instead, and — only when the object really suits one — which other mission
 * would work.
 */
function poorFitMessage(skillId: SkillId, alternatives: readonly SkillId[]) {
  const skill = getSkill(skillId);
  const alternative = alternatives[0];

  return [
    copy.fit.noChallenge(skill.label.toLowerCase()),
    copy.fit.tryInstead(skill.lookFor),
    alternative
      ? copy.fit.alternative(getSkill(alternative).label.toLowerCase())
      : null,
  ]
    .filter((sentence) => sentence !== null)
    .join(" ");
}

/** The stage misbehaved, which is not the student's photograph's fault. */
function failed(): SkillFitResult {
  return {
    status: "failed",
    failure: QuestGenerationFailureSchema.parse({
      reason: "generation_failure",
      studentMessage: copy.fit.failure,
      recommendedNextAction: "retry",
    }),
  };
}

/** The investigation table as prompt text, in the order the setup screen offers. */
function skillInvestigationList(): string {
  return SKILLS.map(
    (skill) => `- ${skill.id} (${skill.label}): ${SKILL_INVESTIGATION[skill.id]}`,
  ).join("\n");
}
