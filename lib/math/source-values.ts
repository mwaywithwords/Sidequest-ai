import type { Computation, CorrectAnswer, UsedValue } from "@/lib/ai/schemas";
import {
  computationOperands,
  evaluateArithmeticSteps,
} from "@/lib/math/evaluate";
import { valuesMatch } from "@/lib/math/grounding";
import { sameUnit } from "@/lib/math/units";

/**
 * Source values vs derived values.
 *
 * SOURCE VALUES belong in valuesUsed:
 * observed, student_provided, contextual, given_in_problem.
 *
 * DERIVED VALUES do not:
 * intermediate step results and the final answer.
 *
 * Structured computation is authoritative for which operands exist.
 * This module may copy a missing source entry from the computation, or
 * drop a clearly derived extra. It does not invent an origin, and it
 * does not guess when value/unit/origin disagree.
 */

export type ValuesUsedAlignment =
  | { status: "ok"; values: UsedValue[]; repaired: boolean }
  | { status: "conflict" };

type Quantity = {
  value: number;
  unit?: string;
};

export function sourceOperands(computation: Computation): UsedValue[] {
  return uniqueValues(computationOperands(computation));
}

export function derivedQuantities(
  computation: Computation,
  answer: CorrectAnswer,
): Quantity[] {
  const derived: Quantity[] = [];

  if (computation.type === "multi_step_arithmetic") {
    const steps = evaluateArithmeticSteps(computation.steps);
    if (steps.ok) {
      for (const result of steps.values) {
        derived.push(quantityOf(result));
      }
    }
  }

  if (answer.type === "number") {
    derived.push({ value: answer.value, unit: answer.unit });
  }

  return derived;
}

export function isSourceValue(
  value: UsedValue,
  sources: readonly UsedValue[],
): boolean {
  return sources.some((source) => valuesMatch(source, value));
}

export function isDerivedNonSource(
  value: UsedValue,
  sources: readonly UsedValue[],
  derived: readonly Quantity[],
): boolean {
  if (isSourceValue(value, sources)) return false;
  return derived.some((entry) => sameQuantity(value, entry));
}

/**
 * Make valuesUsed list the computation's source operands.
 *
 * - Missing source: copy it from the computation when origin and label
 *   are already present there.
 * - Extra derived intermediate or final answer: drop it.
 * - Same value/unit/origin, different label: keep the computation copy.
 * - Same value but disagreeing unit or origin for that operand: conflict.
 */
export function alignValuesUsedWithComputation(
  valuesUsed: readonly UsedValue[],
  computation: Computation,
  answer: CorrectAnswer,
): ValuesUsedAlignment {
  const sources = sourceOperands(computation);
  if (sources.length === 0) {
    return { status: "ok", values: [...valuesUsed], repaired: false };
  }

  const claimed = new Set<number>();
  const aligned: UsedValue[] = [];
  let repaired = false;

  for (const source of sources) {
    const exactIndex = valuesUsed.findIndex(
      (value, index) => !claimed.has(index) && valuesMatch(value, source),
    );
    if (exactIndex >= 0) {
      claimed.add(exactIndex);
      const existing = valuesUsed[exactIndex];
      if (existing === undefined) return { status: "conflict" };
      aligned.push(existing);
      continue;
    }

    const originUnitIndex = valuesUsed.findIndex(
      (value, index) =>
        !claimed.has(index) &&
        value.value === source.value &&
        value.origin === source.origin &&
        unitsAgree(value.unit, source.unit),
    );
    if (originUnitIndex >= 0) {
      claimed.add(originUnitIndex);
      aligned.push(source);
      repaired = true;
      continue;
    }

    const labelledIndex = valuesUsed.findIndex(
      (value, index) =>
        !claimed.has(index) && labelsAgree(value.label, source.label),
    );
    if (labelledIndex >= 0) {
      return { status: "conflict" };
    }

    const conflicting = valuesUsed.some(
      (value, index) =>
        !claimed.has(index) &&
        value.value === source.value &&
        value.origin === source.origin &&
        !unitsAgree(value.unit, source.unit),
    );
    if (conflicting) return { status: "conflict" };

    if (source.label.trim().length === 0) return { status: "conflict" };
    aligned.push(source);
    repaired = true;
  }

  const derived = derivedQuantities(computation, answer);
  for (const [index, value] of valuesUsed.entries()) {
    if (claimed.has(index)) continue;
    if (isDerivedNonSource(value, sources, derived)) {
      repaired = true;
      continue;
    }
    aligned.push(value);
  }

  return { status: "ok", values: aligned, repaired };
}

function uniqueValues(values: readonly UsedValue[]): UsedValue[] {
  const unique: UsedValue[] = [];
  for (const value of values) {
    if (!unique.some((entry) => valuesMatch(entry, value))) {
      unique.push(value);
    }
  }
  return unique;
}

function quantityOf(value: Quantity): Quantity {
  return value.unit === undefined
    ? { value: value.value }
    : { value: value.value, unit: value.unit };
}

function sameQuantity(left: Quantity, right: Quantity): boolean {
  return left.value === right.value && unitsAgree(left.unit, right.unit);
}

function unitsAgree(left?: string, right?: string): boolean {
  return sameUnit(left, right);
}

function labelsAgree(left: string, right: string): boolean {
  const a = left.trim().toLowerCase().replace(/\s+/g, " ");
  const b = right.trim().toLowerCase().replace(/\s+/g, " ");
  return a === b || a.includes(b) || b.includes(a);
}
