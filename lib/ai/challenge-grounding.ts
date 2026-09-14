import { isContextualFact } from "@/lib/ai/inspired-context";
import {
  type ArithmeticStep,
  type ChallengeValueOrigin,
  type Computation,
  type ComputationStepOperand,
  ComputationSchema,
  type ContextualPayload,
  type CorrectAnswer,
  CorrectAnswerSchema,
  ChallengeSchema,
  type GeneratedChallenge,
  type ObjectAnalysis,
  type ReadySkillFit,
  type UsedShape,
  UsedShapeSchema,
  type UsedValue,
  UsedValueSchema,
} from "@/lib/ai/schemas";
import { challengeMatchesObjectPurpose, connectionCitesSemanticDomain } from "@/lib/ai/semantic-purpose";
import {
  aspectAllowsLabel,
  geometryCitationTokens,
  normaliseGeometryAspect,
  normaliseGeometryChoiceSet,
  normaliseGeometryFeature,
  normaliseGeometryLabel,
  shapeSupports,
  structureCount,
} from "@/lib/math/geometry-forms";
import {
  canRepairObjectMathWording,
  questionRefersToPhotographedObject,
  repairObjectMathQuestion,
} from "@/lib/ai/object-math-wording";
import {
  canPrefixHypotheticalFraming,
  prefixHypotheticalFraming,
  questionHasHypotheticalFraming,
  questionStatesNumber,
  sentenceIsHypothetical,
} from "@/lib/math/hypothetical";
import { alignValuesUsedWithComputation } from "@/lib/math/source-values";
import { normaliseUnit as foldUnit } from "@/lib/math/units";
import { getAdaptiveProfile } from "@/lib/progress/adaptation";
import { sanitiseZodIssues } from "@/lib/quest-trace";
import type { Grade, SkillId } from "@/lib/types";

/**
 * Grounding for Challenge Generation, kept out of the model call so it can
 * be tested without a network.
 *
 * The model may invent a mathematical scenario. It may not invent a fact
 * about the photographed object. This module decides whether a proposed
 * challenge respects that line. It does not edit an invented measurement
 * into a real one, and it does not evaluate the arithmetic — that is the
 * next stage.
 */

export const QUESTION_MAX = 500;
const HINT_MAX = 280;
export const SOLUTION_MAX = 600;
const CONNECTION_MAX = 280;

export const CHALLENGE_REPAIRS = [
  "hypothetical_prefix",
  "deterministic_solution",
  "object_reference",
  "values_used",
] as const;

export type ChallengeRepair = (typeof CHALLENGE_REPAIRS)[number];

