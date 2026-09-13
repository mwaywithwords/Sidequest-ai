import { isContextualFact } from "@/lib/ai/inspired-context";
import {
  type ChallengeValueOrigin,
  type Computation,
  ComputationSchema,
  type ContextualPayload,
  type CorrectAnswer,
  CorrectAnswerSchema,
  ChallengeSchema,
  type GeneratedChallenge,
  type ObjectAnalysis,
  type ReadySkillFit,
  type UsedValue,
  UsedValueSchema,
} from "@/lib/ai/schemas";
import { normaliseUnit as foldUnit } from "@/lib/math/units";
import { getAdaptiveProfile } from "@/lib/progress/adaptation";
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

const QUESTION_MAX = 500;
const HINT_MAX = 280;
const SOLUTION_MAX = 600;
const CONNECTION_MAX = 280;

const HYPOTHETICAL = /\b(if|suppose|imagine|what if)\b/i;

const MEASUREMENT =
  /\b(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|fluid ounces?|oz|ounces?|mL|ml|millilitres?|milliliters?|L|litres?|liters?|g|grams?|kg|cm|mm|inches|inch|in\.?|feet|foot|ft|lbs?|pounds?)\b/gi;

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
  correctAnswer: {
    type: "number" | "fraction";
    value: number | null;
    numerator: number | null;
    denominator: number | null;
    unit: string | null;
  };
  computation: {
    type:
      | "arithmetic"
      | "division"
      | "fraction_of"
      | "fraction_remaining"
      | "conversion"
      | "geometry";
    operation: string;
    shape: string | null;
    numerator: number | null;
    denominator: number | null;
    simplify: boolean | null;
    operands: WireOperand[];
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

export type ChallengeFinalization =
  | { status: "ok"; challenge: GeneratedChallenge }
  | { status: "poor_fit" }
  | { status: "generation_failure" };

/**
 * Turns a parsed model answer into a challenge the application may store,
 * or a typed decline.
 *
 * `canGenerate: false` is a poor fit: the approved investigation could not
 * become an honest question. Invented object facts, a missing grounded
 * anchor, or a malformed payload are generation failures. Nothing here
 * rewrites a bad value into a good one.
 */
export function finalizeChallenge(
  wire: WireChallenge,
  context: ChallengeContext,
): ChallengeFinalization {
  if (!wire.canGenerate) {
    return { status: "poor_fit" };
  }

  const question = wire.question.trim();
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
    return { status: "generation_failure" };
  }

  if (
    question.length > QUESTION_MAX ||
    solution.length > SOLUTION_MAX ||
    hint1.length > HINT_MAX ||
    hint2.length > HINT_MAX ||
    objectConnection.length > CONNECTION_MAX
  ) {
    return { status: "generation_failure" };
  }

  if (wire.skillCode !== context.skillId) {
    return { status: "generation_failure" };
  }

  if (
    !Number.isInteger(wire.difficulty) ||
    wire.difficulty < 1 ||
    wire.difficulty > 5
  ) {
    return { status: "generation_failure" };
  }

  const valuesUsed = parseValues(wire.valuesUsed);
  if (valuesUsed === null) return { status: "generation_failure" };

  const correctAnswer = parseCorrectAnswer(wire.correctAnswer);
  if (correctAnswer === null) return { status: "generation_failure" };

  const computation = parseComputation(wire.computation);
  if (computation === null) return { status: "generation_failure" };

  if (!valuesAreGrounded(valuesUsed, context)) {
    return { status: "generation_failure" };
  }

  if (!hasUsableAnchor(valuesUsed, context)) {
    return { status: "poor_fit" };
  }

  if (!computationUsesUsableAnchor(computation, valuesUsed, context)) {
    return { status: "poor_fit" };
  }

  if (!computationMatchesValues(computation, valuesUsed)) {
    return { status: "generation_failure" };
  }

  if (!refersToObject(question, context.analysis)) {
    return { status: "generation_failure" };
  }

  if (!objectConnectionCitesAnchor(objectConnection, valuesUsed, context)) {
    return { status: "generation_failure" };
  }

  if (!inspiredStaysOnTopic(question, context)) {
    return { status: "generation_failure" };
  }

  if (attributesContextualAsObserved(question, valuesUsed, context)) {
    return { status: "generation_failure" };
  }

  if (!hypotheticalsAreFramed(question, valuesUsed)) {
    return { status: "generation_failure" };
  }

  if (attributesUnobservedMeasurement(question, context.analysis)) {
    return { status: "generation_failure" };
  }

  if (
    studentFacingTextInventedFacts(
      [question, objectConnection, solution],
      context.analysis,
      valuesUsed,
      correctAnswer,
    )
  ) {
    return { status: "generation_failure" };
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
    verificationStrategy,
    computation,
  });

  if (!parsed.success) {
    return { status: "generation_failure" };
  }

  return { status: "ok", challenge: parsed.data };
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
): boolean {
  if (hasGroundedAnchor(values)) return true;

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
  const hay = question.toLowerCase();
  const name = analysis.objectName.toLowerCase().trim();

  if (name.length > 0 && hay.includes(name)) return true;

  const tokens = name
    .split(/[^a-z0-9]+/i)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length >= 4);

  if (tokens.some((token) => hay.includes(token))) return true;

  return (
    hay.includes("in your photo") ||
    hay.includes("your photo") ||
    hay.includes("the object")
  );
}

