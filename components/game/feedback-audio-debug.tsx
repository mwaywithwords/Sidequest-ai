"use client";

import { useSyncExternalStore } from "react";
import { previewFeedbackCue } from "@/components/game/feedback-audio";

function subscribeDebugAudio(): () => void {
  return () => {};
}

function debugAudioEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return (
    new URLSearchParams(window.location.search).get("debugFeedbackAudio") ===
    "1"
  );
}

/**
 * Development-only listen-through for answer feedback.
 *
 * Open any SIDEQUEST page with `?debugFeedbackAudio=1` while running
 * `next dev`. Production builds always render nothing.
 */
export function FeedbackAudioDebug() {
  const open = useSyncExternalStore(
    subscribeDebugAudio,
    debugAudioEnabled,
    () => false,
  );

  if (process.env.NODE_ENV === "production" || !open) return null;

  return (
    <div className="mx-auto mt-3 flex max-w-sm justify-center gap-2">
      <button
        type="button"
        className="rounded-full border border-cream/30 px-3 py-1 text-xs font-bold text-cream"
        onClick={() => previewFeedbackCue("success")}
      >
        Play success
      </button>
      <button
        type="button"
        className="rounded-full border border-cream/30 px-3 py-1 text-xs font-bold text-cream"
        onClick={() => previewFeedbackCue("try-again")}
      >
        Play incorrect
      </button>
      <button
        type="button"
        className="rounded-full border border-cream/30 px-3 py-1 text-xs font-bold text-cream"
        onClick={() => previewFeedbackCue("reveal")}
      >
        Play reveal
      </button>
    </div>
  );
}
