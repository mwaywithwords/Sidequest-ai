import type { ObjectAnalysis, UsedValue } from "@/lib/ai/schemas";
import {
  questionHasHypotheticalFraming,
  questionStatesNumber,
} from "@/lib/math/hypothetical";
import { normaliseUnit, unitFamily } from "@/lib/math/units";
import type { SkillId } from "@/lib/types";

export type ObjectMathWordingContext = {
  analysis: ObjectAnalysis;
  skillId: SkillId;
  fit: { challengeMode: string };
};

/**
 * Object_math student-facing wording helpers.
 *
 * Observed numbers stay exactly as declared. These helpers only add
 * attribution language, or rebuild a simple arithmetic question from
 * already-validated source values. They do not invent a second observed
 * object or change origins.
 */

const PHOTO_PHRASES = [
  "in your photo",
  "your photo",
  "the object",
  "you photographed",
  "photographed",
] as const;

const UNIT_WORDS: Record<string, readonly string[]> = {
  ml: ["ml", "millilitre", "milliliter", "millilitres", "milliliters"],
  l: ["l", "litre", "liter", "litres", "liters"],
  "fl oz": ["fl oz", "fl. oz", "floz", "fluid ounce", "fluid ounces"],
  g: ["g", "gram", "grams"],
  kg: ["kg", "kilogram", "kilograms"],
  cm: ["cm", "centimetre", "centimeter", "centimetres", "centimeters"],
  mm: ["mm"],
  in: ["in", "inch", "inches"],
  ft: ["ft", "foot", "feet"],
};

export function photographedObjectNoun(objectName: string): string {
  const tokens = objectNameTokens(objectName);
  return tokens.at(-1) ?? objectName.trim().toLowerCase();
}

export function questionRefersToPhotographedObject(
  question: string,
  analysis: ObjectAnalysis,
): boolean {
  const hay = question.toLowerCase();
  const name = analysis.objectName.toLowerCase().trim();

  if (name.length > 0 && hay.includes(name)) return true;

  const distinctive = objectNameTokens(name).filter((token) => token.length >= 4);
  if (distinctive.some((token) => hay.includes(token))) return true;

  if (PHOTO_PHRASES.some((phrase) => hay.includes(phrase))) return true;

  const noun = photographedObjectNoun(name);
  return noun.length >= 2 && citesObjectNoun(hay, noun);
}

export function questionStatesUsedValue(
  question: string,
  value: UsedValue,
): boolean {
  if (!questionStatesNumber(question, value.value)) return false;
  if (value.unit === undefined) return true;
  return questionStatesUnit(question, value.unit);
}

export function canRepairObjectMathWording(
  question: string,
  values: readonly UsedValue[],
  context: ObjectMathWordingContext,
): boolean {
  if (context.fit.challengeMode !== "object_math") return false;
  if (questionRefersToPhotographedObject(question, context.analysis)) {
    return false;
  }

  const observed = values.filter((value) => value.origin === "observed");
  if (observed.length === 0) return false;
  if (!observed.some((value) => questionStatesUsedValue(question, value))) {
    return false;
  }

  const given = values.filter((value) => value.origin === "given_in_problem");
  if (
    given.length > 0 &&
    !given.every((value) => questionStatesUsedValue(question, value))
  ) {
    return false;
  }

  return true;
}

export function repairObjectMathQuestion(
  question: string,
  values: readonly UsedValue[],
  context: ObjectMathWordingContext,
  maxLength: number,
  computationType: string,
): string | null {
  if (!canRepairObjectMathWording(question, values, context)) return null;

  const framed = questionHasHypotheticalFraming(question);
  if (!framed && canTemplateComputation(computationType, context.skillId)) {
    const templated = objectMathQuestionTemplate(
      context.skillId,
      values,
      context.analysis,
    );
    if (templated !== null && templated.length <= maxLength) {
      return templated;
    }
  }

  const attributed = attributeObservedValue(
    question,
    values,
    context.analysis,
    maxLength,
  );
  if (attributed === null) return null;
  if (!questionRefersToPhotographedObject(attributed, context.analysis)) {
    return null;
  }
  return attributed;
}

export function objectMathQuestionTemplate(
  skillId: SkillId,
  values: readonly UsedValue[],
  analysis: ObjectAnalysis,
): string | null {
  if (
    skillId !== "addition" &&
    skillId !== "subtraction" &&
    skillId !== "multiplication" &&
    skillId !== "division"
  ) {
    return null;
  }

  const observed = values.filter((value) => value.origin === "observed");
  const given = values.filter((value) => value.origin === "given_in_problem");
  if (observed.length !== 1 || given.length !== 1) return null;

  const object = photographedObjectNoun(analysis.objectName);
  const shown = formatQuantity(observed[0]!);
  const extra = formatQuantity(given[0]!);
  if (object.length === 0 || shown.length === 0 || extra.length === 0) {
    return null;
  }

  switch (skillId) {
    case "addition":
      return `The ${object} in your photo shows ${shown}. Suppose ${extra} more is added. What is the total?`;
    case "subtraction":
      return `The ${object} in your photo shows ${shown}. Suppose ${extra} is taken away. How much remains?`;
    case "multiplication":
      return `The ${object} in your photo shows ${shown}. Suppose you had ${extra} of them with the same amount. What is the total?`;
    case "division":
      return `The ${object} in your photo shows ${shown}. Suppose that amount is split into ${extra} equal groups. How much is in each group?`;
  }

  return null;
}

function canTemplateComputation(
  computationType: string,
  skillId: SkillId,
): boolean {
  if (
    skillId !== "addition" &&
    skillId !== "subtraction" &&
    skillId !== "multiplication" &&
    skillId !== "division"
  ) {
    return false;
  }

  return computationType === "arithmetic" || computationType === "division";
}

function attributeObservedValue(
  question: string,
  values: readonly UsedValue[],
  analysis: ObjectAnalysis,
  maxLength: number,
): string | null {
  const observed = values.find((value) => value.origin === "observed");
  if (observed === undefined) return null;
  if (!questionStatesUsedValue(question, observed)) return null;

  const object = photographedObjectNoun(analysis.objectName);
  const quantity = formatQuantity(observed);
  if (object.length === 0 || quantity.length === 0) return null;

  const verb = unitFamily(observed.unit) === "volume" ? "contains" : "shows";
  const prefix = `The ${object} in your photo ${verb} ${quantity}.`;
  const repaired = `${prefix} ${question.trim()}`;
  if (repaired.length > maxLength) return null;
  return repaired;
}

function formatQuantity(value: UsedValue): string {
  const amount = Number.isInteger(value.value)
    ? String(value.value)
    : String(value.value);
  return value.unit === undefined ? amount : `${amount} ${value.unit}`;
}

function objectNameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function citesObjectNoun(hay: string, noun: string): boolean {
  const pattern = new RegExp(
    `\\b(?:your|the|this|these)\\s+${escapeRegExp(noun)}s?\\b`,
    "i",
  );
  return pattern.test(hay);
}

function questionStatesUnit(question: string, unit: string): boolean {
  const hay = question.toLowerCase();
  const raw = unit.toLowerCase().trim();
  if (raw.length > 0 && hay.includes(raw)) return true;

  const folded = normaliseUnit(unit);
  const aliases = UNIT_WORDS[folded] ?? [folded];
  return aliases.some((alias) => hay.includes(alias));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
