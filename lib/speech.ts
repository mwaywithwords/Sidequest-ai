import {
  spokenMathExpression,
  type StudentMathExpression,
} from "@/lib/math/expression";

/**
 * Child-readable speech for SIDEQUEST student-facing copy.
 *
 * Deterministic, limited to the computation types the math board already
 * knows plus a small unit/fraction map, and safe to run on the server.
 * The browser Speech Synthesis API lives in the quest UI, not here.
 */

const CARDINALS: Record<number, string> = {
  1: "one",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
  9: "nine",
  10: "ten",
  11: "eleven",
  12: "twelve",
};

const ORDINALS: Record<number, string> = {
  2: "half",
  3: "third",
  4: "fourth",
  5: "fifth",
  6: "sixth",
  8: "eighth",
  10: "tenth",
};

/**
 * Expand a unit only when it sits next to a number, so "in" the sentence
 * is never turned into "inches".
 */
const NUMBERED_UNITS: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?<=\d)\s*fl\.?\s*ozs?\b/gi, " fluid ounces"],
  [/(?<=\d)\s*millilitres?\b/gi, " milliliters"],
  [/(?<=\d)\s*mL\b/gi, " milliliters"],
  [/(?<=\d)\s*mls\b/gi, " milliliters"],
  [/(?<=\d)\s*centimetres?\b/gi, " centimeters"],
  [/(?<=\d)\s*cm\b/gi, " centimeters"],
  [/(?<=\d)\s*millimetres?\b/gi, " millimeters"],
  [/(?<=\d)\s*mm\b/gi, " millimeters"],
  [/(?<=\d)\s*kilograms?\b/gi, " kilograms"],
  [/(?<=\d)\s*kg\b/gi, " kilograms"],
  [/(?<=\d)\s*lbs?\b/gi, " pounds"],
  [/(?<=\d)\s*pounds?\b/gi, " pounds"],
  [/(?<=\d)\s*gallons?\b/gi, " gallons"],
  [/(?<=\d)\s*gal\b/gi, " gallons"],
  [/(?<=\d)\s*ounces?\b/gi, " ounces"],
  [/(?<=\d)\s*oz\b/gi, " ounces"],
  [/(?<=\d)\s*inches\b/gi, " inches"],
  [/(?<=\d)\s*in\b/gi, " inches"],
  [/(?<=\d)\s*feet\b/gi, " feet"],
  [/(?<=\d)\s*ft\b/gi, " feet"],
  [/(?<=\d)\s*grams?\b/gi, " grams"],
  [/(?<=\d)\s*g\b/gi, " grams"],
  [/(?<=\d)\s*litres?\b/gi, " liters"],
  [/(?<=\d)\s*liters?\b/gi, " liters"],
  [/(?<=\d)\s*L\b/g, " liters"],
];

export type SpokenObservation = {
  label: string;
  display: string;
};

export type SpeechPlaybackState = {
  playingId: string | null;
};

export type SpeechPlaybackAction =
  | { type: "toggle"; id: string }
  | { type: "stop" }
  | { type: "ended"; id: string };

export type SpeechPlaybackEffect = "start" | "cancel" | "cancel-then-start" | "none";

/**
 * Pure play/stop contract for the one browser speech queue.
 *
 * Autoplay is impossible here: nothing starts until a toggle arrives.
 * A second readout replaces the first instead of overlapping it.
 */
export function reduceSpeechPlayback(
  state: SpeechPlaybackState,
  action: SpeechPlaybackAction,
): { state: SpeechPlaybackState; effect: SpeechPlaybackEffect } {
  switch (action.type) {
    case "stop":
      return {
        state: { playingId: null },
        effect: state.playingId ? "cancel" : "none",
      };
    case "ended":
      if (state.playingId !== action.id) {
        return { state, effect: "none" };
      }
      return { state: { playingId: null }, effect: "none" };
    case "toggle":
      if (state.playingId === action.id) {
        return { state: { playingId: null }, effect: "cancel" };
      }
      if (state.playingId) {
        return {
          state: { playingId: action.id },
          effect: "cancel-then-start",
        };
      }
      return { state: { playingId: action.id }, effect: "start" };
  }
}

export function spokenChallengeReadout(input: {
  question: string;
  expression?: StudentMathExpression;
}): string {
  const question = formatSpokenProse(input.question);
  const expression = input.expression
    ? formatSpokenExpression(input.expression)
    : "";

  return joinSpoken(question, expression);
}

/**
 * Object Found / Discover. Reads the visible object name and discovery
 * copy. Collectible tokens are skipped when the description already
 * carries that observation, so the student does not hear the chips twice.
 */
