"use client";

import { cueDuration, cueRecipe, peakGain, type CueNote } from "@/lib/feedback-cues";
import {
  cueAudioEvent,
  feedbackPlaybackPlan,
  withAudioGuard,
  type FeedbackAudioEvent,
  type FeedbackCue,
} from "@/lib/feedback-sound";

/**
 * Tiny in-house Web Audio cues. No files, no CDN, no sound library.
 *
 * Safari/iOS: call `primeFeedbackAudio()` inside the submit click before
 * any `await`, then `playFeedbackCue()` after the grade returns. That is
 * a user-gesture unlock, not autoplay. Do not wait until after grading
 * to first create or resume the AudioContext.
 *
 * After scheduling a cue, do not immediately stop the keep-alive node.
 * A short quiet oscillator that starts 20ms later can be lost if the
 * only currently-playing source is stopped first.
 */

type WebkitAudioContext = {
  webkitAudioContext?: typeof AudioContext;
};

type FeedbackAudioLog = {
  stage: string;
  cue: FeedbackAudioEvent | null;
  contextState: string;
  soundEnabled?: boolean;
  reason?: string;
  startTime?: number;
  stopTime?: number;
  noteCount?: number;
  peakGain?: number;
  masterGain?: number;
};

let audioContext: AudioContext | null = null;
let keepAlive: { osc: OscillatorNode; gain: GainNode } | null = null;
let keepAliveGeneration = 0;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const Ctor =
    window.AudioContext ??
    (window as unknown as WebkitAudioContext).webkitAudioContext;
  if (!Ctor) return null;

  if (!audioContext) audioContext = new Ctor();
  return audioContext;
}

function contextState(ctx: AudioContext | null): string {
  if (!ctx) return "missing";
  return ctx.state;
}

function needsResume(state: string): boolean {
  return state === "suspended" || state === "interrupted";
}

function logFeedbackAudio(info: FeedbackAudioLog) {
  if (process.env.NODE_ENV === "production") return;
  console.info("[feedback-audio]", info);
}

function unlockContext(ctx: AudioContext): void {
  if (needsResume(ctx.state)) {
    void ctx.resume();
  }

  try {
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);
  } catch {
    // Unlock must never break grading.
  }
}

function stopKeepAlive() {
  if (!keepAlive) return;
  try {
    keepAlive.osc.stop();
  } catch {
    // Already stopped.
  }
  try {
    keepAlive.osc.disconnect();
    keepAlive.gain.disconnect();
  } catch {
    // Graph may already be gone.
  }
  keepAlive = null;
}

function startKeepAlive(ctx: AudioContext): void {
  stopKeepAlive();
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(20, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    keepAlive = { osc, gain };
  } catch {
    keepAlive = null;
  }
}

function releaseKeepAliveAfter(durationSec: number) {
  const token = ++keepAliveGeneration;
  const waitMs = Math.ceil((durationSec + 0.08) * 1000);
  window.setTimeout(() => {
    if (token !== keepAliveGeneration) return;
    stopKeepAlive();
  }, waitMs);
}

export function primeFeedbackAudio(): void {
  withAudioGuard(() => {
    const ctx = getContext();
    if (!ctx) return;
    unlockContext(ctx);
    startKeepAlive(ctx);
  });
}

export function releasePrimedFeedbackAudio(): void {
  keepAliveGeneration += 1;
  stopKeepAlive();
}

