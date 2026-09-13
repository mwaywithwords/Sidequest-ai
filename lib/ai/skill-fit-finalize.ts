import {
  buildAnchors,
  canGenerateFromMode,
  recoverInvestigation,
  resolveInvestigation,
} from "@/lib/ai/investigation-path";
import {
  CHALLENGE_MODES,
  type ChallengeMode,
  type EvidenceRequest,
  EvidenceRequestSchema,
  type InspirationContext,
  InspirationContextSchema,
  type InvestigationMathFit,
  type ObjectAnalysis,
  type QuestGenerationFailure,
  QuestGenerationFailureSchema,
  type ReadySkillFit,
  type SkillFitAnalysis,
  SkillFitAnalysisSchema,
} from "@/lib/ai/schemas";
import { copy } from "@/lib/copy";
import { getSkill } from "@/lib/skills";
import { SKILL_IDS, type SkillId } from "@/lib/types";

/**
 * Deterministic half of Skill Fit: ground the model's list, resolve the
 * path, and parse the application schema. The model call stays elsewhere
 * so this file can be tested without a network.
 */

export type SkillFitWire = {
  challengeMode: ChallengeMode;
  fitScore: number;
  usableProperties: readonly string[];
  reason: string;
  suggestedObjectCharacteristics: readonly string[];
  alternativeSkillCodes: readonly SkillId[];
  evidenceRequest: unknown;
  inspirationContext: unknown;
};

export type SkillFitResult =
  | { status: "ok"; fit: ReadySkillFit }
  | { status: "needsEvidence"; fit: InvestigationMathFit }
  | {
      status: "poorFit";
      fit: Extract<SkillFitAnalysis, { challengeMode: "poor_fit" }>;
      failure: QuestGenerationFailure;
    }
  | { status: "failed"; failure: QuestGenerationFailure };

export function isChallengeMode(value: unknown): value is ChallengeMode {
  return (
    typeof value === "string" &&
    (CHALLENGE_MODES as readonly string[]).includes(value)
  );
}

export function isSkillId(value: unknown): value is SkillId {
  return (
    typeof value === "string" && (SKILL_IDS as readonly string[]).includes(value)
  );
}

/**
 * Turns a parsed investigation section into the same SkillFitResult the
 * standalone call used to return. A malformed section is a generation
 * failure, never a positive fit.
 */
export function finalizeSkillFit(
  wire: SkillFitWire,
  analysis: ObjectAnalysis,
  skillId: SkillId,
): SkillFitResult {
  const grounded = groundProperties(wire.usableProperties, analysis);

  if (grounded.length < wire.usableProperties.length) {
    console.warn("[skill-fit] discarded properties absent from the reading", {
      listed: wire.usableProperties.length,
      grounded: grounded.length,
    });
  }

  const evidenceRequest = parseEvidenceRequest(wire.evidenceRequest);
  const inspirationContext = parseInspirationContext(wire.inspirationContext);

  const resolvedWire = resolveInvestigation(
    {
      challengeMode: wire.challengeMode,
      fitScore: wire.fitScore,
      reason: wire.reason,
      evidenceRequest,
      inspirationContext,
    },
    grounded,
  );

  const recovered = recoverInvestigation(resolvedWire, analysis, skillId);
  const resolved = recovered.resolved;
  const usableProperties = uniqueProperties([
    ...grounded,
    ...recovered.usableProperties,
  ]);

  const parsed = SkillFitAnalysisSchema.safeParse({
    selectedSkillCode: skillId,
    fitScore: wire.fitScore,
    challengeMode: resolved.challengeMode,
    canGenerateChallenge: canGenerateFromMode(resolved.challengeMode),
    usableProperties,
    reason: resolved.reason,
    suggestedObjectCharacteristics:
      resolved.challengeMode === "poor_fit"
        ? [...wire.suggestedObjectCharacteristics]
        : [],
    alternativeSkillCodes: [
      ...new Set(wire.alternativeSkillCodes.filter((code) => code !== skillId)),
    ],
    anchors: buildAnchors(usableProperties, resolved.evidenceRequest),
    evidenceRequest: resolved.evidenceRequest,
    inspirationContext: resolved.inspirationContext,
  });

  if (!parsed.success) {
    console.warn(
      "[skill-fit] judgement failed validation",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
      })),
    );

    return skillFitFailed();
  }

  const fit = parsed.data;

  if (fit.challengeMode === "investigation_math") {
    return { status: "needsEvidence", fit };
  }

  if (fit.challengeMode === "poor_fit") {
    return {
      status: "poorFit",
      fit,
      failure: QuestGenerationFailureSchema.parse({
        reason: "poor_skill_fit",
        studentMessage: poorFitMessage(skillId, fit.alternativeSkillCodes),
        recommendedNextAction:
          fit.alternativeSkillCodes.length > 0
            ? "choose_different_skill"
            : "find_different_object",
      }),
    };
  }

  return { status: "ok", fit };
}

export function parseEvidenceRequest(value: unknown): EvidenceRequest | null {
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  const clip = (field: unknown, max: number) =>
    typeof field === "string" ? field.trim().slice(0, max) : field;

  const parsed = EvidenceRequestSchema.safeParse({
    ...record,
    prompt: clip(record.prompt, 200),
    targetProperty: clip(record.targetProperty, 80),
    reason: clip(record.reason, 200),
  });

  return parsed.success ? parsed.data : null;
}

export function parseInspirationContext(
  value: unknown,
): InspirationContext | null {
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  const clip = (field: unknown, max: number) =>
    typeof field === "string" ? field.trim().slice(0, max) : field;

  const parsed = InspirationContextSchema.safeParse({
    topic: clip(record.topic, 120),
    reason: clip(record.reason, 280),
  });

  return parsed.success ? parsed.data : null;
}

export function skillFitFailed(): SkillFitResult {
  return {
    status: "failed",
    failure: QuestGenerationFailureSchema.parse({
      reason: "generation_failure",
      studentMessage: copy.fit.failure,
      recommendedNextAction: "retry",
    }),
  };
}

function uniqueProperties(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function groundProperties(
  listed: readonly string[],
  analysis: ObjectAnalysis,
): string[] {
  const recorded = new Map<string, string>();

  const record = (canonical: string, ...spellings: string[]) => {
    for (const spelling of [canonical, ...spellings]) {
      const key = normalise(spelling);
      if (key && !recorded.has(key)) recorded.set(key, canonical);
    }
  };

  for (const text of analysis.visibleText) record(text);

  for (const measurement of analysis.visibleMeasurements) {
    const { label, value, unit } = measurement;
    record(`${label}: ${value} ${unit}`, label, `${value} ${unit}`);
  }

  for (const property of [
    ...analysis.countableProperties,
    ...analysis.shapeProperties,
    ...analysis.observableProperties,
  ]) {
    record(property);
  }

  const grounded = listed
    .map((property) => recorded.get(normalise(property)))
    .filter((property): property is string => property !== undefined);

  return [...new Set(grounded)];
}

function normalise(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/, "");
}

function poorFitMessage(skillId: SkillId, alternatives: readonly SkillId[]) {
  const skill = getSkill(skillId);
  const alternative = alternatives[0];

  return [
    copy.fit.noChallenge(skill.label.toLowerCase()),
    copy.fit.tryInstead(skill.lookFor),
    alternative
      ? copy.fit.alternative(getSkill(alternative).label.toLowerCase())
      : null,
  ]
    .filter((sentence) => sentence !== null)
    .join(" ");
}
