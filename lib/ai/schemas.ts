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
// Stage 3 — can this object support a legitimate investigation?
// ---------------------------------------------------------------------------

/**
 * Origins this investigation stage is allowed to persist.
 *
 * OBSERVED          a fact established by ObjectAnalysis.
 * STUDENT_PROVIDED  something collected during a SIDEQUEST investigation.
 *
 * `given_in_problem` is not here. That origin belongs to Challenge Generation.
 */
export const INVESTIGATION_VALUE_ORIGINS = [
  "observed",
  "student_provided",
] as const;

/**
 * The full set a future Challenge Generator may use. Includes the investigation
 * origins plus GIVEN_IN_PROBLEM — a hypothetical the problem text may invent.
 *
 * Skill Fit must not emit this broader type. Investigation anchors stay on
 * `INVESTIGATION_VALUE_ORIGINS` so a hypothetical cannot be stored as a fact.
 */
export const CHALLENGE_VALUE_ORIGINS = [
  ...INVESTIGATION_VALUE_ORIGINS,
  "given_in_problem",
] as const;

export const InvestigationAnchorSchema = z.strictObject({
  property: text,
  origin: z.enum(INVESTIGATION_VALUE_ORIGINS),
});

/**
 * The four ways an investigation can conclude.
 *
 * `direct` and `grounded_scenario` are both ready for Challenge Generation.
 * They differ in whether the photograph already holds enough, or whether
 * the problem may introduce an extra hypothetical value. `needs_evidence`
 * is still a live quest. `poor_fit` is the last resort.
 */
export const CHALLENGE_MODES = [
  "direct",
  "grounded_scenario",
  "needs_evidence",
  "poor_fit",
] as const;

export const EVIDENCE_REQUEST_TYPES = [
  "second_photo",
  "student_measurement",
  "student_count",
  "student_input",
] as const;

/** One small extra observation the student can make. Written for the student. */
export const EvidenceRequestSchema = z.strictObject({
  type: z.enum(EVIDENCE_REQUEST_TYPES),
  prompt: text.max(200),
  targetProperty: text.max(80),
  reason: text.max(200),
});

const skillFitShared = {
  selectedSkillCode: skillCode,
  fitScore: z.number().min(0).max(1),
  reason: text,
  /** What a better object would have. Meaningful for poor_fit; unused otherwise. */
  suggestedObjectCharacteristics: z.array(text),
  alternativeSkillCodes: z.array(skillCode),
  /**
   * Observed facts and, for needs_evidence, one student_provided target.
   * Structurally cannot hold `given_in_problem`.
   */
  anchors: z.array(InvestigationAnchorSchema),
};

const SkillFitDirectSchema = z.strictObject({
  ...skillFitShared,
  challengeMode: z.literal("direct"),
  canGenerateChallenge: z.literal(true),
  usableProperties: z.array(text).min(1),
  evidenceRequest: z.null(),
});

const SkillFitGroundedSchema = z.strictObject({
  ...skillFitShared,
  challengeMode: z.literal("grounded_scenario"),
  canGenerateChallenge: z.literal(true),
  usableProperties: z.array(text).min(1),
  evidenceRequest: z.null(),
});

const SkillFitNeedsEvidenceSchema = z.strictObject({
  ...skillFitShared,
  challengeMode: z.literal("needs_evidence"),
  canGenerateChallenge: z.literal(false),
  usableProperties: z.array(text),
  evidenceRequest: EvidenceRequestSchema,
});

const SkillFitPoorFitSchema = z.strictObject({
  ...skillFitShared,
  challengeMode: z.literal("poor_fit"),
  canGenerateChallenge: z.literal(false),
  usableProperties: z.array(text),
  evidenceRequest: z.null(),
});

/**
 * Discriminated on `challengeMode` so the evidence-request invariant is
 * structural: required for `needs_evidence`, null for every other mode.
 */
export const SkillFitAnalysisSchema = z.discriminatedUnion("challengeMode", [
  SkillFitDirectSchema,
  SkillFitGroundedSchema,
  SkillFitNeedsEvidenceSchema,
  SkillFitPoorFitSchema,
]);

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
 * grading and review can see where the figure came from. Unit is optional
 * because counts ("8 segments") have none.
 *
 * `origin` is required: a later verifier cannot tell an observed 11 fl oz
 * from a hypothetical 4 if the two are stored the same way.
 */
export const UsedValueSchema = z.strictObject({
  label: text,
  value: z.number(),
  unit: text.optional(),
  origin: z.enum(CHALLENGE_VALUE_ORIGINS),
});

/**
 * One input the structured computation reads. Same shape as a used value so
 * a verifier can match the two lists without a second vocabulary.
 */
export const ComputationOperandSchema = UsedValueSchema;

/**
 * What the student is asked to produce. Structured so grading can compare
 * parts rather than a free-text string. Matches challenges.correct_answer.
 */