export function playFeedbackCue(
  cue: FeedbackCue,
  options: { soundEnabled?: boolean } = {},
): void {
  const soundEnabled = options.soundEnabled !== false;
  const event = cueAudioEvent(cue);

  withAudioGuard(() => {
    const ctx = getContext();
    const state = contextState(ctx);
    const plan = feedbackPlaybackPlan({
      cue,
      contextState: state,
      soundEnabled,
    });

    logFeedbackAudio({
      stage: "play_requested",
      cue: event,
      contextState: state,
      soundEnabled,
    });

    if (!plan.attempted || !plan.play || !ctx) {
      releasePrimedFeedbackAudio();
      logFeedbackAudio({
        stage: "skipped",
        cue: event,
        contextState: state,
        soundEnabled,
        reason: !soundEnabled
          ? "sound_disabled"
          : !ctx
            ? "missing_context"
            : "playback_plan",
      });
      return;
    }

    const schedule = () => {
      const scheduled = scheduleCue(ctx, cue);
      releaseKeepAliveAfter(cueDuration(cue));
      logFeedbackAudio({
        stage: "oscillator_scheduled",
        cue: event,
        contextState: ctx.state,
        startTime: scheduled.startTime,
        stopTime: scheduled.stopTime,
        noteCount: scheduled.noteCount,
        peakGain: scheduled.peakGain,
        masterGain: scheduled.masterGain,
      });
    };

    if (needsResume(ctx.state)) {
      logFeedbackAudio({
        stage: "resume",
        cue: event,
        contextState: ctx.state,
      });
      void ctx
        .resume()
        .then(schedule)
        .catch(() => {
          releasePrimedFeedbackAudio();
          logFeedbackAudio({
            stage: "skipped",
            cue: event,
            contextState: ctx.state,
            reason: "resume_failed",
          });
        });
      return;
    }

    schedule();
  });
}

function scheduleCue(ctx: AudioContext, cue: FeedbackCue) {
  const recipe = cueRecipe(cue);
  const now = ctx.currentTime + 0.02;
  const masterGain = 0.85;
  const master = ctx.createGain();
  master.gain.setValueAtTime(masterGain, now);
  master.connect(ctx.destination);

  const brassBus = ctx.createBiquadFilter();
  brassBus.type = "lowpass";
  brassBus.frequency.setValueAtTime(3800, now);
  brassBus.Q.setValueAtTime(0.55, now);
  brassBus.connect(master);

  for (const note of recipe.notes) {
    voice(ctx, note, now, note.voice === "brass" ? brassBus : master);
  }

  const lastEnd = recipe.notes.reduce(
    (end, note) => Math.max(end, note.at + note.dur),
    0,
  );

  return {
    startTime: now,
    stopTime: now + lastEnd,
    noteCount: recipe.notes.length,
    peakGain: peakGain(cue),
    masterGain,
  };
}

function voice(
  ctx: AudioContext,
  note: CueNote,
  zero: number,
  dest: AudioNode,
) {
  const start = zero + note.at;
  if (note.voice === "brass") {
    ping(ctx, note.freq, start, note.dur, note.gain * 0.7, "sawtooth", dest, 0.008);
    ping(
      ctx,
      note.freq * 2,
      start,
      note.dur,
      note.gain * 0.3,
      "triangle",
      dest,
      0.01,
    );
    ping(ctx, note.freq * 3, start, note.dur, note.gain * 0.14, "sine", dest, 0.012);
    return;
  }

  ping(ctx, note.freq, start, note.dur, note.gain, "triangle", dest);
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
  attack = 0.016,
) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(
    Math.max(gain, 0.0002),
    start + attack,
  );
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp);
  amp.connect(dest);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function previewCue(cue: FeedbackCue): void {
  primeFeedbackAudio();
  playFeedbackCue(cue, { soundEnabled: true });
}

export function previewFeedbackCue(cue: FeedbackCue): void {
  if (process.env.NODE_ENV === "production") return;
  previewCue(cue);
}

type FeedbackAudioPreview = {
  playSuccess: () => void;
  playIncorrect: () => void;
  playReveal: () => void;
};

declare global {
  interface Window {
    __SIDEQUEST_FEEDBACK_AUDIO__?: FeedbackAudioPreview;
  }
}

function installFeedbackAudioPreview() {
  if (process.env.NODE_ENV === "production") return;
  if (typeof window === "undefined") return;

  window.__SIDEQUEST_FEEDBACK_AUDIO__ = {
    playSuccess: () => previewCue("success"),
    playIncorrect: () => previewCue("try-again"),
    playReveal: () => previewCue("reveal"),
  };
}

installFeedbackAudioPreview();
