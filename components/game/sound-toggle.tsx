"use client";

import { useCallback, useSyncExternalStore } from "react";
import { SpeakerIcon, SpeakerOffIcon } from "@/components/ui/icons";
import { copy } from "@/lib/copy";
import {
  readStoredSoundPreference,
  subscribeSoundPreference,
  writeStoredSoundPreference,
} from "@/lib/feedback-sound";

export function useSoundPreference() {
  const enabled = useSyncExternalStore(
    subscribeSoundPreference,
    readStoredSoundPreference,
    () => true,
  );

  const setEnabled = useCallback((next: boolean) => {
    writeStoredSoundPreference(next);
  }, []);

  const toggle = useCallback(() => {
    setEnabled(!readStoredSoundPreference());
  }, [setEnabled]);

  return { enabled, setEnabled, toggle };
}

export function SoundToggle() {
  const { enabled, toggle } = useSoundPreference();

  return (
    <button
      type="button"
      className="game-profile"
      data-sound={enabled ? "on" : "off"}
      aria-pressed={enabled}
      aria-label={enabled ? copy.hud.soundOn : copy.hud.soundOff}
      onClick={toggle}
    >
      {enabled ? (
        <SpeakerIcon className="size-5" />
      ) : (
        <SpeakerOffIcon className="size-5" />
      )}
    </button>
  );
}