const MEASUREMENT =
  /\b(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(fl\.?\s*oz|fluid ounces?|oz|ounces?|mL|ml|millilitres?|milliliters?|L|litres?|liters?|g|grams?|kg|cm|mm|inches|inch|in\.(?=\s|$)|in(?!\s+(?:it|the|your|this|a|an|my|his|her|their|our))|feet|foot|ft|lbs?|pounds?)\b/gi;

export type StudentEvidenceValue = {
  property: string;
  value: number;
  unit?: string;
};

export type SkillProgressInput = {
  currentLevel: number;
  masteryScore: number;
  totalAttempts: number;
  correctAttempts: number;
} | null;

export type WireOperand = {
  label: string;
  value: number;
  unit: string | null;
  origin: ChallengeValueOrigin;
  kind?: "value" | "step_result" | null;
  step?: number | null;
};

export type WireArithmeticStep = {
  operation: "add" | "subtract" | "multiply" | string;
  operands: WireOperand[];
};

export type WireShape = {
  label: string;
  form: string;
  aspect: string;
  origin: "observed" | "student_provided";
};

export type WireChallenge = {
  canGenerate: boolean;
  question: string;
  skillCode: string;
  solution: string;
  hint1: string;
  hint2: string;
  difficulty: number;
  objectConnection: string;
  verificationStrategy: string;
  valuesUsed: WireOperand[];
  shapesUsed?: WireShape[];
  correctAnswer: {
    type: "number" | "fraction" | "choice";
    value: number | null;
    numerator: number | null;
    denominator: number | null;
    unit: string | null;
    label?: string | null;
    set?: string | null;
  };
  computation: {
    type:
      | "arithmetic"
      | "multi_step_arithmetic"
      | "division"
      | "fraction_of"
      | "fraction_remaining"
      | "conversion"
      | "geometry"
      | "shape_identify"
      | "shape_count";
    operation: string;
    shape: string | null;
    numerator: number | null;
    denominator: number | null;
    simplify: boolean | null;
    operands: WireOperand[];
    steps?: WireArithmeticStep[] | null;
  };
};

export type ChallengeContext = {
  analysis: ObjectAnalysis;
  fit: ReadySkillFit;
  skillId: SkillId;
  grade: Grade;
  studentEvidence: readonly StudentEvidenceValue[];
  contextualGrounding?: ContextualPayload | null;
};

export type ChallengeValidationIssue = {
  path: string;
  code: string;
  issues?: Array<{ path: string; code: string; expected?: string }>;
};

export type ChallengeFinalization =
  | {
      status: "ok";
      challenge: GeneratedChallenge;
      repairs: ChallengeRepair[];
    }
  | { status: "poor_fit" }
  | { status: "generation_failure"; issue: ChallengeValidationIssue };

/**
 * Turns a parsed model answer into a challenge the application may store,
 * or a typed decline.
 *
 * `canGenerate: false` is a poor fit: the approved investigation could not
 * become an honest question. Invented object facts, a missing grounded
 * anchor, or a malformed payload are generation failures. A missing
 * inspired-math hypothetical prefix may be added when every value is
 * already `given_in_problem`. Object_math may add photographed-object
 * attribution when a grounded observed value is already in the question,
 * and may align valuesUsed to the structured computation's source
 * operands. Origins and observed facts are never rewritten.
 */
export function finalizeChallenge(
  wire: WireChallenge,
  context: ChallengeContext,
): ChallengeFinalization {
  if (!wire.canGenerate) {
    return { status: "poor_fit" };
  }

  const repairs: ChallengeRepair[] = [];
  let question = wire.question.trim();
  const solution = wire.solution.trim();
  const hint1 = wire.hint1.trim();
  const hint2 = wire.hint2.trim();
  const objectConnection = wire.objectConnection.trim();
  const verificationStrategy = wire.verificationStrategy.trim();

  if (
    question.length === 0 ||
    solution.length === 0 ||
    hint1.length === 0 ||
    hint2.length === 0 ||
    objectConnection.length === 0 ||
    verificationStrategy.length === 0
  ) {
    return generationFailure("question", "empty_required_text");
  }

  if (
    question.length > QUESTION_MAX ||
    solution.length > SOLUTION_MAX ||
    hint1.length > HINT_MAX ||
    hint2.length > HINT_MAX ||
    objectConnection.length > CONNECTION_MAX
  ) {
    return generationFailure("question", "text_too_long");
  }

  if (wire.skillCode !== context.skillId) {
    return generationFailure("skillCode", "skill_mismatch");
  }

  if (
    !Number.isInteger(wire.difficulty) ||
    wire.difficulty < 1 ||
    wire.difficulty > 5
  ) {
    return generationFailure("difficulty", "invalid_difficulty");
  }

  let valuesUsed = parseValues(wire.valuesUsed);
  if (valuesUsed === null) {
    return generationFailure("valuesUsed", "invalid_used_value");
  }

  const shapesUsed = parseShapes(wire.shapesUsed ?? []);
  if (shapesUsed === null) {
    return generationFailure("shapesUsed", "unrecognized_geometry_label");
  }

  const correctAnswer = parseCorrectAnswer(wire.correctAnswer);
  if (correctAnswer === null) {
    return generationFailure("correctAnswer", "invalid_choice_or_answer");
  }

  const computation = parseComputation(wire.computation);
  if (computation === null) {
    return generationFailure("computation", "invalid_computation");
  }

  const aligned = alignValuesUsedWithComputation(
    valuesUsed,
    computation,
    correctAnswer,
  );
  if (aligned.status === "conflict") {
    return generationFailure("computation", "computation_value_mismatch");
  }
  valuesUsed = aligned.values;
  if (aligned.repaired) {
    repairs.push("values_used");
  }

  const valueGrounding = valuesGroundingIssue(valuesUsed, context);
  if (valueGrounding !== null) {
    return generationFailure("valuesUsed", valueGrounding);
  }

  if (!shapesAreGrounded(shapesUsed, context)) {
    return generationFailure("shapesUsed", "ungrounded_shape");
  }

  if (!hasUsableAnchor(valuesUsed, context, shapesUsed)) {
    return { status: "poor_fit" };
  }

  if (
    !computationUsesUsableAnchor(computation, valuesUsed, context, shapesUsed)
  ) {
    return { status: "poor_fit" };
  }

  if (!computationMatchesValues(computation, valuesUsed)) {
    return generationFailure("computation", "computation_value_mismatch");
  }

  if (!refersToObject(question, context.analysis)) {
    if (canRepairObjectMathWording(question, valuesUsed, context)) {
      const repairedQuestion = repairObjectMathQuestion(
        question,
        valuesUsed,
        context,
        QUESTION_MAX,
        computation.type,
      );
      if (repairedQuestion !== null) {
        question = repairedQuestion;
        repairs.push("object_reference");
      }
    }
  }

  if (!refersToObject(question, context.analysis)) {
    return generationFailure("question", "missing_object_reference");
  }

  if (
    !objectConnectionCitesAnchor(
      objectConnection,
      valuesUsed,
      context,
      shapesUsed,
    )
  ) {
    return generationFailure("objectConnection", "missing_anchor_citation");
  }

  if (!inspiredStaysOnTopic(question, objectConnection, context)) {
    return generationFailure("question", "inspired_off_topic");
  }

  if (attributesContextualAsObserved(question, valuesUsed, context)) {
    return generationFailure("question", "contextual_as_observed");
  }

  if (
    canPrefixHypotheticalFraming(
      question,
      context.fit.challengeMode,
      valuesUsed,
      QUESTION_MAX,
    )
  ) {
    question = prefixHypotheticalFraming(question);
    repairs.push("hypothetical_prefix");
  }

  if (!hypotheticalsAreFramed(question, valuesUsed)) {
    return generationFailure("question", "unframed_hypothetical");
  }

  if (attributesUnobservedMeasurement(question, context.analysis, valuesUsed)) {
    return generationFailure("question", "invented_measurement");
  }

  if (
    studentFacingTextInventedFacts(
      [question, objectConnection, solution],
      context.analysis,
      valuesUsed,
      correctAnswer,
    )
  ) {
    return generationFailure("question", "invented_object_fact");
  }

  const parsed = ChallengeSchema.safeParse({
    question,
    skillCode: context.skillId,
    correctAnswer,
    solution,
    hint1,
    hint2,
    difficulty: wire.difficulty,
    objectConnection,
    valuesUsed,
    ...(shapesUsed.length > 0 ? { shapesUsed } : {}),
    verificationStrategy,
    computation,
  });

  if (!parsed.success) {
    return generationFailureFromZod(parsed.error);
  }

  return { status: "ok", challenge: parsed.data, repairs };
}

function generationFailure(
  path: string,
  code: string,
): Extract<ChallengeFinalization, { status: "generation_failure" }> {
  return { status: "generation_failure", issue: { path, code } };
}

export function sanitiseZodIssue(error: {
  issues: readonly unknown[];
}): ChallengeValidationIssue {
  const issues = sanitiseZodIssueList(error);
  return issues[0] ?? { path: "challenge", code: "invalid", issues };
}

export function sanitiseZodIssueList(error: {
  issues: readonly unknown[];
}): NonNullable<ChallengeValidationIssue["issues"]> {
  return sanitiseZodIssues(error);
}

function generationFailureFromZod(error: {
  issues: readonly unknown[];
}): Extract<ChallengeFinalization, { status: "generation_failure" }> {
  const issues = sanitiseZodIssueList(error);
  const first = issues[0] ?? { path: "challenge", code: "invalid" };
  return {
    status: "generation_failure",
    issue: { ...first, issues },
  };
}

/**
 * Target difficulty for automatic Challenge Generation.
 *
 * Delegates to the centralized adaptation policy. Recent outcomes are
 * empty here so callers that only have a progress row still get a
 * deterministic 1–4 target. Full generation passes recent outcomes
 * through `getAdaptiveProfile` directly.
 */
export function targetDifficulty(
  grade: Grade,
  progress: SkillProgressInput,
): number {
  return getAdaptiveProfile({
    grade,
    progress,
    recentOutcomes: [],
  }).targetDifficulty;
}

export function hasGroundedAnchor(values: readonly UsedValue[]): boolean {
  return values.some(
    (value) =>
      value.origin === "observed" || value.origin === "student_provided",
  );
}

export function hasUsableAnchor(
  values: readonly UsedValue[],
  context: ChallengeContext,
  shapes: readonly UsedShape[] = [],
): boolean {
  if (hasGroundedAnchor(values)) return true;
  if (shapes.some((shape) => shape.origin === "observed" || shape.origin === "student_provided")) {
    return true;
  }

  if (context.fit.challengeMode !== "inspired_math") return false;

  return (
    values.some((value) => value.origin === "contextual") ||
    values.some((value) => value.origin === "given_in_problem")
  );
}

export function refersToObject(
  question: string,
  analysis: ObjectAnalysis,
): boolean {
  return questionRefersToPhotographedObject(question, analysis);
}

export function objectConnectionCitesAnchor(
  connection: string,
  values: readonly UsedValue[],
  context?: ChallengeContext,
  shapes: readonly UsedShape[] = [],
): boolean {
  const hay = connection.toLowerCase();
  const photoAnchors = values.filter(
    (value) =>
      value.origin === "observed" || value.origin === "student_provided",
  );

  if (
    photoAnchors.some((anchor) => connectionCitesValue(hay, anchor))
  ) {
    return true;
  }

  if (shapes.some((shape) => connectionCitesShape(hay, shape))) {
    return true;
  }

  if (context?.fit.challengeMode !== "inspired_math") {
    return false;
  }

  const worldAnchors = values.filter(
    (value) =>
      value.origin === "contextual" || value.origin === "given_in_problem",
  );

  if (worldAnchors.some((anchor) => connectionCitesValue(hay, anchor))) {
    return true;
  }

  const topic =
    context.contextualGrounding?.topic ??
    context.fit.inspirationContext?.topic ??
    "";
  if (topicTokens(topic).some((token) => hay.includes(token))) {
    return true;
  }

  return connectionCitesSemanticDomain(
    connection,
    context.analysis,
    context.fit.inspirationContext,
  );
}

function connectionCitesValue(hay: string, value: UsedValue): boolean {
  if (hay.includes(String(value.value))) return true;
  if (hay.includes(value.label.toLowerCase())) return true;
  if (value.unit && hay.includes(value.unit.toLowerCase())) return true;
  return false;
}

function connectionCitesShape(hay: string, shape: UsedShape): boolean {
  if (hay.includes(shape.label.toLowerCase())) return true;

  return geometryCitationTokens(shape.form).some((token) =>
    hay.includes(token.toLowerCase()),
  );
}

function inspiredStaysOnTopic(
  question: string,
  objectConnection: string,
  context: ChallengeContext,
): boolean {
  if (context.fit.challengeMode !== "inspired_math") return true;
  if (!refersToObject(question, context.analysis)) return false;

  const payload = context.contextualGrounding;
  const inspiration =
    payload !== undefined && payload !== null
      ? { topic: payload.topic, reason: payload.reason }
      : context.fit.inspirationContext;

  return challengeMatchesObjectPurpose(
    question,
    objectConnection,
    context.analysis,
    inspiration,
  );
}

const ATTRIBUTED_TO_OBJECT =
  /\b(?:your|the)\s+[\w-]+\s+(?:shows|showed|has printed|is labelled|is labeled|contains|holds)\s+(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/gi;

function attributesContextualAsObserved(
  question: string,
  values: readonly UsedValue[],
  context: ChallengeContext,
): boolean {
  if (context.fit.challengeMode !== "inspired_math") return false;

  const contextual = values.filter((value) => value.origin === "contextual");
  if (contextual.length === 0) return false;

  for (const match of question.matchAll(ATTRIBUTED_TO_OBJECT)) {
    const raw = match[1];
    if (raw === undefined) continue;
    const amount = parseWrittenNumber(raw);
    if (contextual.some((value) => value.value === amount)) {
      return true;
    }
  }

  return false;
}

function topicTokens(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter((token) => token.length >= 4),
    ),
  ];
}

