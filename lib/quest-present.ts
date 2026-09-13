import type { CorrectAnswer, UsedValue } from "@/lib/ai/schemas";
import { copy } from "@/lib/copy";
import { labelsForChoiceSet } from "@/lib/math/geometry-forms";
import type { DetourPresentation } from "@/lib/detour";
import type { ChallengeProgress } from "@/lib/progress/outcome";
import type { Grade, SkillId } from "@/lib/types";

/**
 * Student-facing shape of a ready Sidequest.
 *
 * Built on the server from trusted rows, then passed to a Client Component.
 * Deliberately narrower than a database row: the answer, the computation,
 * model names, origins, and skill codes stay behind the server boundary.
 */

export type QuestPhoto = {
  url: string;
  alt: string;
};

export type GroundedValueView = {
  label: string;
  display: string;
};

export type StudentAnswerInput =
  | { kind: "number"; unit: string | null }
  | { kind: "fraction"; unit: string | null }
  | { kind: "choice"; options: string[] }
  | { kind: "unsupported" };

export type StudentQuest = {
  questId: string;
  photo: QuestPhoto | null;
  objectName: string;
  objectNameSpoken: string;
  missionLabel: string;
  accent: string;
  discoveryTitle: string;
  discoveryText: string;
  connection: string;
  lookClosely: string | null;
  practiceLine: string;
  imaginedSituation: boolean;
  worldContext: boolean;
  highlightedValues: GroundedValueView[];
  question: string;
  hint: string | null;
  answer: StudentAnswerInput;
  progress: ChallengeProgress;
  scanHref: string;
  setupHref: string;
};

export type WorkingQuestView = {
  kind: "working";
  photo: QuestPhoto | null;
  accent: string;
  missionLabel: string;
  retryHref: string;
  scanHref: string;
};

export type RejectedQuestView = {
  kind: "rejected";
  detour: DetourPresentation;
  photo: QuestPhoto | null;
  accent: string;
  primaryHref: string;
  secondaryHref: string | null;
};

export type FailedQuestView = {
  kind: "failed";
  photo: QuestPhoto | null;
  accent: string;
  scanHref: string;
  setupHref: string;
};

export type QuestExperience =
  | { kind: "missing" }
  | WorkingQuestView
  | RejectedQuestView
  | FailedQuestView
  | { kind: "ready"; quest: StudentQuest };

export type PresentReadyQuestInput = {
  questId: string;
  objectName: string;
  photo: QuestPhoto | null;
  discoveryTitle: string;
  discoveryText: string;
  objectConnection: string;
  valuesUsed: readonly UsedValue[];
  challengeMode: "object_math" | "inspired_math" | "direct" | "grounded_scenario";
  inspirationTopic?: string | null;
  question: string;
  hint1: string | null;
  answer: CorrectAnswer;
  skillLabel: string;
  skillAccent: string;
  grade: Grade;
  skillId: SkillId;
  progress?: ChallengeProgress;
};

const FORBIDDEN_PAYLOAD_KEYS = [
  "correctAnswer",
  "correct_answer",
  "generation_metadata",
  "generationMetadata",
  "computation",
  "verificationStrategy",
  "verification_strategy",
  "confidence",
  "skillCode",
  "skill_code",
  "skillId",
  "challengeMode",
  "grounded_scenario",
  "object_math",
  "investigation_math",
  "inspired_math",
  "contextual",
  "given_in_problem",
  "observed",
  "student_provided",
] as const;

/**
 * Selects only the fields a student may see, and writes the connect-stage
 * sentences from trusted values rather than from anything the UI invents.
 */
export function presentStudentQuest(
  input: PresentReadyQuestInput,
): StudentQuest {
  const highlightedValues = groundedValuesForDisplay(input.valuesUsed);
  const primary = highlightedValues[0];
  const objectNameSpoken = spokenObjectName(input.objectName);
  const skillSpoken = input.skillLabel.toLowerCase();
  const inspired = input.challengeMode === "inspired_math";
  const topic = input.inspirationTopic?.trim() || objectNameSpoken;

  return {
    questId: input.questId,
    photo: input.photo,
    objectName: input.objectName,
    objectNameSpoken,
    missionLabel: `Grade ${input.grade} · ${input.skillLabel}`,
    accent: input.skillAccent,
    discoveryTitle: input.discoveryTitle,
    discoveryText: input.discoveryText,
    connection: input.objectConnection,
    lookClosely: inspired
      ? copy.quest.experience.inspiredTrail(objectNameSpoken, topic)
      : primary === undefined
        ? null
        : copy.quest.experience.lookClosely(objectNameSpoken, primary.display),
    practiceLine: inspired
      ? copy.quest.experience.inspiredPractice(skillSpoken)
      : copy.quest.experience.thatMeasurement(skillSpoken),
    imaginedSituation:
      inspired ||
      input.challengeMode === "grounded_scenario" ||
      (input.challengeMode === "object_math" &&
        input.valuesUsed.some((value) => value.origin === "given_in_problem")),
    worldContext: inspired,
    highlightedValues,
    question: input.question,
    hint: emptyToNull(input.hint1),
    answer: studentAnswerInput(input.answer),
    progress: input.progress ?? { status: "open" },
    scanHref: `/scan?grade=${input.grade}&skill=${input.skillId}`,
    setupHref: `/setup?grade=${input.grade}`,
  };
}

/**
 * Observed and student-given figures only. Hypothetical problem values stay
 * out of the highlight so the UI cannot present an invented property as if
 * it were on the object.
 */
export function groundedValuesForDisplay(
  values: readonly UsedValue[],
): GroundedValueView[] {
  return values.flatMap((value) => {
    if (value.origin !== "observed" && value.origin !== "student_provided") {
      return [];
    }

    const display = formatGroundedDisplay(value);
    const label = value.label.trim();
    if (display.length === 0 || label.length === 0) return [];

    return [{ label, display }];
  });
}

export function formatGroundedDisplay(value: UsedValue): string {
  if (!Number.isFinite(value.value)) return "";

  const amount = Number.isInteger(value.value)
    ? String(value.value)
    : String(value.value);
  const unit = value.unit?.trim();

  return unit ? `${amount} ${unit.toUpperCase()}` : amount;
}

export function studentAnswerInput(answer: CorrectAnswer): StudentAnswerInput {
  if (answer.type === "number") {
    return { kind: "number", unit: emptyToNull(answer.unit) };
  }

  if (answer.type === "fraction") {
    return { kind: "fraction", unit: emptyToNull(answer.unit) };
  }

  if (answer.type === "choice") {
    return {
      kind: "choice",
      options: [...labelsForChoiceSet(answer.set)],
    };
  }

  return { kind: "unsupported" };
}

/**
 * Walks a presentation object for keys or string values the browser must
 * never receive. Used by the check file so a later field cannot slip in.
 */
export function forbiddenStudentFields(payload: unknown): string[] {
  const found = new Set<string>();

  walk(payload, (key) => {
    if (
      FORBIDDEN_PAYLOAD_KEYS.includes(
        key as (typeof FORBIDDEN_PAYLOAD_KEYS)[number],
      )
    ) {
      found.add(key);
    }
  });

  return [...found].sort();
}

function spokenObjectName(name: string): string {
  return name.trim().toLowerCase() || "object";
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function walk(
  value: unknown,
  visit: (key: string, value: unknown) => void,
) {
  if (Array.isArray(value)) {
    for (const entry of value) walk(entry, visit);
    return;
  }

  if (value === null || typeof value !== "object") return;

  for (const [key, entry] of Object.entries(value)) {
    visit(key, entry);
    walk(entry, visit);
  }
}