export function spokenDiscoverReadout(input: {
  objectName: string;
  discoveryText: string;
  observations?: readonly SpokenObservation[];
}): string {
  const name = spokenObjectHeading(input.objectName);
  const discovery = formatSpokenProse(input.discoveryText);
  const body = joinSpokenSentences(name, discovery);

  if (discovery.length > 0) return body;

  const extras = (input.observations ?? [])
    .map((observation) => formatSpokenProse(observation.display))
    .filter((spoken) => spoken.length > 0 && !alreadySpoken(spoken, body));

  return joinSpokenSentences(body, ...extras);
}

/**
 * Math Found / Connect. Reads the visible connection, and the look-closely
 * or inspired-math trail only when that sentence is on screen.
 */
export function spokenConnectReadout(input: {
  connection: string;
  lookClosely?: string | null;
  lookCloselyVisible?: boolean;
}): string {
  const trail =
    input.lookCloselyVisible && input.lookClosely
      ? formatSpokenProse(input.lookClosely)
      : "";
  const connection = formatSpokenProse(input.connection);
  return joinSpokenSentences(trail, connection);
}

export function formatSpokenProse(text: string): string {
  return tidySpoken(
    speakNumberedUnits(speakNamedFractions(speakOperators(text, false))),
  );
}

export function formatSpokenExpression(
  expression: StudentMathExpression,
): string {
  const spoken = spokenMathExpression(expression);
  if (spoken.length === 0) return "";

  return tidySpoken(
    speakNumberedUnits(
      speakNamedFractions(
        speakOperators(spoken.replace(/\bunknown\b/g, "what"), true),
      ),
    ),
  );
}

function speakOperators(text: string, unknownAsWhat: boolean): string {
  let spoken = text;

  spoken = spoken.replace(/=\s*\?/g, " equals what");
  spoken = spoken.replaceAll("×", " times ");
  spoken = spoken.replaceAll("÷", " divided by ");
  spoken = spoken.replaceAll("−", " minus ");
  spoken = spoken.replace(/\s+\+\s+/g, " plus ");
  spoken = spoken.replace(/\s+=\s+/g, " equals ");
  spoken = spoken.replace(/\s+-\s+/g, " minus ");

  if (unknownAsWhat) {
    spoken = spoken.replace(/(^|\s)\?(?=\s|$)/g, "$1what");
  }

  return spoken;
}

function speakNamedFractions(text: string): string {
  return text
    .replace(/\b(\d+)\s+over\s+(\d+)\b/g, (_, numerator, denominator) => {
      return namedFraction(Number(numerator), Number(denominator));
    })
    .replace(/\b(\d+)\/(\d+)\b/g, (_, numerator, denominator) => {
      return namedFraction(Number(numerator), Number(denominator));
    });
}

function namedFraction(numerator: number, denominator: number): string {
  if (numerator === 1 && denominator === 2) return "one half";

  const nWord = CARDINALS[numerator];
  const dWord = ORDINALS[denominator];
  if (nWord === undefined || dWord === undefined) {
    return `${numerator} over ${denominator}`;
  }

  if (numerator === 1) return `${nWord} ${dWord}`;
  if (denominator === 2) return `${nWord} halves`;
  return `${nWord} ${dWord}s`;
}

function speakNumberedUnits(text: string): string {
  let spoken = text;
  for (const [pattern, replacement] of NUMBERED_UNITS) {
    spoken = spoken.replace(pattern, replacement);
  }
  return spoken;
}

function joinSpoken(question: string, expression: string): string {
  if (question.length === 0) return expression;
  if (expression.length === 0) return question;
  return `${question} ${expression}`;
}

function joinSpokenSentences(...parts: string[]): string {
  return parts
    .map((part) => tidySpoken(part))
    .filter((part) => part.length > 0)
    .map((part) => (/[.!?]$/.test(part) ? part : `${part}.`))
    .join(" ");
}

function spokenObjectHeading(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "";

  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  const normalised =
    letters.length > 0 && letters === letters.toUpperCase()
      ? `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1).toLowerCase()}`
      : trimmed;

  return formatSpokenProse(normalised);
}

function alreadySpoken(needle: string, haystack: string): boolean {
  const spokenNeedle = tidySpoken(needle).toLowerCase();
  const spokenHaystack = haystack.toLowerCase();
  if (spokenNeedle.length === 0) return true;
  if (spokenHaystack.includes(spokenNeedle)) return true;

  const compactNeedle = spokenNeedle.replace(/[^a-z0-9]+/g, "");
  const compactHaystack = spokenHaystack.replace(/[^a-z0-9]+/g, "");
  return compactNeedle.length > 0 && compactHaystack.includes(compactNeedle);
}

function tidySpoken(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
