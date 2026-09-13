import type {
  ObjectAnalysis,
  ReadySkillFit,
  UsedValue,
} from "@/lib/ai/schemas";
import { sameUnit } from "@/lib/math/units";

/**
 * Independent grounding for the verifier.
 *
 * Challenge Generation already checked this once. The verifier checks
 * again from ObjectAnalysis so an invented "observed" 12 fl oz cannot
 * pass just because the generator emitted it.
 */

export type StudentEvidenceValue = {
  property: string;
  value: number;
  unit?: string;
};

type ObservedFact = {
  value: number;
  unit?: string;
  labels: string[];
};

export function catalogObserved(
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

export function isObservedValue(
  value: UsedValue,
  analysis: ObjectAnalysis,
  fit?: ReadySkillFit,
): boolean {
  return catalogObserved(analysis, fit).some((fact) => {
    if (fact.value !== value.value) return false;
    if (!unitsAgree(fact.unit, value.unit)) return false;
    return fact.labels.some((label) => labelsLooselyMatch(label, value.label));
  });
}

export function isStudentProvidedValue(
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

export function valuesMatch(left: UsedValue, right: UsedValue): boolean {
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
  return sameUnit(left, right);
}

function labelsLooselyMatch(left: string, right: string): boolean {
  const a = normaliseLabel(left);
  const b = normaliseLabel(right);
  return a === b || a.includes(b) || b.includes(a);
}

function normaliseLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/g, "");
}
