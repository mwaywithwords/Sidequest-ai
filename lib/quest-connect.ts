import type { Computation, CorrectAnswer } from "@/lib/ai/schemas";
import { copy } from "@/lib/copy";
import { getSkill } from "@/lib/skills";
import type { SkillId } from "@/lib/types";

/**
 * Connect-stage presentation helpers. Deterministic copy from values the
 * student payload already has. No model calls, no grounding changes.
 */

export const CONNECT_REVEAL_MS = {
  observation: 100,
  arrow: 300,
  skill: 450,
  sentence: 600,
} as const;

export type ConnectObservationKind =
  | "measurement"
  | "count"
  | "shape"
  | "object";

const COUNT_LABEL =
  /\b(count|items?|pieces?|cards?|books?|faces|edges|vertices|sides|steps|groups?)\b/i;

export function indefiniteArticle(word: string): "a" | "an" {
  const trimmed = word.trim().toLowerCase();
  if (trimmed.length === 0) return "a";
  return /^[aeiou]/.test(trimmed) ? "an" : "a";
}

export function connectSkillMark(skillId: SkillId): string {
  return getSkill(skillId).symbol;
}

export function connectSkillDisplay(symbol: string, label: string): string {
  const mark = symbol.trim();
  const name = label.trim();
  if (mark.length === 0) return name;
  if (name.length === 0) return mark;
  return `${mark} ${name}`;
}

/**
 * Shape names that can appear on Connect. Naming the answer of a
 * shape-identify challenge is not allowed.
 */
export function presentationSafeShape(
  computation: Computation,
  answer: CorrectAnswer,
): string | null {
  let shape: string | null = null;
  if (computation.type === "shape_count") shape = computation.shape;
  else if (computation.type === "geometry") shape = computation.shape;
  if (shape === null) return null;

  const trimmed = shape.trim();
  if (trimmed.length === 0) return null;
  if (answer.type === "choice" && answer.value === trimmed) return null;
  return trimmed;
}

export function connectObservationKind(input: {
  worldContext: boolean;
  numericDisplay: string | null;
  numericLabel: string | null;
  shapeName: string | null;
}): ConnectObservationKind {
  if (input.worldContext) return "object";
  if (input.numericDisplay !== null && input.numericDisplay.length > 0) {
    const hasUnitLetters = /[A-Za-z]/.test(input.numericDisplay);
    if (
      !hasUnitLetters &&
      input.numericLabel !== null &&
      COUNT_LABEL.test(input.numericLabel)
    ) {
      return "count";
    }
    return "measurement";
  }
  if (input.shapeName !== null && input.shapeName.length > 0) return "shape";
  return "object";
}

export function friendlyConnectValue(display: string): string {
  return display.replace(/[A-Za-z.]+/g, (unit) => unit.toLowerCase()).trim();
}

export function connectSentence(input: {
  kind: ConnectObservationKind;
  observation: string;
  skillLabel: string;
}): string | null {
  const skill = input.skillLabel.trim().toLowerCase();
  if (skill.length === 0) return null;

  if (input.kind === "measurement") {
    const value = friendlyConnectValue(input.observation);
    if (value.length === 0) return null;
    return copy.quest.experience.connectMeasurementLine(value, skill);
  }

  if (input.kind === "count") {
    const value = input.observation.trim();
    if (value.length === 0) return null;
    return copy.quest.experience.connectCountLine(value, skill);
  }

  if (input.kind === "shape") {
    const shape = input.observation.trim().toLowerCase();
    if (shape.length === 0) return null;
    return copy.quest.experience.connectShapeLine(shape, skill);
  }

  return copy.quest.experience.connectSkillLine(skill);
}
