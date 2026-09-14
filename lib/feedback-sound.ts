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

/**
 * One submitted grade view → at most one cue.
 *
 * Finished quests (refresh / returning to a solved Sidequest) stay silent.
 * The solution path after max attempts is never the success celebration.
 */
export function feedbackCueForSubmission(input: {
  previousStatus: ChallengeProgress["status"];
  nextStatus: StudentGradeView["status"];
  enabled: boolean;
}): FeedbackCue | null {
  if (!input.enabled) return null;

  if (
    input.previousStatus === "correct" ||
    input.previousStatus === "complete"
  ) {
    return null;
  }

  if (input.nextStatus === "correct") return "success";
  if (input.nextStatus === "incorrect") return "try-again";
  if (input.nextStatus === "complete") return "reveal";
  return null;
}