export const CorrectAnswerSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("number"),
    value: z.number(),
    unit: text.optional(),
  }),
  z.strictObject({
    type: z.literal("fraction"),
    numerator: z.int(),
    denominator: z.int().positive(),
    unit: text.optional(),
  }),
]);

/**
 * A constrained computation the next verification stage can evaluate
 * without executing arbitrary expressions. Small on purpose: only the
 * Grade 3–5 operations SIDEQUEST actually generates.
 */
export const ComputationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("arithmetic"),
    operation: z.enum(["add", "subtract", "multiply"]),
    operands: z.array(ComputationOperandSchema).min(2).max(4),
  }),
  z.strictObject({
    type: z.literal("division"),
    operation: z.enum(["quotient", "whole_groups", "remainder"]),
    dividend: ComputationOperandSchema,
    divisor: ComputationOperandSchema,
  }),
  z.strictObject({
    type: z.literal("fraction_of"),
    quantity: ComputationOperandSchema,
    numerator: z.int().positive(),
    denominator: z.int().positive(),
  }),
  z.strictObject({
    type: z.literal("fraction_remaining"),
    totalParts: ComputationOperandSchema,
    usedParts: ComputationOperandSchema,
    simplify: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("conversion"),
    operation: z.enum(["multiply", "divide"]),
    value: ComputationOperandSchema,
    factor: ComputationOperandSchema,
  }),
  z.strictObject({
    type: z.literal("geometry"),
    operation: z.enum(["perimeter", "area"]),
    shape: z.enum(["rectangle", "square", "triangle"]),
    dimensions: z.array(ComputationOperandSchema).min(1).max(4),
  }),
]);

export const ChallengeSchema = z.strictObject({
  question: text,
  skillCode,
  correctAnswer: CorrectAnswerSchema,
  solution: text,
  hint1: text,
  hint2: text,
  difficulty: z.int().min(1).max(5),
  objectConnection: text,
  /** At least one: a challenge that used nothing from the object is a generic worksheet problem. */
  valuesUsed: z.array(UsedValueSchema).min(1),
  /** How the answer should be checked — the instruction the grading stage follows. */
  verificationStrategy: text,
  /**
   * Everything a deterministic verifier needs to recompute the answer.
   * Not an expression language: only the union above.
   */
  computation: ComputationSchema,
});

/**
 * What Challenge Generation stores on challenges.generation_metadata for
 * the verifier. Extra fields are rejected so a raw model dump cannot hide
 * here.
 */
export const GenerationMetadataSchema = z.strictObject({
  valuesUsed: z.array(UsedValueSchema).min(1),
  computation: ComputationSchema,
  verificationStrategy: text,
  model: z.string().optional(),
  challengeMode: z.enum(["direct", "grounded_scenario"]).optional(),
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

export type InvestigationValueOrigin =
  (typeof INVESTIGATION_VALUE_ORIGINS)[number];
export type ChallengeValueOrigin = (typeof CHALLENGE_VALUE_ORIGINS)[number];
export type InvestigationAnchor = z.infer<typeof InvestigationAnchorSchema>;
export type ChallengeMode = (typeof CHALLENGE_MODES)[number];
export type EvidenceRequestType = (typeof EVIDENCE_REQUEST_TYPES)[number];
export type EvidenceRequest = z.infer<typeof EvidenceRequestSchema>;
export type SkillFitAnalysis = z.infer<typeof SkillFitAnalysisSchema>;
export type ReadySkillFit = Extract<
  SkillFitAnalysis,
  { challengeMode: "direct" | "grounded_scenario" }
>;
export type NeedsEvidenceFit = Extract<
  SkillFitAnalysis,
  { challengeMode: "needs_evidence" }
>;
export type PoorFitAnalysis = Extract<
  SkillFitAnalysis,
  { challengeMode: "poor_fit" }
>;

export type Discovery = z.infer<typeof DiscoverySchema>;
export type DiscoveryCategory = (typeof DISCOVERY_CATEGORIES)[number];

export type UsedValue = z.infer<typeof UsedValueSchema>;
export type ComputationOperand = z.infer<typeof ComputationOperandSchema>;
export type CorrectAnswer = z.infer<typeof CorrectAnswerSchema>;
export type Computation = z.infer<typeof ComputationSchema>;
export type GenerationMetadata = z.infer<typeof GenerationMetadataSchema>;
/** The generated problem. Distinct from the mock `Challenge` in lib/types.ts, which is UI shape. */
export type GeneratedChallenge = z.infer<typeof ChallengeSchema>;

export type QuestGenerationFailure = z.infer<
  typeof QuestGenerationFailureSchema
>;
export type QuestFailureReason = (typeof QUEST_FAILURE_REASONS)[number];
export type RecommendedNextAction = (typeof RECOMMENDED_NEXT_ACTIONS)[number];
