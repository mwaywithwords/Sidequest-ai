import type { FeedbackCue } from "@/lib/feedback-sound";
import type { StudentGradeView } from "@/lib/progress/outcome";

/**
 * In-house musical recipes for answer feedback.
 *
 * Frequencies are equal-tempered A4=440. Gains stay modest for headphones.
 * Web Audio and the PCM preview share this so what we listen to is what
 * the game plays.
 */

export type CueVoice = "brass" | "chime" | "soft";

export type CueNote = {
  freq: number;
  at: number;
  dur: number;
  gain: number;
  voice: CueVoice;
};

export type CueRecipe = {
  duration: number;
  notes: readonly CueNote[];
};

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;
const C7 = 2093;
const E7 = 2637.02;
const G4 = 392.0;

export const SUCCESS_MELODY = ["C5", "E5", "G5", "C6"] as const;

export const CUE_RECIPES: Record<FeedbackCue, CueRecipe> = {
  success: {
    // ta-da-da-TAAAA + sparkle. Final C-major chord is the peak (~0.42s),
    // lined up with the +XP pop. About 0.86s total.
    duration: 0.86,
    notes: [
      { freq: C5, at: 0, dur: 0.12, gain: 0.1, voice: "brass" },
      { freq: E5, at: 0.1, dur: 0.12, gain: 0.11, voice: "brass" },
      { freq: G5, at: 0.2, dur: 0.14, gain: 0.12, voice: "brass" },
      { freq: C6, at: 0.42, dur: 0.36, gain: 0.158, voice: "brass" },
      { freq: G5, at: 0.42, dur: 0.3, gain: 0.062, voice: "brass" },
      { freq: E5, at: 0.42, dur: 0.3, gain: 0.055, voice: "brass" },
      { freq: C5, at: 0.42, dur: 0.3, gain: 0.048, voice: "brass" },
      { freq: C7, at: 0.7, dur: 0.12, gain: 0.034, voice: "chime" },
      { freq: E7, at: 0.74, dur: 0.09, gain: 0.026, voice: "chime" },
    ],
  },
  "try-again": {
    // Soft descending fifth: clearly audible on a phone, not a buzzer.
    // Previous recipe was G4/E4 sine at 0.028/0.022 for 0.28s — near silent.
    duration: 0.42,
    notes: [
      { freq: C5, at: 0, dur: 0.18, gain: 0.1, voice: "soft" },
      { freq: G4, at: 0.14, dur: 0.26, gain: 0.088, voice: "soft" },
    ],
  },
  reveal: {
    duration: 0.16,
    notes: [{ freq: G4, at: 0, dur: 0.14, gain: 0.055, voice: "soft" }],
  },
};

export function cueRecipe(cue: FeedbackCue): CueRecipe {
  return CUE_RECIPES[cue];
}

export function cueDuration(cue: FeedbackCue): number {
  return CUE_RECIPES[cue].duration;
}

export function peakGain(cue: FeedbackCue): number {
  return Math.max(...CUE_RECIPES[cue].notes.map((note) => note.gain));
}

export function shouldSkipCueDuringSpeech(cue: FeedbackCue): boolean {
  void cue;
  return false;
}

export function shouldStopReadAloudForStatus(
  nextStatus: StudentGradeView["status"],
): boolean {
  return (
    nextStatus === "correct" ||
    nextStatus === "complete" ||
    nextStatus === "incorrect"
  );
}

function triangle(phase: number): number {
  const t = phase - Math.floor(phase);
  return t < 0.5 ? 4 * t - 1 : 3 - 4 * t;
}

function wave(kind: CueVoice, phase: number): number {
  const t = phase - Math.floor(phase);
  if (kind === "soft") return triangle(phase);
  if (kind === "chime") {
    return (
      Math.sin(2 * Math.PI * t) * 0.7 +
      Math.sin(4 * Math.PI * t) * 0.22 +
      Math.sin(6 * Math.PI * t) * 0.08
    );
  }
  // Brass: saw-like fundamental plus octave/fifth harmonics.
  const saw =
    Math.sin(2 * Math.PI * t) +
    Math.sin(4 * Math.PI * t) / 2 +
    Math.sin(6 * Math.PI * t) / 3 +
    Math.sin(8 * Math.PI * t) / 4 +
    Math.sin(10 * Math.PI * t) / 5;
  const octave = Math.sin(4 * Math.PI * t);
  const fifth = Math.sin(6 * Math.PI * t);
  return saw * 0.64 + octave * 0.22 + fifth * 0.1;
}

function envelope(local: number, dur: number): number {
  const attack = Math.min(0.01, dur * 0.12);
  const release = Math.min(0.08, dur * 0.38);
  if (local < attack) return local / attack;
  if (local > dur - release) return Math.max(0, (dur - local) / release);
  return 1;
}

export function renderCuePcm(
  cue: FeedbackCue,
  sampleRate = 44100,
): Float32Array {
  const recipe = CUE_RECIPES[cue];
  const samples = Math.ceil(recipe.duration * sampleRate);
  const out = new Float32Array(samples);

  for (const note of recipe.notes) {
    const start = Math.floor(note.at * sampleRate);
    const length = Math.ceil(note.dur * sampleRate);
    for (let i = 0; i < length; i += 1) {
      const index = start + i;
      if (index >= samples) break;
      const local = i / sampleRate;
      const env = envelope(local, note.dur);
      const phase = (note.freq * i) / sampleRate;
      out[index] += wave(note.voice, phase) * note.gain * env;
    }
  }

  for (let i = 0; i < out.length; i += 1) {
    const sample = out[i] ?? 0;
    out[i] = Math.max(-0.9, Math.min(0.9, sample));
  }

  return out;
}

export function pcmPeak(samples: Float32Array): number {
  let peak = 0;
  for (const sample of samples) {
    const abs = Math.abs(sample);
    if (abs > peak) peak = abs;
  }
  return peak;
}
