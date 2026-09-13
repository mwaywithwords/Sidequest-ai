import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  buildAnchors,
  canGenerateFromMode,
  MIN_FIT_SCORE,
  resolveInvestigation,
} from "@/lib/ai/investigation-path";
import { openai } from "@/lib/ai/openai";
import {
  CHALLENGE_MODES,
  EVIDENCE_REQUEST_TYPES,
  type EvidenceRequest,
  EvidenceRequestSchema,
  type ObjectAnalysis,
  type QuestGenerationFailure,
  QuestGenerationFailureSchema,
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
 * subtraction with a hypothetical amount poured out; a sneaker with no visible
 * number can still be investigated by asking for the size label.
 *
 * The camera starts the investigation. It does not have to finish it.
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
    "adding to an observed quantity; combining groups; totals; counts; measurements; hypothetical increases; comparing quantities. Example: 8 visible eyelets → 'if 3 more were added…'",
  subtraction:
    "removing from an observed quantity; amounts remaining; differences; measurement differences; capacity remaining; counts remaining; comparisons. Example: a bottle labelled 11 fl oz → 'if 4 ounces are poured out…' is a grounded_scenario, not a poor fit. One visible quantity is enough.",
  multiplication:
    "repeated units; repeated groups; rows; columns; pairs; scaling a real observed quantity; 'what if you had N of these?'. Example: one sneaker with 8 eyelets → 'if 4 sneakers had the same number…'",
  division:
    "equal sharing; grouping; portions; capacity divided among containers; quantities per group; repeated components. Example: 12 visible objects → 'if they were divided equally among 3 groups…'",
  fractions:
    "equal parts; portions; sections; ratios; containers; clocks; groups; fractional use of a real quantity. A visible whole can be enough; do not require printed numerators.",
  measurement:
    "visible measurements; student measurement of length, width, height, volume, capacity, or time; comparisons. If no number is printed, asking the student to measure one side is needs_evidence, not poor_fit.",
  geometry:
    "recognisable 2D shapes; recognisable 3D forms; angles; symmetry; perimeter; area; spatial relationships; repeated geometric structures. Do not require printed numbers.",
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

const WireSkillFitSchema = z.strictObject({
  challengeMode: z.enum(CHALLENGE_MODES),
  fitScore: z.number(),
  usableProperties: z.array(z.string()),
  reason: z.string(),
  suggestedObjectCharacteristics: z.array(z.string()),
  alternativeSkillCodes: z.array(z.enum(SKILL_IDS)),
  evidenceRequest: WireEvidenceRequestSchema.nullable(),
});

const INSTRUCTIONS = `You are the math-investigation stage of SIDEQUEST, a maths app for children in grades 3 to 5. A student chose a maths skill, then photographed an object. The vision stage has already read that object. Its reading is given to you as JSON. Your job is to decide whether this real-world object can support a legitimate, grade-appropriate mathematical investigation for the selected skill.

Do not ask: "Does this single photograph already contain every number needed to make a math problem?"
Ask: "Can this object support a legitimate investigation for this skill?"

An ordinary object must not be rejected simply because the first photograph contains no obvious numbers. Investigate before giving up. The camera starts the investigation; it does not have to finish it.

The reading is your only evidence about the object. Do not introduce any measurement, quantity, dimension, capacity, price, specification, or fact about the object that is not already in it. If a number is not in the reading, it does not exist as an OBSERVED fact.

You MAY plan a hypothetical maths situation that a later stage will write. You may NOT invent facts about the photographed object.

Value origins a later Challenge Generator will use — understand them, do not invent the third:
- OBSERVED: a fact in the reading.
- STUDENT_PROVIDED: something the student will look up, count, or measure.
- GIVEN_IN_PROBLEM: a hypothetical a later stage may introduce ("if 4 ounces are poured out"). You do not invent those values now.

Four challenge modes. Choose the strongest honest path, in this order:

1. "direct" — the reading already contains enough grounded information to create a legitimate challenge. Examples: 12 visible eggs; 6 visible compartments; 8 visible repeated pieces; a clearly readable measurement; a recognisable geometric structure sufficient for the selected skill.

2. "grounded_scenario" — the photograph contains at least one real property that can anchor a challenge, and a later stage may introduce additional hypothetical values. The object must remain mathematically necessary because the starting quantity or structure came from it.
   Example: a bottle whose reading includes printed volume 11 fl oz, skill subtraction. This is a valid grounded_scenario. Future challenge: "This bottle holds 11 fluid ounces. If 4 fluid ounces are poured out, how many remain?" 11 is OBSERVED. 4 will be GIVEN_IN_PROBLEM. One visible quantity is enough. Do not require a second visible number.

3. "needs_evidence" — the object naturally supports the skill, but SIDEQUEST needs one small additional observation. Do NOT reject the quest. Ask the student to investigate further. Examples:
   - Sneaker: "Find the size label inside your sneaker and take a picture of it."
   - Table: "Measure one side of the table."
   - LEGO structure: "How many blocks are in one row?"
   - Book: "Can you find the total number of pages?"
   - Container: "Can you find a label showing how much it holds?"
   Choose the simplest legitimate request for this grade.

4. "poor_fit" — LAST RESORT. Use this only when you cannot find a legitimate path through existing observable properties, a grounded hypothetical scenario, counting, measurement, comparison, geometry, repeated groups, equal sharing, portions, spatial reasoning, one simple student question, or one additional supporting photograph. Ordinary objects (a sneaker, a book, a chair, a pillow, a toy car, a bottle) almost always have a path.

Ordinary-object reminders:
- Sneaker: do not fail for lack of a printed number. Measurement can ask for heel-to-toe length or a size-label photo. Subtraction can wait for shoe size or length. Multiplication can use visible eyelets, lace crossings, or tread — or ask the student to count one. Geometry can use symmetry, sole shape, curves, angles, repeated tread.
- Bottle labelled 11 fl oz + subtraction is grounded_scenario, not poor_fit.
- Book: page count, dimensions, rectangular geometry, thickness, pages read vs remaining. If page count is not visible, ask for it.
- Toy car: wheel count, symmetry, shapes, length, repeated wheels, hypothetical scaling.
- Chair: legs, geometry, symmetry, height, seat dimensions, grouping.
- Pillow: rectangular/square geometry, symmetry, length and width, perimeter, area after collecting measurements. A pillow is not mathematically useless.

How to investigate each skill:
{skills}

Answer with:
- "challengeMode": one of the four modes above.
- "fitScore": 0 to 1, how naturally this object supports an investigation for the selected skill at this grade. A moderate score can still be an excellent needs_evidence path. A high score is required only for "direct".
- "usableProperties": entries of the reading that could anchor the maths, copied verbatim. Copy a countable, shape, or observable property exactly as written. Copy visible text exactly as written, and only when the text itself carries usable mathematical information. Write a measurement as "label: value unit", for example "printed bottle volume: 11 fl oz". Anything not copied verbatim will be discarded.
- "reason": one or two factual sentences on why this path was chosen. Written for an engineer or a teacher reading a log, not for the student.
- "suggestedObjectCharacteristics": what a better object for this skill would have. Fill this in only for poor_fit; use an empty array otherwise.
- "alternativeSkillCodes": skill codes that this object's properties would suit better than the selected skill. Never include the selected skill. Empty when nothing else fits, and empty for needs_evidence.
- "evidenceRequest": required when challengeMode is needs_evidence; null otherwise. Shape:
  { "type": "second_photo" | "student_measurement" | "student_count" | "student_input", "prompt": string, "targetProperty": string, "reason": string }
  "prompt" and "reason" are shown to the student. Do not state a number as a fact about the object. Ask them to find, count, or measure it. Pick the simplest type that would produce a real anchor.

Grade matters. A property can support a skill in principle and still be wrong for the grade. Judge the path for the grade you are given. Prefer the simplest legitimate investigation.`;

/**
 * A path ready for a future challenge, a path waiting on one more observation,
 * a path that is honestly poor, or a stage that did not work.
 */
export type SkillFitResult =
  | { status: "ok"; fit: Extract<SkillFitAnalysis, { challengeMode: "direct" | "grounded_scenario" }> }
  | { status: "needsEvidence"; fit: Extract<SkillFitAnalysis, { challengeMode: "needs_evidence" }> }
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

  const resolved = resolveInvestigation(
    {
      challengeMode: wire.challengeMode,
      fitScore: wire.fitScore,
      reason: wire.reason,
      evidenceRequest,
    },
    grounded,
  );

  const parsed = SkillFitAnalysisSchema.safeParse({
    selectedSkillCode: skillId,
    fitScore: wire.fitScore,
    challengeMode: resolved.challengeMode,
    canGenerateChallenge: canGenerateFromMode(resolved.challengeMode),
    usableProperties: grounded,
    reason: resolved.reason,
    suggestedObjectCharacteristics:
      resolved.challengeMode === "poor_fit"
        ? wire.suggestedObjectCharacteristics
        : [],
    alternativeSkillCodes: [
      ...new Set(wire.alternativeSkillCodes.filter((code) => code !== skillId)),
    ],
    anchors: buildAnchors(grounded, resolved.evidenceRequest),
    evidenceRequest: resolved.evidenceRequest,
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

  if (fit.challengeMode === "needs_evidence") {
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
