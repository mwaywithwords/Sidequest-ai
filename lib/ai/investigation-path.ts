import {
  type ChallengeMode,
  type EvidenceRequest,
  type InspirationContext,
  type InvestigationAnchor,
  type ObjectAnalysis,
} from "@/lib/ai/schemas";
import {
  buildSemanticInspiration,
  canAnchorSemantically,
  inferSemanticPurpose,
} from "@/lib/ai/semantic-purpose";
import { looksGeometric } from "@/lib/math/geometry-forms";
import type { SkillId } from "@/lib/types";

const ARITHMETIC_SKILLS: ReadonlySet<SkillId> = new Set([
  "addition",
  "subtraction",
  "multiplication",
  "division",
  "fractions",
]);

/**
 * How a first photograph is turned into an investigation path.
 *
 * The vision stage has already been conservative: every property that reaches
 * here is something the photograph actually showed. This module decides what
 * SIDEQUEST is allowed to do with that reading. It does not invent facts.
 *
 * Paths are exhausted in order: observed math, visible form, semantic
 * real-world context, then investigation only when touching the object
 * is the better lesson. `poor_fit` is last. A missing printed number is
 * not, by itself, a reason to stop.
 */

/**
 * Historical bar for calling a path "direct". No longer a refusal threshold:
 * object_math is allowed whenever the reading actually supplies an anchor.
 */
export const MIN_FIT_SCORE = 0.6;

export type WireInvestigation = {
  challengeMode: ChallengeMode;
  fitScore: number;
  reason: string;
  evidenceRequest: EvidenceRequest | null;
  inspirationContext: InspirationContext | null;
};

export type ResolvedInvestigation = {
  challengeMode: ChallengeMode;
  reason: string;
  evidenceRequest: EvidenceRequest | null;
  inspirationContext: InspirationContext | null;
};

/**
 * Constrains the model's chosen path against what the reading can actually
 * support. The model proposes; this function decides.
 *
 * OBJECT_MATH needs at least one skill-relevant grounded property.
 * Arithmetic skills need a numeric or countable anchor, not a shape.
 * INSPIRED_MATH needs a structured real-world context, not a fact invented
 * about the object. A missing number prefers this path over a forced
 * investigation.
 * INVESTIGATION_MATH needs a well-formed request. Measuring this object
 * may still be the better lesson for measurement. For arithmetic skills
 * with a semantic domain and no numeric anchor, recovery upgrades this
 * to inspired_math.
 * POOR_FIT is last. A valid earlier path always wins.
 */
export function resolveInvestigation(
  wire: WireInvestigation,
  grounded: readonly string[],
): ResolvedInvestigation {
  const hasAnchor = grounded.length > 0;
  const evidenceRequest = wire.evidenceRequest;
  const inspirationContext = wire.inspirationContext;
  const hasEvidence = evidenceRequest !== null;
  const hasInspiration = inspirationContext !== null;

  const requested = wire.challengeMode;
  const resolved = resolveMode(requested, {
    hasAnchor,
    hasEvidence,
    hasInspiration,
  });

  if (resolved === "investigation_math" && evidenceRequest === null) {
    return {
      challengeMode: "poor_fit",
      reason: pathReason(requested, "poor_fit", wire.reason),
      evidenceRequest: null,
      inspirationContext: null,
    };
  }

  if (resolved === "inspired_math" && inspirationContext === null) {
    return {
      challengeMode: "poor_fit",
      reason: pathReason(requested, "poor_fit", wire.reason),
      evidenceRequest: null,
      inspirationContext: null,
    };
  }

  return {
    challengeMode: resolved,
    reason: pathReason(requested, resolved, wire.reason),
    evidenceRequest: resolved === "investigation_math" ? evidenceRequest : null,
    inspirationContext: resolved === "inspired_math" ? inspirationContext : null,
  };
}

/**
 * After the wire path is resolved, recover a legitimate path from the
 * reading when the model still landed on poor_fit. Copies only properties
 * the photograph already established. Does not change the selected skill.
 */
