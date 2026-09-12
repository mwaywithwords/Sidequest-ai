import { z } from "zod";
import { SKILL_IDS } from "@/lib/types";

/**
 * The contract for every piece of model output in the quest pipeline.
 *
 * These schemas are the trust boundary around the model the same way
 * app/api/quests/route.ts is the trust boundary around the browser. A
 * generated object is text until it parses, so nothing in the application
 * consumes a model response directly: it is parsed here first, and the
 * inferred types are the only shape the rest of the codebase ever sees.
 *
 * Deliberately free of provider details. No client, no prompts, no request
 * options — those live next to the call site so this file stays the answer to
 * "what shape is the data", and can be tested without a network.
 */

/** Non-empty after trimming: a required string the model left blank is a failure, not a value. */
const text = z.string().trim().min(1);

/** Codes come from the same tuple the DB catalogue is seeded from, so a skill the model invents cannot reach a query. */
const skillCode = z.enum(SKILL_IDS);

// ---------------------------------------------------------------------------
// Stage 1 — is this photograph usable at all?
// ---------------------------------------------------------------------------

/**
 * Why a photograph was accepted or refused. Split finer than the student ever
 * sees, because the reasons diverge in what happens next: 'person_focused' and
 * 'unusable_image' are a nudge to retake the shot, the content categories are
 * not.
 */
export const IMAGE_SAFETY_REASONS = [
  "appropriate",
  "adult_content",
  "graphic_content",
  "weapon",
  "drug_content",
  "personal_information",
  "person_focused",
  "unusable_image",
  "other",
] as const;

export const ImageSafetyAnalysisSchema = z
  .strictObject({
    allowed: z.boolean(),
    reason: z.enum(IMAGE_SAFETY_REASONS),
    /** Shown to a 9-year-old, so it is written by the model rather than mapped from the reason. */
    messageForStudent: text,
  })
  .refine((analysis) => analysis.allowed === (analysis.reason === "appropriate"), {
    error: "allowed must be true exactly when reason is 'appropriate'",
    path: ["reason"],
  });

// ---------------------------------------------------------------------------
// Stage 2 — what is in the photograph?
// ---------------------------------------------------------------------------

/**
 * A number the model claims to have read off the object, kept with its unit
 * and its label so a challenge can cite where the figure came from.
 */
export const VisibleMeasurementSchema = z.strictObject({
  value: z.number(),
  /** As printed ('fl oz', 'g', 'cm'), not normalised — conversion is the student's work. */
  unit: text,
  label: text,
});

export const ObjectAnalysisSchema = z.strictObject({
  objectName: text,
  category: text,
  brand: text.optional(),
  confidence: z.number().min(0).max(1),
  /** Everything legible on the object. Empty is a real answer: plenty of objects have no text. */
  visibleText: z.array(text),
  visibleMeasurements: z.array(VisibleMeasurementSchema),
  /** "6 windows", "12 segments" — things the student could recount to check the challenge. */
  countableProperties: z.array(text),
  shapeProperties: z.array(text),
  observableProperties: z.array(text),
});

// ---------------------------------------------------------------------------
// Stage 3 — does the object support the skill the student chose?
// ---------------------------------------------------------------------------

export const SkillFitAnalysisSchema = z
  .strictObject({
    selectedSkillCode: skillCode,
    fitScore: z.number().min(0).max(1),
    canGenerateChallenge: z.boolean(),
    /** The subset of the object analysis a challenge for this skill could actually build on. */
    usableProperties: z.array(text),
    reason: text,
    /** What to point the camera at instead, used verbatim in the retry copy. */
    suggestedObjectCharacteristics: z.array(text),
    /** Skills this object would suit better, for the "try this instead" offer. */
    alternativeSkillCodes: z.array(skillCode),
  })
  .refine(
    (fit) => !fit.canGenerateChallenge || fit.usableProperties.length > 0,
    {
      error: "canGenerateChallenge requires at least one usable property",
      path: ["usableProperties"],
    },
  );

