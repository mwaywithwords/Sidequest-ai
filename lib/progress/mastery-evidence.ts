import { GenerationMetadataSchema, type Computation } from "@/lib/ai/schemas";
import {
  AUTO_MAX_DIFFICULTY,
  gradeDefaultDifficulty,
} from "@/lib/progress/adaptation";
import {
  completedMasteryEvents,
  type SkillAttemptRow,
} from "@/lib/progress/mastery";
import type { Grade } from "@/lib/types";

/**
 * Displayed skill mastery: evidence of learning at this grade + skill.
 *
 * Evidence is a ceiling, not a second penalty on the same completions.
 * Accuracy, variety, and difficulty describe how strong the solved work
 * is inside that ceiling. Adaptation does not read this score.
 */

export const EVIDENCE_TARGET = 5;
export const VARIETY_GATE_KEYS = 3;
export const SOLVED_GATE_COUNT = 4;
export const EXPECTED_DIFFICULTY_SOLVES = 2;

export const PERFORMANCE_ACCURACY_WEIGHT = 30;
export const PERFORMANCE_VARIETY_WEIGHT = 20;
export const PERFORMANCE_DIFFICULTY_WEIGHT = 15;
export const PERFORMANCE_WEIGHT_TOTAL =
  PERFORMANCE_ACCURACY_WEIGHT +
  PERFORMANCE_VARIETY_WEIGHT +
  PERFORMANCE_DIFFICULTY_WEIGHT;

const MAGNITUDE_SMALL_MAX = 20;
const MAGNITUDE_MEDIUM_MAX = 100;
const FULL_MASTERY_EPSILON = 1e-9;

export type ChallengeMasteryFacts = {
  id: string;
  difficulty: unknown;
  generationMetadata: unknown;
};

export type DisplayedMastery = {
  score: number;
  evidenceCap: number;
  performanceMastery: number;
  accuracyScore: number;
  varietyScore: number;
  difficultyScore: number;
  completed: number;
  solved: number;
  structureKeys: readonly string[];
  solvedAtExpected: number;
  gatePassed: boolean;
};

export function evidenceCap(completed: number): number {
  if (!Number.isFinite(completed) || completed <= 0) return 0;
  return Math.min(Math.floor(completed) / EVIDENCE_TARGET, 1);
}

export function independenceValue(input: {
  solved: boolean;
  attemptNumber: number | null;
}): number {
  if (!input.solved || input.attemptNumber === null) return 0;
  if (input.attemptNumber <= 1) return 1;
  if (input.attemptNumber === 2) return 0.75;
  return 0.5;
}

/**
 * Canonical mathematical structure key from a verified Computation.
 *
 * Format: family|detail|steps|arity|magnitude
 *
 * Magnitude bands use the largest absolute operand:
 *   small  [0, 20)
 *   medium [20, 100)
 *   large  [100, ∞)
 *
 * Qualitative geometry has no numeric magnitude (`qual`).
 * Photographed object names and AI prose are not part of the key.
 */
export function structureKeyFromComputation(computation: Computation): string {
  const mag = magnitudeBand(numericValuesFromComputation(computation));

  switch (computation.type) {
    case "arithmetic":
      return joinKey([
        "arithmetic",
        computation.operation,
        "one_step",
        `n${computation.operands.length}`,
        mag,
      ]);
    case "multi_step_arithmetic":
      return joinKey([
        "multi_step",
        computation.steps.map((step) => step.operation).join("+"),
        `steps${computation.steps.length}`,
        `n${countValueOperands(computation)}`,
        mag,
      ]);
    case "division":
      return joinKey([
        "division",
        computation.operation,
        "one_step",
        "n2",
        mag,
      ]);
    case "fraction_of":
      return joinKey(["fraction_of", "one_step", "n1", mag]);
    case "fraction_remaining":
      return joinKey([
        "fraction_remaining",
        computation.simplify ? "simplify" : "unsimplified",
        "one_step",
        "n2",
        mag,
      ]);
    case "conversion":
      return joinKey([
        "conversion",
        computation.operation,
        "one_step",
        "n2",
        mag,
      ]);
    case "geometry":
      return joinKey([
        "geometry",
        computation.operation,
        computation.shape,
        "one_step",
        `n${computation.dimensions.length}`,
        mag,
      ]);
    case "shape_identify":
      return joinKey([
        "shape_identify",
        computation.aspect,
        computation.label,
        "qual",
      ]);
    case "shape_count":
      return joinKey([
        "shape_count",
        computation.shape,
        computation.feature,
        "qual",
      ]);
  }
}

export function varietyScoreFromKeys(keys: readonly string[]): number {
  const unique = new Set(keys.filter((key) => key.length > 0)).size;
  if (unique <= 0) return 0;
  if (unique === 1) return 0.4;
  if (unique === 2) return 0.7;
  return 1;
}

export function difficultyScoreFromSolved(
  difficulties: readonly number[],
): number {
  const usable = difficulties.filter(
    (value) => Number.isInteger(value) && value >= 1 && value <= 5,
  );
  if (usable.length === 0) return 0;
  return Math.min(Math.max(...usable) / AUTO_MAX_DIFFICULTY, 1);
}