export function computationOperands(computation: Computation): UsedValue[] {
  switch (computation.type) {
    case "arithmetic":
      return computation.operands;
    case "multi_step_arithmetic":
      return computation.steps.flatMap((step) =>
        step.operands.flatMap((operand) =>
          operand.kind === "value" ? [stepValue(operand)] : [],
        ),
      );
    case "division":
      return [computation.dividend, computation.divisor];
    case "fraction_of":
      return [computation.quantity];
    case "fraction_remaining":
      return [computation.totalParts, computation.usedParts];
    case "conversion":
      return [computation.value, computation.factor];
    case "geometry":
      return computation.dimensions;
    case "shape_identify":
    case "shape_count":
      return [];
  }
}

function stepValue(
  operand: Extract<ComputationStepOperand, { kind: "value" }>,
): UsedValue {
  const { kind: _kind, ...value } = operand;
  void _kind;
  return value;
}

function parseValues(values: readonly WireOperand[]): UsedValue[] | null {
  const parsed: UsedValue[] = [];

  for (const value of values) {
    const unit = cleanOptional(value.unit);
    const item = UsedValueSchema.safeParse({
      label: value.label,
      value: value.value,
      origin: value.origin,
      ...(unit === undefined ? {} : { unit }),
    });

    if (!item.success) return null;
    parsed.push(item.data);
  }

  return parsed;
}