export function recoverInvestigation(
  resolved: ResolvedInvestigation,
  analysis: ObjectAnalysis,
  skillId: SkillId,
): { resolved: ResolvedInvestigation; usableProperties: string[] } {
  if (
    resolved.challengeMode === "object_math" ||
    resolved.challengeMode === "inspired_math"
  ) {
    return { resolved, usableProperties: [] };
  }

  const anchors = readingAnchors(analysis, skillId);
  const inspired = recoverInspiredMath(analysis, skillId, anchors);
  if (inspired !== null) {
    return inspired;
  }

  if (resolved.challengeMode !== "poor_fit") {
    return { resolved, usableProperties: [] };
  }

  if (anchors.length > 0) {
    return {
      resolved: {
        challengeMode: "object_math",
        reason:
          "The photograph already shows a mathematical property that can anchor this skill.",
        evidenceRequest: null,
        inspirationContext: null,
      },
      usableProperties: anchors,
    };
  }

  if (investigationIsBetter(analysis, skillId)) {
    const evidenceRequest = fallbackEvidenceRequest(analysis, skillId);
    if (evidenceRequest !== null) {
      return {
        resolved: {
          challengeMode: "investigation_math",
          reason:
            "Interacting with this object produces a better measurement lesson than a hypothetical situation.",
          evidenceRequest,
          inspirationContext: null,
        },
        usableProperties: [],
      };
    }
  }

  const inspirationContext = fallbackInspirationContext(analysis, skillId);
  if (inspirationContext !== null) {
    return {
      resolved: {
        challengeMode: "inspired_math",
        reason:
          "The object's ordinary real-world use can honestly anchor this skill without a visible number.",
        evidenceRequest: null,
        inspirationContext,
      },
      usableProperties: [],
    };
  }

  const evidenceRequest = fallbackEvidenceRequest(analysis, skillId);
  if (evidenceRequest !== null) {
    return {
      resolved: {
        challengeMode: "investigation_math",
        reason:
          "The object can support this skill once the student makes one more observation.",
        evidenceRequest,
        inspirationContext: null,
      },
      usableProperties: [],
    };
  }

  return { resolved, usableProperties: [] };
}

/**
 * Arithmetic skills with a real-world semantic domain and no numeric
 * photograph anchor recover to inspired_math. Domain comes from the
 * object's ordinary purpose, not from a hardcoded object-name table.
 */
function recoverInspiredMath(
  analysis: ObjectAnalysis,
  skillId: SkillId,
  anchors: readonly string[],
): { resolved: ResolvedInvestigation; usableProperties: string[] } | null {
  if (anchors.length > 0) return null;
  if (!ARITHMETIC_SKILLS.has(skillId)) return null;
  if (!canAnchorSemantically(analysis)) return null;
  if (inferSemanticPurpose(analysis).domains.length === 0) return null;

  const inspirationContext = fallbackInspirationContext(analysis, skillId);
  if (inspirationContext === null) return null;

  return {
    resolved: {
      challengeMode: "inspired_math",
      reason:
        "The object's ordinary real-world use can honestly anchor this skill without a visible number.",
      evidenceRequest: null,
      inspirationContext,
    },
    usableProperties: [],
  };
}

/**
 * Observed properties from the reading that can support object_math for
 * this skill. Geometry may use shape alone. Arithmetic and fractions need
 * a numeric or countable anchor that actually contains a number. A
 * rectangle or sphere is not an addition anchor. Nothing here is invented.
 */
export function readingAnchors(
  analysis: ObjectAnalysis,
  skillId: SkillId,
): string[] {
  if (skillId === "geometry") {
    return unique([
      ...analysis.shapeProperties,
      ...analysis.observableProperties.filter(looksGeometric),
      ...analysis.countableProperties.filter(looksGeometric),
    ]);
  }

  const measurements = analysis.visibleMeasurements.map(
    (measurement) =>
      `${measurement.label}: ${measurement.value} ${measurement.unit}`,
  );

  if (skillId === "measurement") {
    return unique(measurements);
  }

  return unique([
    ...measurements,
    ...analysis.countableProperties.filter(hasNumericCount),
  ]);
}

export function hasNumericCount(property: string): boolean {
  return /\d+(?:\.\d+)?/.test(property);
}

/**
 * Semantic recovery when the photograph has no useful number. Built from
 * the object's ordinary purpose, not from a hardcoded object → path table.
 */
export function fallbackInspirationContext(
  analysis: ObjectAnalysis,
  skillId: SkillId,
): InspirationContext | null {
  if (!canAnchorSemantically(analysis)) return null;
  return buildSemanticInspiration(analysis, skillId);
}

/**
 * Measuring this object is the better lesson. Do not use this merely
 * because the photograph has no printed number.
 */