// ---------------------------------------------------------------------------
// Stage 4 — the quest itself
// ---------------------------------------------------------------------------

export const DISCOVERY_CATEGORIES = [
  "history",
  "science",
  "design",
  "engineering",
  "culture",
  "observation",
] as const;

/** The fact about the object shown before the maths, and the reason a student keeps scanning. */
export const DiscoverySchema = z.strictObject({
  title: text,
  text: text,
  category: z.enum(DISCOVERY_CATEGORIES),
});

/**
 * A number the challenge is built on, carried alongside the question so
 * grading and review can see the arithmetic was done on values the object
 * really had. Unit is optional because counts ("8 segments") have none.
 */
export const UsedValueSchema = z.strictObject({
  label: text,
  value: z.number(),
  unit: text.optional(),
});

export const ChallengeSchema = z.strictObject({
  question: text,
  skillCode,
  /**
   * Structured rather than a string because the answer can be a number, a
   * fraction, or a value with a unit, and grading needs the parts. Matches
   * challenges.correct_answer, which is jsonb for the same reason.
   */
  correctAnswer: z.json(),
  solution: text,
  hint1: text,
  hint2: text,
  difficulty: z.int().min(1).max(5),
  objectConnection: text,
  /** At least one: a challenge that used nothing from the object is a generic worksheet problem. */
  valuesUsed: z.array(UsedValueSchema).min(1),
  /** How the answer should be checked — the instruction the grading stage follows. */
  verificationStrategy: text,
});

// ---------------------------------------------------------------------------
// Stage 5 — giving up, on purpose
// ---------------------------------------------------------------------------

/**
 * Why no quest came out. Distinct from a thrown error: these are outcomes the
 * pipeline expects and can explain, which is the difference between the
 * 'rejected' and 'failed' quest statuses in the schema.
 */
export const QUEST_FAILURE_REASONS = [
  "unsafe_image",
  "unknown_object",
  "poor_skill_fit",
  "insufficient_information",
  "invalid_math",
  "generation_failure",
] as const;

/** The one button the student is offered next, so a dead end always has a way out. */
export const RECOMMENDED_NEXT_ACTIONS = [
  "retake_photo",
  "find_different_object",
  "choose_different_skill",
  "retry",
] as const;

export const QuestGenerationFailureSchema = z.strictObject({
  reason: z.enum(QUEST_FAILURE_REASONS),
  studentMessage: text,
  recommendedNextAction: z.enum(RECOMMENDED_NEXT_ACTIONS),
});

// ---------------------------------------------------------------------------
// Inferred types. Derived, never hand-written, so the schema cannot drift from
// the type the application compiles against.
// ---------------------------------------------------------------------------

export type ImageSafetyAnalysis = z.infer<typeof ImageSafetyAnalysisSchema>;
export type ImageSafetyReason = (typeof IMAGE_SAFETY_REASONS)[number];

export type VisibleMeasurement = z.infer<typeof VisibleMeasurementSchema>;
export type ObjectAnalysis = z.infer<typeof ObjectAnalysisSchema>;

export type SkillFitAnalysis = z.infer<typeof SkillFitAnalysisSchema>;

export type Discovery = z.infer<typeof DiscoverySchema>;
export type DiscoveryCategory = (typeof DISCOVERY_CATEGORIES)[number];

export type UsedValue = z.infer<typeof UsedValueSchema>;
/** The generated problem. Distinct from the mock `Challenge` in lib/types.ts, which is UI shape. */
export type GeneratedChallenge = z.infer<typeof ChallengeSchema>;

export type QuestGenerationFailure = z.infer<
  typeof QuestGenerationFailureSchema
>;
export type QuestFailureReason = (typeof QUEST_FAILURE_REASONS)[number];
export type RecommendedNextAction = (typeof RECOMMENDED_NEXT_ACTIONS)[number];