export function performanceMastery(input: {
  accuracyScore: number;
  varietyScore: number;
  difficultyScore: number;
}): number {
  const weighted =
    clamp01(input.accuracyScore) * PERFORMANCE_ACCURACY_WEIGHT +
    clamp01(input.varietyScore) * PERFORMANCE_VARIETY_WEIGHT +
    clamp01(input.difficultyScore) * PERFORMANCE_DIFFICULTY_WEIGHT;
  return weighted / PERFORMANCE_WEIGHT_TOTAL;
}

export function displayedSkillMastery(input: {
  attempts: readonly SkillAttemptRow[];
  challenges: readonly ChallengeMasteryFacts[];
  grade: Grade;
}): DisplayedMastery {
  const events = completedMasteryEvents(input.attempts);
  const factsById = new Map(
    input.challenges.map((row) => [row.id, row] as const),
  );
  const expectedDifficulty = gradeDefaultDifficulty(input.grade);

  const completed = events.length;
  const cap = evidenceCap(completed);
  const solvedEvents = events.filter((event) => event.solved);

  const accuracyScore =
    completed === 0
      ? 0
      : events.reduce((sum, event) => sum + event.independence, 0) /
        completed;

  const structureKeys: string[] = [];
  const solvedDifficulties: number[] = [];
  let solvedAtExpected = 0;

  for (const event of solvedEvents) {
    const facts = factsById.get(event.challengeId);
    const computation = computationFromMetadata(facts?.generationMetadata);
    if (computation !== null) {
      structureKeys.push(structureKeyFromComputation(computation));
    }

    const difficulty = parseDifficulty(facts?.difficulty);
    if (difficulty !== null) {
      solvedDifficulties.push(difficulty);
      if (difficulty >= expectedDifficulty) solvedAtExpected += 1;
    }
  }

  const uniqueKeys = [...new Set(structureKeys)];
  const varietyScore = varietyScoreFromKeys(uniqueKeys);
  const difficultyScore = difficultyScoreFromSolved(solvedDifficulties);
  const performance = performanceMastery({
    accuracyScore,
    varietyScore,
    difficultyScore,
  });

  const gatePassed = masteryGatePassed({
    completed,
    solved: solvedEvents.length,
    structureKeyCount: uniqueKeys.length,
    solvedAtExpected,
    performanceMastery: performance,
    evidenceCap: cap,
  });

  return {
    score: applyMasteryGate(performance, cap, gatePassed),
    evidenceCap: cap,
    performanceMastery: performance,
    accuracyScore,
    varietyScore,
    difficultyScore,
    completed,
    solved: solvedEvents.length,
    structureKeys: uniqueKeys,
    solvedAtExpected,
    gatePassed,
  };
}

export function masteryGatePassed(input: {
  completed: number;
  solved: number;
  structureKeyCount: number;
  solvedAtExpected: number;
  performanceMastery: number;
  evidenceCap: number;
}): boolean {
  return (
    input.completed >= EVIDENCE_TARGET &&
    input.solved >= SOLVED_GATE_COUNT &&
    input.structureKeyCount >= VARIETY_GATE_KEYS &&
    input.solvedAtExpected >= EXPECTED_DIFFICULTY_SOLVES &&
    input.evidenceCap >= 1 &&
    input.performanceMastery + FULL_MASTERY_EPSILON >= 1
  );
}

export function applyMasteryGate(
  performanceMastery: number,
  cap: number,
  gatePassed: boolean,
): number {
  const capped = Math.min(clamp01(performanceMastery), clamp01(cap));
  if (gatePassed && capped + FULL_MASTERY_EPSILON >= 1) return 1;
  if (!gatePassed) return Math.min(capped, 0.99);
  return capped;
}

export function computationFromMetadata(
  metadata: unknown,
): Computation | null {
  const parsed = GenerationMetadataSchema.safeParse(metadata);
  if (!parsed.success) return null;
  return parsed.data.computation;
}

function parseDifficulty(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 1 || value > 5) return null;
  return value;
}

function numericValuesFromComputation(computation: Computation): number[] {
  switch (computation.type) {
    case "arithmetic":
      return computation.operands.map((operand) => operand.value);
    case "multi_step_arithmetic":
      return computation.steps.flatMap((step) =>
        step.operands.flatMap((operand) =>
          operand.kind === "value" ? [operand.value] : [],
        ),
      );
    case "division":
      return [computation.dividend.value, computation.divisor.value];
    case "fraction_of":
      return [
        computation.quantity.value,
        computation.numerator,
        computation.denominator,
      ];
    case "fraction_remaining":
      return [computation.totalParts.value, computation.usedParts.value];
    case "conversion":
      return [computation.value.value, computation.factor.value];
    case "geometry":
      return computation.dimensions.map((operand) => operand.value);
    case "shape_identify":
    case "shape_count":
      return [];
  }
}

function countValueOperands(computation: Extract<Computation, { type: "multi_step_arithmetic" }>): number {
  return computation.steps.reduce((count, step) => {
    return (
      count +
      step.operands.filter((operand) => operand.kind === "value").length
    );
  }, 0);
}

function magnitudeBand(values: readonly number[]): "small" | "medium" | "large" | "qual" {
  const finite = values.filter((value) => Number.isFinite(value)).map(Math.abs);
  if (finite.length === 0) return "qual";
  const max = Math.max(...finite);
  if (max < MAGNITUDE_SMALL_MAX) return "small";
  if (max < MAGNITUDE_MEDIUM_MAX) return "medium";
  return "large";
}

function joinKey(parts: readonly string[]): string {
  return parts.join("|");
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