function investigationIsBetter(
  analysis: ObjectAnalysis,
  skillId: SkillId,
): boolean {
  return skillId === "measurement" && analysis.visibleMeasurements.length === 0;
}

/**
 * One extra observation when measuring this object is the better lesson,
 * or when no semantic path can be formed. Not the default for a
 * numberless ordinary object.
 */
export function fallbackEvidenceRequest(
  analysis: ObjectAnalysis,
  skillId: SkillId,
): EvidenceRequest | null {
  if (!hasAnyObservedFeature(analysis)) return null;

  const object = analysis.objectName.trim() || "object";

  if (skillId === "measurement" || skillId === "geometry") {
    return {
      type: "student_measurement",
      prompt: `Measure the longest side or the widest part of your ${object}.`,
      targetProperty: "measured length",
      reason: "A real measurement from your object lets us do this mission.",
    };
  }

  if (skillId === "fractions") {
    return {
      type: "student_count",
      prompt: `Count how many equal parts or sections you can see on your ${object}.`,
      targetProperty: "equal parts",
      reason: "A real count of parts lets us work with fractions.",
    };
  }

  return {
    type: "student_count",
    prompt: `Count one group of parts on your ${object}.`,
    targetProperty: "visible count",
    reason: "A real number from your object lets us do this mission.",
  };
}

function resolveMode(
  requested: ChallengeMode,
  flags: {
    hasAnchor: boolean;
    hasEvidence: boolean;
    hasInspiration: boolean;
  },
): ChallengeMode {
  const { hasAnchor, hasEvidence, hasInspiration } = flags;

  switch (requested) {
    case "object_math":
      if (hasAnchor) return "object_math";
      if (hasInspiration) return "inspired_math";
      if (hasEvidence) return "investigation_math";
      return "poor_fit";

    case "investigation_math":
      if (hasEvidence) return "investigation_math";
      if (hasAnchor) return "object_math";
      if (hasInspiration) return "inspired_math";
      return "poor_fit";

    case "inspired_math":
      if (hasInspiration) return "inspired_math";
      if (hasAnchor) return "object_math";
      if (hasEvidence) return "investigation_math";
      return "poor_fit";

    case "poor_fit":
      if (hasAnchor) return "object_math";
      if (hasInspiration) return "inspired_math";
      if (hasEvidence) return "investigation_math";
      return "poor_fit";
  }
}

/**
 * When the application changes the mode, the stored reason has to match the
 * decision that actually landed. The model's wording is kept when the two agree.
 */
function pathReason(
  requested: ChallengeMode,
  resolved: ChallengeMode,
  original: string,
): string {
  if (requested === resolved) return original;

  if (resolved === "object_math") {
    return "The first photograph has a grounded property that can anchor this skill.";
  }

  if (resolved === "investigation_math") {
    return "The object can support this skill, but the first photograph does not yet establish a usable mathematical anchor.";
  }

  if (resolved === "inspired_math") {
    return "The object's real-world context can legitimately inspire this skill even without a visible number.";
  }

  return "No legitimate investigation path remains after checking object math, one further student observation, and inspired real-world context.";
}

/**
 * Builds the origin-tagged anchors a future Challenge Generator will read.
 *
 * Observed entries are the grounded usable properties. An investigation_math
 * path also records the target as `student_provided` — the value is not
 * known yet, only that this is the property the student is being asked for.
 *
 * `given_in_problem` is not an investigation origin and cannot appear here.
 */
export function buildAnchors(
  grounded: readonly string[],
  evidenceRequest: EvidenceRequest | null,
): InvestigationAnchor[] {
  const observed = grounded.map((property) => ({
    property,
    origin: "observed" as const,
  }));

  if (evidenceRequest === null) return observed;

  const target = evidenceRequest.targetProperty;
  const alreadyListed = observed.some(
    (anchor) => normalise(anchor.property) === normalise(target),
  );

  if (alreadyListed) return observed;

  return [
    ...observed,
    { property: target, origin: "student_provided" as const },
  ];
}

export function canGenerateFromMode(
  mode: ChallengeMode,
): mode is "object_math" | "inspired_math" {
  return mode === "object_math" || mode === "inspired_math";
}

function hasAnyObservedFeature(analysis: ObjectAnalysis): boolean {
  return (
    analysis.visibleText.length > 0 ||
    analysis.visibleMeasurements.length > 0 ||
    analysis.countableProperties.length > 0 ||
    analysis.shapeProperties.length > 0 ||
    analysis.observableProperties.length > 0
  );
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