function parseShapes(shapes: readonly WireShape[]): UsedShape[] | null {
  const parsed: UsedShape[] = [];

  for (const shape of shapes) {
    const form = normaliseGeometryLabel(shape.form);
    const aspect = normaliseGeometryAspect(shape.aspect);
    if (form === null || aspect === null) return null;

    const item = UsedShapeSchema.safeParse({
      label: shape.label,
      form,
      aspect,
      origin: shape.origin,
    });
    if (!item.success) return null;
    parsed.push(item.data);
  }

  return parsed;
}

function parseCorrectAnswer(
  answer: WireChallenge["correctAnswer"],
): CorrectAnswer | null {
  if (answer.type === "choice") {
    const raw = cleanOptional(answer.label ?? null);
    const setRaw = cleanOptional(answer.set ?? null);
    if (raw === undefined || setRaw === undefined) return null;

    const label = normaliseGeometryLabel(raw);
    const set = normaliseGeometryChoiceSet(setRaw);
    if (label === null || set === null) return null;

    const parsed = CorrectAnswerSchema.safeParse({
      type: "choice",
      value: label,
      set,
    });
    return parsed.success ? parsed.data : null;
  }

  if (answer.type === "number") {
    if (answer.value === null || !Number.isFinite(answer.value)) return null;

    return CorrectAnswerSchema.safeParse({
      type: "number",
      value: answer.value,
      ...(cleanOptional(answer.unit) === undefined
        ? {}
        : { unit: cleanOptional(answer.unit) }),
    }).success
      ? {
          type: "number" as const,
          value: answer.value,
          ...(cleanOptional(answer.unit) === undefined
            ? {}
            : { unit: cleanOptional(answer.unit) }),
        }
      : null;
  }

  if (
    answer.numerator === null ||
    answer.denominator === null ||
    !Number.isInteger(answer.numerator) ||
    !Number.isInteger(answer.denominator) ||
    answer.denominator <= 0
  ) {
    return null;
  }

  const parsed = CorrectAnswerSchema.safeParse({
    type: "fraction",
    numerator: answer.numerator,
    denominator: answer.denominator,
    ...(cleanOptional(answer.unit) === undefined
      ? {}
      : { unit: cleanOptional(answer.unit) }),
  });

  return parsed.success ? parsed.data : null;
}

