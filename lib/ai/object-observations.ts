import {
  type ObjectAnalysis,
  ObjectAnalysisSchema,
} from "@/lib/ai/schemas";

/**
 * Cleaning a model reading without inventing anything.
 *
 * ObjectAnalysisSchema stays strict. This runs first so one blank unit or
 * empty string cannot throw away a whole photograph. A measurement that is
 * missing its unit or label is dropped, not repaired: guessing "g" for a
 * protein figure would invent a fact the student could later disprove.
 */

export const MIN_OBJECT_CONFIDENCE = 0.5;

export type WireMeasurement = {
  value: number;
  unit: string;
  label: string;
};

export type WireObservations = {
  visibleText: readonly string[];
  visibleMeasurements: readonly WireMeasurement[];
  countableProperties: readonly string[];
  shapeProperties: readonly string[];
  observableProperties: readonly string[];
};

export type SanitizedObservations = {
  visibleText: string[];
  visibleMeasurements: Array<{
    value: number;
    unit: string;
    label: string;
  }>;
  countableProperties: string[];
  shapeProperties: string[];
  observableProperties: string[];
};

export type WireObjectReading = WireObservations & {
  identifiable: boolean;
  objectName: string;
  category: string;
  brand: string | null;
  confidence: number;
};

export type ObjectReadingResult =
  | { status: "ok"; analysis: ObjectAnalysis }
  | { status: "unknown_object" }
  | { status: "insufficient_information" }
  | { status: "generation_failure" };

/**
 * Drops incomplete observations. Does not fill in units, labels, or text.
 */
export function sanitizeObservations(
  wire: WireObservations,
): SanitizedObservations {
  return {
    visibleText: cleanStrings(wire.visibleText),
    visibleMeasurements: wire.visibleMeasurements.flatMap((measurement) => {
      const kept = keepMeasurement(measurement);
      return kept ? [kept] : [];
    }),
    countableProperties: cleanStrings(wire.countableProperties),
    shapeProperties: cleanStrings(wire.shapeProperties),
    observableProperties: cleanStrings(wire.observableProperties),
  };
}

export function observationCount(observations: SanitizedObservations): number {
  return (
    observations.visibleText.length +
    observations.visibleMeasurements.length +
    observations.countableProperties.length +
    observations.shapeProperties.length +
    observations.observableProperties.length
  );
}

/**
 * Applies identity checks, observation sanitizing, then ObjectAnalysisSchema.
 *
 * A malformed optional observation is discarded. A malformed name, category,
 * or confidence is still a generation failure — those are the reading, not
 * an extra detail.
 */
export function finalizeObjectReading(
  wire: WireObjectReading,
): ObjectReadingResult {
  if (!isConfidenceInRange(wire.confidence)) {
    return { status: "generation_failure" };
  }

  if (!wire.identifiable || wire.confidence < MIN_OBJECT_CONFIDENCE) {
    return { status: "unknown_object" };
  }

  const observations = sanitizeObservations(wire);

  if (observationCount(observations) === 0) {
    return { status: "insufficient_information" };
  }

  const brand = cleanOptional(wire.brand);

  const parsed = ObjectAnalysisSchema.safeParse({
    objectName: wire.objectName,
    category: wire.category,
    ...(brand === undefined ? {} : { brand }),
    confidence: wire.confidence,
    ...observations,
  });

  if (!parsed.success) {
    return { status: "generation_failure" };
  }

  return { status: "ok", analysis: parsed.data };
}

function keepMeasurement(
  measurement: WireMeasurement,
): { value: number; unit: string; label: string } | null {
  const unit = measurement.unit.trim();
  const label = measurement.label.trim();

  if (!Number.isFinite(measurement.value) || unit.length === 0 || label.length === 0) {
    return null;
  }

  return { value: measurement.value, unit, label };
}

function cleanStrings(values: readonly string[]): string[] {
  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

function cleanOptional(value: string | null): string | undefined {
  if (value === null) return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isConfidenceInRange(confidence: number): boolean {
  return Number.isFinite(confidence) && confidence >= 0 && confidence <= 1;
}