export function objectConnectionCitesAnchor(
  connection: string,
  values: readonly UsedValue[],
  context?: ChallengeContext,
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
  return topicTokens(topic).some((token) => hay.includes(token));
}

function connectionCitesValue(hay: string, value: UsedValue): boolean {
  if (hay.includes(String(value.value))) return true;
  if (hay.includes(value.label.toLowerCase())) return true;
  if (value.unit && hay.includes(value.unit.toLowerCase())) return true;
  return false;
}

function inspiredStaysOnTopic(
  question: string,
  context: ChallengeContext,
): boolean {
  if (context.fit.challengeMode !== "inspired_math") return true;
  if (!refersToObject(question, context.analysis)) return false;

  const payload = context.contextualGrounding;
  const topic =
    payload?.topic ?? context.fit.inspirationContext?.topic ?? "";
  const extra = (payload?.facts ?? [])
    .flatMap((fact) => [fact.label, fact.statement])
    .join(" ");
  const tokens = topicTokens(`${topic} ${extra}`).filter(
    (token) => !context.analysis.objectName.toLowerCase().includes(token),
  );

  if (tokens.length === 0) return true;

  const hay = question.toLowerCase();
  return tokens.some((token) => {
    if (hay.includes(token)) return true;
    if (token.endsWith("s") && hay.includes(token.slice(0, -1))) return true;
    return false;
  });
}

const ATTRIBUTED_TO_OBJECT =
  /\b(?:your|the)\s+[\w-]+\s+(?:shows|showed|has printed|is labelled|is labeled|contains|holds)\s+(\d+(?:\.\d+)?)/gi;

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
    const amount = Number(raw);
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
  }
}

function parseValues(values: readonly WireOperand[]): UsedValue[] | null {
  if (values.length === 0) return null;

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

function parseCorrectAnswer(
  answer: WireChallenge["correctAnswer"],
): CorrectAnswer | null {
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
    case "arithmetic":
      if (!isArithmeticOp(wire.operation) || operands.length < 2) return null;
      return parseUnion({
        type: "arithmetic",
        operation: wire.operation,
        operands,
      });
    case "division":
      if (!isDivisionOp(wire.operation) || operands.length < 2) return null;
      return parseUnion({
        type: "division",
        operation: wire.operation,
        dividend: operands[0],
        divisor: operands[1],
      });
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
    case "conversion":
      if (!isConversionOp(wire.operation) || operands.length < 2) return null;
      return parseUnion({
        type: "conversion",
        operation: wire.operation,
        value: operands[0],
        factor: operands[1],
      });
    case "geometry":
      if (!isGeometryOp(wire.operation) || !isGeometryShape(wire.shape)) {
        return null;
      }
      if (operands.length < 1) return null;
      return parseUnion({
        type: "geometry",
        operation: wire.operation,
        shape: wire.shape,
        dimensions: operands,
      });
  }
}

