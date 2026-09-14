"use client";

import {
  cueRecipe,
  shouldSkipCueDuringSpeech,
  type CueNote,
} from "@/lib/feedback-cues";
import { withAudioGuard, type FeedbackCue } from "@/lib/feedback-sound";

/**
 * Tiny in-house Web Audio cues. No files, no CDN, no sound library.
 *
 * Safari/iOS: call `primeFeedbackAudio()` inside the submit click before
 * any `await`, then `playFeedbackCue()` after the grade returns. That is
 * a user-gesture resume, not autoplay.
 */

let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;

  if (!audioContext) audioContext = new Ctor();
  return audioContext;
}

function readAloudIsSpeaking(): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return false;
  }
  return window.speechSynthesis.speaking || window.speechSynthesis.pending;
}

export function primeFeedbackAudio(): void {
  try {
    const ctx = getContext();
    if (ctx?.state === "suspended") void ctx.resume();
  } catch {
    // Missing Web Audio must never block grading.
  }
}

export function playFeedbackCue(cue: FeedbackCue): void {
  withAudioGuard(() => {
    if (shouldSkipCueDuringSpeech(cue) && readAloudIsSpeaking()) return;

    const ctx = getContext();
    if (!ctx) return;

    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime + 0.01;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.85, now);
    master.connect(ctx.destination);

    const brassBus = ctx.createBiquadFilter();
    brassBus.type = "lowpass";
    brassBus.frequency.setValueAtTime(3200, now);
    brassBus.Q.setValueAtTime(0.65, now);
    brassBus.connect(master);

    for (const note of cueRecipe(cue).notes) {
      voice(ctx, note, now, note.voice === "brass" ? brassBus : master);
    }
  });
}

function voice(
  ctx: AudioContext,
  note: CueNote,
  zero: number,
  dest: AudioNode,
) {
  const start = zero + note.at;
  if (note.voice === "brass") {
    ping(ctx, note.freq, start, note.dur, note.gain * 0.62, "sawtooth", dest);
    ping(ctx, note.freq * 2, start, note.dur, note.gain * 0.28, "triangle", dest);
    ping(ctx, note.freq * 3, start, note.dur, note.gain * 0.12, "sine", dest);
    return;
  }

  const type: OscillatorType = note.voice === "chime" ? "triangle" : "sine";
  ping(ctx, note.freq, start, note.dur, note.gain, type, dest);
  if (note.voice === "chime") {
    ping(ctx, note.freq * 2, start, note.dur, note.gain * 0.28, "sine", dest);
  }
}

function ping(
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  gain: number,
  type: OscillatorType,
  dest: AudioNode,
) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), start + 0.016);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp);
  amp.connect(dest);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}