function parseComputation(
  wire: WireChallenge["computation"],
): Computation | null {
  const operands = parseValues(wire.operands);
  if (operands === null) return null;

  switch (wire.type) {
    case "arithmetic": {
      const operation = foldComputationToken(wire.operation);
      if (!isArithmeticOp(operation) || operands.length < 2) return null;
      return parseUnion({
        type: "arithmetic",
        operation,
        operands,
      });
    }
    case "multi_step_arithmetic": {
      const steps = parseArithmeticSteps(wire.steps ?? []);
      if (steps === null) return null;
      return parseUnion({
        type: "multi_step_arithmetic",
        steps,
      });
    }
    case "division": {
      const operation = foldComputationToken(wire.operation);
      if (!isDivisionOp(operation) || operands.length < 2) return null;
      return parseUnion({
        type: "division",
        operation,
        dividend: operands[0],
        divisor: operands[1],
      });
    }
    case "fraction_of":
      if (
        operands.length < 1 ||
        wire.numerator === null ||
        wire.denominator === null ||
        !Number.isInteger(wire.numerator) ||
        !Number.isInteger(wire.denominator) ||
        wire.numerator <= 0 ||
        wire.denominator <= 0
      ) {
        return null;
      }
      return parseUnion({
        type: "fraction_of",
        quantity: operands[0],
        numerator: wire.numerator,
        denominator: wire.denominator,
      });
    case "fraction_remaining":
      if (operands.length < 2) return null;
      return parseUnion({
        type: "fraction_remaining",
        totalParts: operands[0],
        usedParts: operands[1],
        simplify: wire.simplify === true,
      });
    case "conversion": {
      const operation = foldComputationToken(wire.operation);
      if (!isConversionOp(operation) || operands.length < 2) return null;
      return parseUnion({
        type: "conversion",
        operation,
        value: operands[0],
        factor: operands[1],
      });
    }
    case "geometry": {
      const operation = foldComputationToken(wire.operation);
      const shape =
        wire.shape === null ? null : normaliseGeometryLabel(wire.shape);
      if (
        !isGeometryOp(operation) ||
        shape === null ||
        !isMeasuredGeometryShape(shape)
      ) {
        return null;
      }
      if (operands.length < 1) return null;
      return parseUnion({
        type: "geometry",
        operation,
        shape,
        dimensions: operands,
      });
    }
    case "shape_identify": {
      const aspect = normaliseGeometryAspect(wire.operation);
      const label =
        wire.shape === null ? null : normaliseGeometryLabel(wire.shape);
      if (
        aspect === null ||
        label === null ||
        !aspectAllowsLabel(aspect, label)
      ) {
        return null;
      }
      return parseUnion({
        type: "shape_identify",
        aspect,
        label,
      });
    }
    case "shape_count": {
      const shape =
        wire.shape === null ? null : normaliseGeometryLabel(wire.shape);
      const feature = normaliseGeometryFeature(wire.operation);
      if (
        shape === null ||
        feature === null ||
        structureCount(shape, feature) === null
      ) {
        return null;
      }
      return parseUnion({
        type: "shape_count",
        shape,
        feature,
      });
    }
  }
}