function parseUnion(value: unknown): Computation | null {
  const parsed = ComputationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function valuesAreGrounded(
  values: readonly UsedValue[],
  context: ChallengeContext,
): boolean {
  const observed = catalogObserved(context.analysis, context.fit);
  const payload = context.contextualGrounding ?? null;

  for (const value of values) {
    if (value.origin === "observed" && !isObservedFact(value, observed)) {
      return false;
    }

    if (
      value.origin === "student_provided" &&
      !isStudentProvided(value, context.studentEvidence)
    ) {
      return false;
    }

    if (value.origin === "contextual") {
      if (context.fit.challengeMode !== "inspired_math") return false;
      if (isObservedFact(value, observed)) return false;
      if (!isContextualFact(value, payload)) return false;
    }

    if (value.origin === "given_in_problem") {
      if (isObservedFact(value, observed)) return false;
      if (isContextualFact(value, payload)) return false;
    }
  }

  return true;
}

function computationUsesUsableAnchor(
  computation: Computation,
  values: readonly UsedValue[],
  context: ChallengeContext,
): boolean {
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

  if (!HYPOTHETICAL.test(question)) return false;

  return given.every((value) => question.includes(String(value.value)));
}

const ATTRIBUTED_MEASUREMENT =
  /\b(?:contains|holds|shows|labelled|labeled|printed)\s+(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|fluid ounces?|oz|ounces?|mL|ml|millilitres?|milliliters?|L|litres?|liters?|g|grams?|kg|cm|mm|inches|inch|in\.?|feet|foot|ft|lbs?|pounds?)\b/gi;

function attributesUnobservedMeasurement(
  question: string,
  analysis: ObjectAnalysis,
): boolean {
  const observed = catalogObserved(analysis);

  for (const match of question.matchAll(ATTRIBUTED_MEASUREMENT)) {
    const rawValue = match[1];
    const rawUnit = match[2];
    if (rawValue === undefined || rawUnit === undefined) continue;

    const value = Number(rawValue);
    const ok = observed.some(
      (fact) =>
        fact.value === value &&
        (fact.unit === undefined || unitsLooselyMatch(fact.unit, rawUnit)),
    );

    if (!ok) return true;
  }

  return false;
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
    answerNumber(answer),
  ];

  for (const text of texts) {
    for (const match of text.matchAll(MEASUREMENT)) {
      const rawValue = match[1];
      const rawUnit = match[2];
      if (rawValue === undefined || rawUnit === undefined) continue;

      const value = Number(rawValue);
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

function answerNumber(answer: CorrectAnswer): { value: number; unit?: string } {
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

function cleanOptional(value: string | null): string | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isArithmeticOp(
  value: string,
): value is "add" | "subtract" | "multiply" {
  return value === "add" || value === "subtract" || value === "multiply";
}

function isDivisionOp(
  value: string,
): value is "quotient" | "whole_groups" | "remainder" {
  return (
    value === "quotient" || value === "whole_groups" || value === "remainder"
  );
}

function isConversionOp(value: string): value is "multiply" | "divide" {
  return value === "multiply" || value === "divide";
}

function isGeometryOp(value: string): value is "perimeter" | "area" {
  return value === "perimeter" || value === "area";
}

function isGeometryShape(
  value: string | null,
): value is "rectangle" | "square" | "triangle" {
  return value === "rectangle" || value === "square" || value === "triangle";
}
