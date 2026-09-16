import {
  spokenMathExpression,
  type StudentMathExpression,
} from "@/lib/math/expression";
import {
  indefiniteArticle,
  type ConnectObservationKind,
} from "@/lib/quest-connect";

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

export type SpeechVoiceCandidate = {
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
};

export const SPEECH_NARRATION = {
  rate: 1.02,
  pitch: 1.08,
  volume: 1,
} as const;

export const DID_YOU_KNOW_SPOKEN = "Did you know?";

const ENHANCED_VOICE = /enhanced|premium|neural|natural|online/i;
const QUALITY_VOICE = /siri|google|microsoft|samsung|eloquence|premium|enhanced|neural|natural/i;
const NOVELTY_VOICE =
  /zarvox|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|albert|agnes|deranged|hysterical|princess|junior|kathy|pipe organ|grandma|grandpa|nicky compact|samantha compact/i;
const COMPACT_VOICE = /\bcompact\b/i;

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
 * Object Found / Discover. Reads the visible object name, one useful
 * grounded token, "Did you know?", and the educational fact. Hidden
 * ObjectAnalysis, confidence, and challenge data are never passed in.
 */
export function spokenDiscoverReadout(input: {
  objectName: string;
  discoveryText: string;
  observations?: readonly SpokenObservation[];
}): string {
  const name = spokenObjectHeading(input.objectName);
  const token = firstSpokenObservation(input.observations);
  const fact = formatSpokenProse(input.discoveryText);
  const leadIn = fact.length > 0 ? DID_YOU_KNOW_SPOKEN : "";

  return joinSpokenSentences(name, token, leadIn, fact);
}

export function preferSpeechVoice(
  voices: readonly SpeechVoiceCandidate[],
  preferredLang = "en-US",
): SpeechVoiceCandidate | null {
  if (voices.length === 0) return null;

  const locale = speechLocale(preferredLang).toLowerCase();
  let best: SpeechVoiceCandidate | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const voice of voices) {
    const score = scoreSpeechVoice(voice, locale);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }

  return best;
}

function speechLocale(lang: string): string {
  const trimmed = lang.trim();
  if (trimmed.length === 0 || trimmed === "en") return "en-US";
  return trimmed;
}

function scoreSpeechVoice(voice: SpeechVoiceCandidate, preferredLocale: string): number {
  const lang = voice.lang.trim().toLowerCase().replace("_", "-");
  const name = voice.name;
  let score = 0;

  if (NOVELTY_VOICE.test(name) || COMPACT_VOICE.test(name)) score -= 120;
  if (lang.startsWith("en")) score += 40;
  else score -= 40;

  if (lang === preferredLocale) score += 28;
  else if (lang.startsWith("en-us")) score += 22;
  else if (lang.startsWith("en")) score += 12;

  if (ENHANCED_VOICE.test(name)) score += 80;
  if (QUALITY_VOICE.test(name)) score += 36;
  if (voice.localService && lang.startsWith("en")) score += 18;
  if (voice.default && lang.startsWith("en")) score += 6;

  return score;
}

function firstSpokenObservation(
  observations: readonly SpokenObservation[] | undefined,
): string {
  const display = observations?.[0]?.display;
  if (!display) return "";
  return spokenObjectHeading(display);
}

/**
 * Connect. Speaks the meaning of the math reveal, not every UI label.
 * Hidden objectConnection, look-closely, and challenge copy are never
 * passed in.
 */
export function spokenConnectReadout(input: {
  observation: string;
  skill: string;
  kind: ConnectObservationKind;
}): string {
  const skill = input.skill.trim().toLowerCase();
  if (skill.length === 0) return "";

  const practice = `We can use it in ${indefiniteArticle(skill)} ${skill} challenge`;

  if (input.kind === "measurement") {
    const found = spokenObjectHeading(input.observation);
    if (found.length === 0) {
      return joinSpokenSentences(`We can practice ${skill}`);
    }
    return joinSpokenSentences(`We found ${found}`, practice);
  }

  if (input.kind === "count") {
    const found = spokenObjectHeading(input.observation);
    if (found.length === 0) {
      return joinSpokenSentences(`We can practice ${skill}`);
    }
    return joinSpokenSentences(
      `We found ${found}`,
      `We can use that in ${indefiniteArticle(skill)} ${skill} challenge`,
    );
  }

  if (input.kind === "shape") {
    const shape = spokenObjectHeading(input.observation).toLowerCase();
    if (shape.length === 0) {
      return joinSpokenSentences(`We can practice ${skill}`);
    }
    return joinSpokenSentences(
      `We found ${indefiniteArticle(shape)} ${shape}`,
      practice,
    );
  }

  return joinSpokenSentences(`We can practice ${skill}`);
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

function tidySpoken(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
