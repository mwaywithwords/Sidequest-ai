import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { openai } from "@/lib/ai/openai";
import {
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
 * Deciding whether this object actually supports the skill the student chose.
 *
 * The stage exists to be allowed to say no. A model asked to find fractions in a
 * wooden spoon will find some, and the result is the thing SIDEQUEST is supposed
 * to be the opposite of: a worksheet problem with a photograph stapled to it. So
 * the fit is judged before anything is generated, and a weak fit ends the quest
 * rather than lowering the bar for it.
 *
 * Works from the validated `ObjectAnalysis` and nothing else. The photograph is
 * not fetched again and no new fact about the object may enter here: every
 * property this stage reports has to be traceable back to something the vision
 * stage already recorded, and that is enforced below rather than trusted.
 */

/**
 * The same model the reading uses. This is the pedagogical judgement in the
 * product — whether a connection is honest, and whether it suits a grade-3
 * student rather than a grade-5 one — and it runs on a page of JSON, so it is
 * cheap to do properly.
 */
const FIT_MODEL = "gpt-5.4";

/**
 * The fit a challenge needs before it is worth building.
 *
 * One constant, and the only number in the stage. 0.6 rather than 0.5 because
 * 0.5 on a self-reported scale is a shrug, and a shrug is exactly the case this
 * stage exists to catch: the model can nearly always construct *something*, so
 * the question is whether it is leaning towards a real connection or away from
 * one. Below 0.6 it is hedging, and a hedged connection is a forced one.
 *
 * It is a floor, not a licence: a score above it still cannot produce a
 * challenge without at least one grounded property to anchor the maths.
 */
export const MIN_FIT_SCORE = 0.6;

/**
 * Why the application refused a model-positive fit.
 *
 * Used only when `canGenerateChallenge` was true on the wire and the code then
 * set it false. The model's own reason is kept in every other case, including
 * when it already declined.
 */
function overrideReason(scoreTooLow: boolean, noGroundedProperty: boolean): string {
  if (scoreTooLow && noGroundedProperty) {
    return "The fit is below the minimum required, and no grounded property remains to anchor a challenge.";
  }

  if (noGroundedProperty) {
    return "No observable property from the object reading can legitimately anchor this skill.";
  }

  return "The fit is below the minimum required to generate a challenge.";
}

/**
 * What each skill has a natural claim on.
 *
 * Model-facing pedagogy, so it lives here rather than on the `Skill` records in
 * lib/skills.ts, which are shipped to the browser for the setup and scan
 * screens. The whole table goes into every request because choosing sensible
 * alternatives means weighing the object against all seven, not just the one
 * that was picked.
 */
const SKILL_AFFINITY: Record<SkillId, string> = {
  addition:
    "meaningful quantities, measurements, comparisons, and real amounts that can be combined",
  subtraction:
    "meaningful quantities, measurements, comparisons, and real amounts that can be removed, used up, or left over",
  multiplication: "repeated units, groups, rows and columns, and quantities",
  division:
    "volume, capacity, quantities, packages, repeated units, and anything that can be shared out equally",
  fractions:
    "divisible parts, portions, repeated sections, ratios, clock faces, containers, and grouped elements",
  measurement:
    "visible length, weight, volume, capacity, dimensions, and labelled quantities",
  geometry:
    "recognisable shapes, angles, symmetry, dimensions, and spatial relationships",
};

/**
 * What the model answers, which is less than the schema holds.
 *
 * `selectedSkillCode` is missing on purpose: the skill is the student's choice,
 * not the model's, so it is filled in from the input afterwards and there is no
 * field here for a model to quietly switch it. `canGenerateChallenge` is asked
 * for but not taken at face value — see `analyzeSkillFit`.
 */
const WireSkillFitSchema = z.strictObject({
  fitScore: z.number(),
  canGenerateChallenge: z.boolean(),
  usableProperties: z.array(z.string()),
  reason: z.string(),
  suggestedObjectCharacteristics: z.array(z.string()),
  alternativeSkillCodes: z.array(z.enum(SKILL_IDS)),
});

const INSTRUCTIONS = `You are the skill-fit stage of SIDEQUEST, a maths app for children in grades 3 to 5. A student chose a maths skill, then photographed an object. The vision stage has already read that object and its reading is given to you as JSON. Decide whether this object honestly supports this skill for this grade.

Saying no is a correct and useful answer. Do not manufacture a connection. If the maths would work just as well without this object, the fit is poor.

The reading is your only evidence. Do not introduce any measurement, quantity, dimension, capacity, price, specification, or fact about the object that is not already in it. If a number is not in the reading, it does not exist.

What each skill has a natural claim on:
{skills}

Answer with:

- "fitScore": 0 to 1, how naturally this object supports the selected skill at this grade.
- "canGenerateChallenge": whether an honest challenge could be built from the properties you list, and only from those.
- "usableProperties": the entries of the reading that could anchor the maths, copied verbatim. Copy a countable, shape, or observable property exactly as written. Copy a piece of visible text exactly as written, and only when the text itself carries usable mathematical information. Write a measurement as "label: value unit", for example "printed can volume: 12 fl oz". Anything not copied verbatim from the reading will be discarded, and a fit with nothing left cannot produce a challenge.
- "reason": one or two factual sentences on why the fit is strong or weak. Written for an engineer or a teacher reading a log, not for the student.
- "suggestedObjectCharacteristics": what a better object for this skill would have. Fill this in when the fit is weak; use an empty array when it is strong.
- "alternativeSkillCodes": skill codes from the list above that this object's properties would suit better than the selected skill. Never include the selected skill. Use an empty array when nothing else fits either.

Grade matters. A property can support a skill in principle and still be wrong for the grade: sharing 355 mL between 8 people is not a grade-3 division problem, and counting six equal segments is not a grade-5 fractions problem. Judge the fit for the grade you are given, and lower the score when the only available connection would be too hard or too slight for it.`;

/**
 * A fit good enough to build on, a fit that is honestly poor, or a stage that
 * did not work.
 *
 * The middle case carries both: the validated analysis, which is worth keeping
 * because it is the record of why this quest stopped, and the typed failure that
 * answers the student. A poor fit is not an error — it is this stage doing its
 * job.
 */
export type SkillFitResult =
  | { status: "ok"; fit: SkillFitAnalysis }
  | { status: "poorFit"; fit: SkillFitAnalysis; failure: QuestGenerationFailure }
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
    instructions: INSTRUCTIONS.replace("{skills}", skillAffinityList()),
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

  // Grounding, enforced rather than requested: each property the model listed is
  // looked up in the reading, and what survives is the reading's own wording. A
  // property the vision stage never recorded cannot reach a challenge, whatever
  // the model called it.
  const grounded = groundProperties(wire.usableProperties, analysis);

  if (grounded.length < wire.usableProperties.length) {
    console.warn("[skill-fit] discarded properties absent from the reading", {
      listed: wire.usableProperties.length,
      grounded: grounded.length,
    });
  }

  const scoreTooLow = wire.fitScore < MIN_FIT_SCORE;
  const noGroundedProperty = grounded.length === 0;
  const canGenerateChallenge =
    wire.canGenerateChallenge && !scoreTooLow && !noGroundedProperty;

  // The model can write a positive reason and still be overridden here. When
  // that happens the stored reason has to match the decision that actually
  // landed; a leftover "this would make a good challenge" is a lie in the row.
  const reason =
    wire.canGenerateChallenge && (scoreTooLow || noGroundedProperty)
      ? overrideReason(scoreTooLow, noGroundedProperty)
      : wire.reason;

  const parsed = SkillFitAnalysisSchema.safeParse({
    // The student's choice, not the model's. Nothing in the answer could change
    // which skill was assessed.
    selectedSkillCode: skillId,
    fitScore: wire.fitScore,
    // Three conditions, all required: the model's own verdict, a score clear of
    // the threshold, and something concrete to anchor the maths to. A confident
    // score with no grounded property is the case this stage most needs to
    // refuse.
    canGenerateChallenge,
    usableProperties: grounded,
    reason,
    suggestedObjectCharacteristics: wire.suggestedObjectCharacteristics,
    // A suggestion to switch to the skill they already chose is noise, and the
    // student's mission is never changed for them regardless.
    alternativeSkillCodes: [
      ...new Set(wire.alternativeSkillCodes.filter((code) => code !== skillId)),
    ],
  });

  if (!parsed.success) {
    // Paths and codes only: the values came off the student's photograph.
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

  if (!fit.canGenerateChallenge) {
    return {
      status: "poorFit",
      fit,
      failure: QuestGenerationFailureSchema.parse({
        reason: "poor_skill_fit",
        studentMessage: poorFitMessage(skillId, fit.alternativeSkillCodes),
        // A named alternative is something to act on; without one, the object
        // itself is what needs to change.
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
 *
 * Assembled from the centralised copy and the skill catalogue, so the wording is
 * reviewable in one place and the "look for" phrase is the same one the scan
 * screen already showed them.
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

/** The affinity table as prompt text, in the order the setup screen offers. */
function skillAffinityList(): string {
  return SKILLS.map(
    (skill) => `- ${skill.id} (${skill.label}): ${SKILL_AFFINITY[skill.id]}`,
  ).join("\n");
}