function parseArithmeticSteps(
  wires: readonly WireArithmeticStep[],
): ArithmeticStep[] | null {
  if (wires.length < 2 || wires.length > 4) return null;

  const steps: ArithmeticStep[] = [];

  for (const [index, wire] of wires.entries()) {
    const operation = foldComputationToken(wire.operation);
    if (!isArithmeticOp(operation)) return null;

    const operands: ComputationStepOperand[] = [];
    for (const operand of wire.operands) {
      const parsed = parseStepOperand(operand, index);
      if (parsed === null) return null;
      operands.push(parsed);
    }

    if (operands.length < 2 || operands.length > 4) return null;

    steps.push({
      operation,
      operands,
    });
  }

  return steps;
}

function parseStepOperand(
  operand: WireOperand,
  stepIndex: number,
): ComputationStepOperand | null {
  if (operand.kind === "step_result") {
    if (
      operand.step === null ||
      operand.step === undefined ||
      !Number.isInteger(operand.step) ||
      operand.step < 0 ||
      operand.step >= stepIndex
    ) {
      return null;
    }

    return { kind: "step_result", step: operand.step };
  }

  const values = parseValues([operand]);
  if (values === null || values[0] === undefined) return null;

  return { kind: "value", ...values[0] };
}

function parseUnion(value: unknown): Computation | null {
  const parsed = ComputationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function valuesGroundingIssue(
  values: readonly UsedValue[],
  context: ChallengeContext,
): string | null {
  const observed = catalogObserved(context.analysis, context.fit);
  const payload = context.contextualGrounding ?? null;

  for (const value of values) {
    if (value.origin === "observed" && !isObservedFact(value, observed)) {
      return "ungrounded_observed_value";
    }

    if (
      value.origin === "student_provided" &&
      !isStudentProvided(value, context.studentEvidence)
    ) {
      return "student_evidence_missing";
    }

    if (value.origin === "contextual") {
      if (context.fit.challengeMode !== "inspired_math") {
        return "invalid_value_origin";
      }
      if (isObservedFact(value, observed)) return "invalid_value_origin";
      if (!isContextualFact(value, payload)) return "contextual_value_missing";
    }

    if (value.origin === "given_in_problem") {
      if (isObservedFact(value, observed)) return "invalid_value_origin";
      if (isContextualFact(value, payload)) return "invalid_value_origin";
    }
  }

  return null;
}

function shapesAreGrounded(
  shapes: readonly UsedShape[],
  context: ChallengeContext,
): boolean {
  for (const shape of shapes) {
    if (shape.origin !== "observed" && shape.origin !== "student_provided") {
      return false;
    }

    if (!shapeSupports(context.analysis, shape.aspect, shape.form)) {
      return false;
    }
  }

  return true;
}

function computationUsesUsableAnchor(
  computation: Computation,
  values: readonly UsedValue[],
  context: ChallengeContext,
  shapes: readonly UsedShape[],
): boolean {
  if (computation.type === "shape_identify") {
    return shapes.some(
      (shape) =>
        shape.form === computation.label &&
        shape.aspect === computation.aspect &&
        (shape.origin === "observed" || shape.origin === "student_provided"),
    );
  }

  if (computation.type === "shape_count") {
    return shapes.some(
      (shape) =>
        shape.form === computation.shape &&
        (shape.origin === "observed" || shape.origin === "student_provided"),
    );
  }

  const operands = computationOperands(computation);
  const allowed =
    context.fit.challengeMode === "inspired_math"
      ? values.filter(
          (value) =>
            value.origin === "observed" ||
            value.origin === "student_provided" ||
            value.origin === "contextual" ||
            value.origin === "given_in_problem",
        )
      : values.filter(
          (value) =>
            value.origin === "observed" || value.origin === "student_provided",
        );

  return allowed.some((anchor) =>
    operands.some((operand) => sameValue(operand, anchor)),
  );
}

function computationMatchesValues(
  computation: Computation,
  values: readonly UsedValue[],
): boolean {
  return computationOperands(computation).every((operand) =>
    values.some((value) => sameValue(value, operand)),
  );
}

function hypotheticalsAreFramed(
  question: string,
  values: readonly UsedValue[],
): boolean {
  const given = values.filter((value) => value.origin === "given_in_problem");
  if (given.length === 0) return true;

  if (!questionHasHypotheticalFraming(question)) return false;

  return given.every((value) => questionStatesNumber(question, value.value));
}

const ATTRIBUTED_MEASUREMENT =
  /\b(?:contains|holds|shows|labelled|labeled|printed)\s+(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(fl\.?\s*oz|fluid ounces?|oz|ounces?|mL|ml|millilitres?|milliliters?|L|litres?|liters?|g|grams?|kg|cm|mm|inches|inch|in\.?|feet|foot|ft|lbs?|pounds?)\b/gi;

function attributesUnobservedMeasurement(
  question: string,
  analysis: ObjectAnalysis,
  values: readonly UsedValue[] = [],
): boolean {
  const observed = catalogObserved(analysis);
  const given = values.filter((value) => value.origin === "given_in_problem");

  for (const match of question.matchAll(ATTRIBUTED_MEASUREMENT)) {
    const rawValue = match[1];
    const rawUnit = match[2];
    if (rawValue === undefined || rawUnit === undefined) continue;

    const value = parseWrittenNumber(rawValue);
    const ok = observed.some(
      (fact) =>
        fact.value === value &&
        (fact.unit === undefined || unitsLooselyMatch(fact.unit, rawUnit)),
    );

    if (ok) continue;
    if (
      given.some((entry) => entry.value === value) &&
      sentenceIsHypothetical(sentenceAt(question, match.index ?? 0))
    ) {
      continue;
    }

    return true;
  }

  return attributedUnobservedAmount(question, observed, given);
}

const ATTRIBUTED_AMOUNT =
  /\b(?:your|the)\s+[\w-]+\s+(?:shows|showed|has printed|is labelled|is labeled|contains|holds|has)\s+\$?(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/gi;

function attributedUnobservedAmount(
  question: string,
  observed: readonly ObservedFact[],
  given: readonly UsedValue[],
): boolean {
  for (const match of question.matchAll(ATTRIBUTED_AMOUNT)) {
    const raw = match[1];
    if (raw === undefined) continue;

    const value = parseWrittenNumber(raw);
    if (observed.some((fact) => fact.value === value)) continue;

    const sentence = sentenceAt(question, match.index ?? 0);
    if (
      given.some((entry) => entry.value === value) &&
      sentenceIsHypothetical(sentence)
    ) {
      continue;
    }

    return true;
  }

  return false;
}

function sentenceAt(text: string, index: number): string {
  const start = Math.max(0, text.lastIndexOf(".", index) + 1);
  const endMark = text.indexOf(".", index);
  const end = endMark === -1 ? text.length : endMark;
  return text.slice(start, end);
}

function studentFacingTextInventedFacts(
  texts: readonly string[],
  analysis: ObjectAnalysis,
  values: readonly UsedValue[],
  answer: CorrectAnswer,
): boolean {
  const allowed = [
    ...catalogObserved(analysis).map((fact) => ({
      value: fact.value,
      unit: fact.unit,
    })),
    ...values.map((value) => ({ value: value.value, unit: value.unit })),
    ...(answerNumber(answer) === null ? [] : [answerNumber(answer)!]),
  ];

  for (const text of texts) {
    for (const match of text.matchAll(MEASUREMENT)) {
      const rawValue = match[1];
      const rawUnit = match[2];
      if (rawValue === undefined || rawUnit === undefined) continue;

      const value = parseWrittenNumber(rawValue);
      const ok = allowed.some(
        (entry) =>
          entry.value === value &&
          (entry.unit === undefined ||
            unitsLooselyMatch(entry.unit, rawUnit)),
      );

      if (!ok) return true;
    }
  }

  return false;
}

type ObservedFact = {
  value: number;
  unit?: string;
  labels: string[];
};

function answerNumber(
  answer: CorrectAnswer,
): { value: number; unit?: string } | null {
  if (answer.type === "choice") return null;

  if (answer.type === "number") {
    return { value: answer.value, unit: answer.unit };
  }

  return { value: answer.numerator, unit: answer.unit };
}

function catalogObserved(
  analysis: ObjectAnalysis,
  fit?: ReadySkillFit,
): ObservedFact[] {
  const facts: ObservedFact[] = [];

  for (const measurement of analysis.visibleMeasurements) {
    facts.push({
      value: measurement.value,
      unit: measurement.unit,
      labels: [
        measurement.label,
        `${measurement.label}: ${measurement.value} ${measurement.unit}`,
        `${measurement.value} ${measurement.unit}`,
      ],
    });
  }

  const listed = [
    ...analysis.countableProperties,
    ...analysis.visibleText,
    ...analysis.shapeProperties,
    ...analysis.observableProperties,
    ...(fit?.usableProperties ?? []),
    ...(fit?.anchors
      .filter((anchor) => anchor.origin === "observed")
      .map((anchor) => anchor.property) ?? []),
  ];

  for (const property of listed) {
    for (const match of property.matchAll(/\d+(?:\.\d+)?/g)) {
      facts.push({
        value: Number(match[0]),
        labels: [property],
      });
    }
  }

  return facts;
}

function isObservedFact(value: UsedValue, facts: readonly ObservedFact[]): boolean {
  return facts.some((fact) => {
    if (fact.value !== value.value) return false;
    if (!unitsAgree(fact.unit, value.unit)) return false;
    return fact.labels.some((label) => labelsLooselyMatch(label, value.label));
  });
}

function isStudentProvided(
  value: UsedValue,
  evidence: readonly StudentEvidenceValue[],
): boolean {
  if (evidence.length === 0) return false;

  return evidence.some((entry) => {
    if (entry.value !== value.value) return false;
    if (!unitsAgree(entry.unit, value.unit)) return false;
    return labelsLooselyMatch(entry.property, value.label);
  });
}

function sameValue(left: UsedValue, right: UsedValue): boolean {
  return (
    left.value === right.value &&
    left.origin === right.origin &&
    labelsLooselyMatch(left.label, right.label) &&
    unitsAgree(left.unit, right.unit)
  );
}

function unitsAgree(left?: string, right?: string): boolean {
  if (left === undefined && right === undefined) return true;
  if (left === undefined || right === undefined) return false;
  return unitsLooselyMatch(left, right);
}

function unitsLooselyMatch(recorded: string, mentioned: string): boolean {
  return foldUnit(recorded) === foldUnit(mentioned);
}

function labelsLooselyMatch(left: string, right: string): boolean {
  const a = normaliseLabel(left);
  const b = normaliseLabel(right);
  return a === b || a.includes(b) || b.includes(a);
}

function normaliseLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,;:]+$/g, "");
}

function parseWrittenNumber(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

function cleanOptional(value: string | null): string | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function foldComputationToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isArithmeticOp(
  value: string,
): value is "add" | "subtract" | "multiply" {
  const folded = foldComputationToken(value);
  return folded === "add" || folded === "subtract" || folded === "multiply";
}

function isDivisionOp(
  value: string,
): value is "quotient" | "whole_groups" | "remainder" {
  const folded = foldComputationToken(value);
  return (
    folded === "quotient" || folded === "whole_groups" || folded === "remainder"
  );
}

function isConversionOp(value: string): value is "multiply" | "divide" {
  const folded = foldComputationToken(value);
  return folded === "multiply" || folded === "divide";
}

function isGeometryOp(value: string): value is "perimeter" | "area" {
  const folded = foldComputationToken(value);
  return folded === "perimeter" || folded === "area";
}

function isMeasuredGeometryShape(
  value: string,
): value is "rectangle" | "square" | "triangle" {
  return value === "rectangle" || value === "square" || value === "triangle";
}
