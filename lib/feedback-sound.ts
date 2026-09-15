import type { ChallengeProgress, StudentGradeView } from "@/lib/progress/outcome";

/**
 * Game feedback cues for answer states.
 *
 * This module decides *whether* a cue should play. It does not touch
 * grading, attempts, XP, or the Web Audio engine. Preference strings are
 * the only thing persisted, and only on the device.
 */

export const SOUND_PREFERENCE_KEY = "sidequest.sound";

export type FeedbackCue = "success" | "try-again" | "reveal";

export type FeedbackAudioEvent = "success" | "incorrect" | "reveal";

export type FeedbackPlaybackPlan = {
  event: FeedbackAudioEvent | null;
  attempted: boolean;
  resumeFirst: boolean;
  play: boolean;
};

export function cueAudioEvent(cue: FeedbackCue): FeedbackAudioEvent {
  if (cue === "try-again") return "incorrect";
  return cue;
}

/**
 * Whether a cue should actually be scheduled, and whether Safari needs
 * resume() first. A submission result plays even when the UI status did
 * not change (incorrect → incorrect).
 */
export function feedbackPlaybackPlan(input: {
  cue: FeedbackCue | null;
  contextState: string;
  soundEnabled: boolean;
}): FeedbackPlaybackPlan {
  const event = input.cue ? cueAudioEvent(input.cue) : null;

  if (!input.soundEnabled || input.cue === null) {
    return { event, attempted: false, resumeFirst: false, play: false };
  }

  if (input.contextState === "missing" || input.contextState === "closed") {
    return { event, attempted: true, resumeFirst: false, play: false };
  }

  const resumeFirst =
    input.contextState === "suspended" || input.contextState === "interrupted";

  return { event, attempted: true, resumeFirst, play: true };
}

const listeners = new Set<() => void>();
let memory: boolean | null = null;

export function parseSoundPreference(raw: string | null | undefined): boolean {
  return raw !== "off";
}

export function serializeSoundPreference(enabled: boolean): "on" | "off" {
  return enabled ? "on" : "off";
}

export function readStoredSoundPreference(): boolean {
  if (memory !== null) return memory;
  if (typeof window === "undefined") return true;

  try {
    return parseSoundPreference(
      window.localStorage.getItem(SOUND_PREFERENCE_KEY),
    );
  } catch {
    return true;
  }
}

export function writeStoredSoundPreference(enabled: boolean): void {
  memory = enabled;

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        SOUND_PREFERENCE_KEY,
        serializeSoundPreference(enabled),
      );
    } catch {
      // Private mode can refuse localStorage. Memory still holds the choice.
    }
  }

  for (const listener of listeners) listener();
}

export function subscribeSoundPreference(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);

  if (typeof window === "undefined") {
    return () => {
      listeners.delete(onStoreChange);
    };
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== SOUND_PREFERENCE_KEY) return;
    memory = parseSoundPreference(event.newValue);
    onStoreChange();
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function withAudioGuard(play: () => void): void {
  try {
    play();
  } catch {
    // Web Audio must never break grading or quest UI.
  }
}

export type AnswerFeedbackSkipReason =
  | "sound_disabled"
  | "duplicate_submission"
  | "no_grade_cue";

export type AnswerFeedbackPlan = {
  cue: FeedbackCue | null;
  event: FeedbackAudioEvent | null;
  play: boolean;
  nextPlayedKey: string | null;
  skipReason: AnswerFeedbackSkipReason | null;
};

/**
 * Stable identity for one server-backed submission.
 *
 * Attempt number is assigned by grading. Invalid / unavailable responses
 * have no attempt, so they cannot produce a cue key.
 */
export function submissionFeedbackKey(
  result: StudentGradeView,
): string | null {
  if (
    result.status === "incorrect" ||
    result.status === "correct" ||
    result.status === "complete"
  ) {
    return `${result.status}:${result.attemptNumber}`;
  }
  return null;
}

/**
 * Map an authoritative grade status onto a cue.
 *
 * This does not look at the previous React progress state. A second
 * incorrect attempt is still "incorrect" and still gets the try-again cue.
 */
export function feedbackCueForResult(input: {
  status: StudentGradeView["status"];
  enabled: boolean;
}): FeedbackCue | null {
  if (!input.enabled) return null;
  if (input.status === "correct") return "success";
  if (input.status === "incorrect") return "try-again";
  if (input.status === "complete") return "reveal";
  return null;
}

/**
 * One finished submission → at most one cue, keyed by the grade identity.
 *
 * Replay of the same attempt (React re-render, Strict Mode) is silent.
 * A later incorrect attempt has a new key, so it plays again.
 */
export function planAnswerFeedback(input: {
  result: StudentGradeView;
  soundEnabled: boolean;
  lastPlayedKey: string | null;
}): AnswerFeedbackPlan {
  const key = submissionFeedbackKey(input.result);

  if (key === null) {
    return {
      cue: null,
      event: null,
      play: false,
      nextPlayedKey: input.lastPlayedKey,
      skipReason: "no_grade_cue",
    };
  }

  if (key === input.lastPlayedKey) {
    return {
      cue: null,
      event: null,
      play: false,
      nextPlayedKey: input.lastPlayedKey,
      skipReason: "duplicate_submission",
    };
  }

  const cue = feedbackCueForResult({
    status: input.result.status,
    enabled: input.soundEnabled,
  });
  const event = cue ? cueAudioEvent(cue) : null;

  if (!input.soundEnabled || cue === null) {
    return {
      cue: null,
      event,
      play: false,
      nextPlayedKey: key,
      skipReason: "sound_disabled",
    };
  }

  return {
    cue,
    event,
    play: true,
    nextPlayedKey: key,
    skipReason: null,
  };
}

/**
 * One submitted grade view → at most one cue.
 *
 * Finished quests (refresh / returning to a solved Sidequest) stay silent.
 * The solution path after max attempts is never the success celebration.
 *
 * Live playback uses `planAnswerFeedback` so a second incorrect attempt
 * does not depend on a React status transition.
 */
export function feedbackCueForSubmission(input: {
  previousStatus: ChallengeProgress["status"];
  nextStatus: StudentGradeView["status"];
  enabled: boolean;
}): FeedbackCue | null {
  if (
    input.previousStatus === "correct" ||
    input.previousStatus === "complete"
  ) {
    return null;
  }

  return feedbackCueForResult({
    status: input.nextStatus,
    enabled: input.enabled,
  });
}
