import {
  type ChallengeMode,
  type EvidenceRequest,
  type InvestigationAnchor,
} from "@/lib/ai/schemas";

/**
 * How a first photograph is turned into an investigation path.
 *
 * The vision stage has already been conservative: every property that reaches
 * here is something the photograph actually showed. This module decides what
 * SIDEQUEST is allowed to do with that reading. It does not invent facts.
 *
 * `MIN_FIT_SCORE` is the bar for proceeding DIRECTLY from the first image. It
 * is not the bar for keeping the quest alive. A moderate score with a real
 * investigation path is `needs_evidence` or `grounded_scenario`, not a refusal.
 */

/**
 * Enough to build a challenge from the photograph as it stands.
 *
 * Kept at 0.6 — the same number as before — because 0.5 on a self-reported
 * scale is still a shrug, and a shrug should not be called `direct`. What
 * changed is the consequence of landing below it. The old stage treated that
 * as a dead end. This one asks whether another path is still honest.
 */
export const MIN_FIT_SCORE = 0.6;

export type WireInvestigation = {
  challengeMode: ChallengeMode;
  fitScore: number;
  reason: string;
  evidenceRequest: EvidenceRequest | null;
};

export type ResolvedInvestigation = {
  challengeMode: ChallengeMode;
  reason: string;
  evidenceRequest: EvidenceRequest | null;
};

/**
 * Constrains the model's chosen path against what the reading can actually
 * support. The model proposes; this function decides.
 *
 * DIRECT needs a high score and at least one grounded property.
 * GROUNDED_SCENARIO needs a grounded property, and may sit below the direct bar.
 * NEEDS_EVIDENCE needs a well-formed request, and may have no grounded property yet.
 * POOR_FIT is last. A valid evidence request is a path, so it wins.
 */
export function resolveInvestigation(
  wire: WireInvestigation,
  grounded: readonly string[],
): ResolvedInvestigation {
  const hasAnchor = grounded.length > 0;
  const evidenceRequest = wire.evidenceRequest;
  const hasEvidence = evidenceRequest !== null;
  const strongDirect = hasAnchor && wire.fitScore >= MIN_FIT_SCORE;

  const requested = wire.challengeMode;
  const resolved = resolveMode(requested, {
    strongDirect,
    hasAnchor,
    hasEvidence,
  });

  // `needs_evidence` is only chosen when a request survived validation. If that
  // ever slipped, falling through to poor_fit is safer than storing a hole.
  if (resolved === "needs_evidence" && evidenceRequest === null) {
    return {
      challengeMode: "poor_fit",
      reason: pathReason(requested, "poor_fit", wire.reason),
      evidenceRequest: null,
    };
  }

  return {
    challengeMode: resolved,
    reason: pathReason(requested, resolved, wire.reason),
    evidenceRequest: resolved === "needs_evidence" ? evidenceRequest : null,
  };
}

function resolveMode(
  requested: ChallengeMode,
  flags: { strongDirect: boolean; hasAnchor: boolean; hasEvidence: boolean },
): ChallengeMode {
  const { strongDirect, hasAnchor, hasEvidence } = flags;

  switch (requested) {
    case "direct":
      if (strongDirect) return "direct";
      if (hasEvidence) return "needs_evidence";
      if (hasAnchor) return "grounded_scenario";
      return "poor_fit";

    case "grounded_scenario":
      if (hasAnchor) return "grounded_scenario";
      if (hasEvidence) return "needs_evidence";
      return "poor_fit";

    case "needs_evidence":
      if (hasEvidence) return "needs_evidence";
      if (strongDirect) return "direct";
      if (hasAnchor) return "grounded_scenario";
      return "poor_fit";

    case "poor_fit":
      // The model declined, but it also described a real next observation.
      // That is an investigation, not a refusal.
      if (hasEvidence) return "needs_evidence";
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

  if (resolved === "grounded_scenario") {
    return "The first photograph has a grounded property that can anchor a scenario, but not enough observed information to proceed as a direct challenge.";
  }

  if (resolved === "needs_evidence") {
    return "The object can support this skill, but the first photograph does not yet establish a usable mathematical anchor.";
  }

  return "No legitimate investigation path remains after checking observed properties, a grounded scenario, and one further student observation.";
}

/**
 * Builds the origin-tagged anchors a future Challenge Generator will read.
 *
 * Observed entries are the grounded usable properties. A needs_evidence path
 * also records the target as `student_provided` — the value is not known yet,
 * only that this is the property the student is being asked for.
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
): mode is "direct" | "grounded_scenario" {
  return mode === "direct" || mode === "grounded_scenario";
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
