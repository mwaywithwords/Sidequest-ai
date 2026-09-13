"use server";

import type { AnswerSubmission } from "@/lib/math/answer";
import type { GradeView } from "@/lib/progress/outcome";
import { gradeQuestAnswer } from "@/lib/quest-grade";

export async function submitQuestAnswer(input: {
  questId: unknown;
  answer: unknown;
  hintRevealed: unknown;
  responseTimeMs: unknown;
}): Promise<GradeView> {
  const questId = typeof input.questId === "string" ? input.questId : "";
  const answer = parseAnswer(input.answer);
  if (answer === null) {
    return { status: "invalid", reason: "malformed" };
  }

  return gradeQuestAnswer({
    questId,
    answer,
    hintRevealed: input.hintRevealed === true,
    responseTimeMs:
      typeof input.responseTimeMs === "number" ? input.responseTimeMs : 0,
  });
}

function parseAnswer(value: unknown): AnswerSubmission | null {
  if (value === null || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;

  if (record.kind === "number" && typeof record.value === "string") {
    return { kind: "number", value: record.value };
  }

  if (
    record.kind === "fraction" &&
    typeof record.numerator === "string" &&
    typeof record.denominator === "string"
  ) {
    return {
      kind: "fraction",
      numerator: record.numerator,
      denominator: record.denominator,
    };
  }

  return null;
}
