import { copy } from "@/lib/copy";
import type { Skill } from "@/lib/types";

/**
 * Student-safe detour kinds.
 *
 * These are the only labels the browser is allowed to see. Internal pipeline
 * reasons — `adult_content`, `weapon`, `generation_failure` — are mapped to
 * one of these at the server boundary, so a Client Component never branches
 * on a moderation category or a model verdict.
 */
export const DETOUR_KINDS = [
  "unsafe",
  "person",
  "unknown",
  "poorFit",
  "retake",
  "insufficient",
  "wandered",
] as const;

export type DetourKind = (typeof DETOUR_KINDS)[number];

/**
 * What the upload helper carries across the wire. Already student-safe: a
 * kind, optional object-hunt suggestions, and whether another skill is on
 * offer. No reason codes, no scores, no alternative skill ids.
 */
export type DetourRequest = {
  kind: DetourKind;
  suggestions: string[];
  offerSkillChange: boolean;
};

/**
 * What the detour panel renders. Built here, not in JSX, so the component
 * never has to know why a quest stopped.
 */
export type DetourPresentation = {
  title: string;
  heading: string;
  message: string;
  lead: string;
  suggestions: string[];
};

/**
 * Maps a pipeline refusal reason onto a student-safe kind.
 *
 * Content and privacy refusals collapse into `unsafe`, so the UI has one
 * generic "everyday object" story and no way to name what was in the photo.
 * `person_focused` and `unusable_image` stay distinct because the next step
 * is different: point at a thing, or take a clearer shot.
 */
export function detourKindFromReason(reason: string): DetourKind {
  switch (reason) {
    case "person_focused":
      return "person";
    case "unusable_image":
      return "retake";
    case "unknown_object":
      return "unknown";
    case "poor_skill_fit":
      return "poorFit";
    case "insufficient_information":
      return "insufficient";
    case "generation_failure":
    case "invalid_math":
      return "wandered";
    default:
      return "unsafe";
  }
}

export function isDetourKind(value: unknown): value is DetourKind {
  return (
    typeof value === "string" &&
    (DETOUR_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Turns a request plus the current mission into the copy the panel shows.
 *
 * `skill` is only used for the poor-fit sentence, so the explanation can
 * name the mission without the panel knowing a skill id. Suggestions from
 * the request (already sanitised) win over the kind's defaults.
 */
export function presentDetour(
  request: DetourRequest,
  skill: Skill,
): DetourPresentation {
  const { message, fallback } = contentFor(request.kind, skill);

  const suggestions =
    request.suggestions.length > 0 ? request.suggestions : fallback;

  return {
    title: copy.detour.eyebrow,
    heading: copy.detour.heading,
    message,
    lead:
      request.kind === "retake" || request.kind === "unknown"
        ? copy.detour.tryPhoto
        : copy.detour.tryFinding,
    suggestions: [...suggestions],
  };
}

function contentFor(
  kind: DetourKind,
  skill: Skill,
): { message: string; fallback: readonly string[] } {
  switch (kind) {
    case "poorFit":
      return {
        message: copy.detour.poorFit.message(skill.label.toLowerCase()),
        fallback: copy.detour.poorFit.fallbackSuggestions,
      };
    case "unsafe":
      return { message: copy.detour.unsafe.message, fallback: copy.detour.unsafe.suggestions };
    case "person":
      return { message: copy.detour.person.message, fallback: copy.detour.person.suggestions };
    case "unknown":
      return { message: copy.detour.unknown.message, fallback: copy.detour.unknown.suggestions };
    case "retake":
      return { message: copy.detour.retake.message, fallback: copy.detour.retake.suggestions };
    case "insufficient":
      return {
        message: copy.detour.insufficient.message,
        fallback: copy.detour.insufficient.suggestions,
      };
    case "wandered":
      return {
        message: copy.detour.wandered.message,
        fallback: copy.detour.wandered.suggestions,
      };
  }
}

/** Drops empty or enormous lines so a model suggestion cannot become a wall of text. */
export function sanitiseSuggestions(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= 80)
    .slice(0, 6);
}
