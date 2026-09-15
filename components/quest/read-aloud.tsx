"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { SpeakerIcon, StopIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";
import {
  preferSpeechVoice,
  reduceSpeechPlayback,
  SPEECH_NARRATION,
  type SpeechVoiceCandidate,
} from "@/lib/speech";

/**
 * Browser-only read-aloud. Uses `speechSynthesis` / SpeechSynthesisUtterance.
 * Never requests a microphone, never uses SpeechRecognition, and never
 * calls a server TTS endpoint.
 */

type SpeechEnd = () => void;

let generation = 0;
let queued: number | null = null;
let cachedVoices: SpeechSynthesisVoice[] = [];

function hasSpeechSynthesis(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance === "function"
  );
}

function clearQueuedSpeak() {
  if (queued !== null) {
    window.clearTimeout(queued);
    queued = null;
  }
}

function speechLocale(lang: string): string {
  const trimmed = lang.trim();
  if (trimmed.length === 0 || trimmed === "en") return "en-US";
  return trimmed;
}

function asVoiceCandidate(voice: SpeechSynthesisVoice): SpeechVoiceCandidate {
  return {
    name: voice.name,
    lang: voice.lang,
    localService: voice.localService,
    default: voice.default,
  };
}

function refreshVoices(): SpeechSynthesisVoice[] {
  if (!hasSpeechSynthesis()) return cachedVoices;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) cachedVoices = voices;
  return cachedVoices;
}

function voiceFor(lang: string): SpeechSynthesisVoice | undefined {
  const voices = refreshVoices();
  if (voices.length === 0) return undefined;

  const preferred = preferSpeechVoice(voices.map(asVoiceCandidate), lang);
  if (!preferred) return undefined;
  return (
    voices.find(
      (voice) =>
        voice.name === preferred.name &&
        voice.lang === preferred.lang,
    ) ?? voices.find((voice) => voice.name === preferred.name)
  );
}

function logSelectedVoice(voice: SpeechSynthesisVoice | undefined, lang: string) {
  if (process.env.NODE_ENV === "production") return;
  console.info("[speech]", {
    voice: voice?.name ?? "(browser default)",
    lang: voice?.lang ?? speechLocale(lang),
    rate: SPEECH_NARRATION.rate,
    pitch: SPEECH_NARRATION.pitch,
  });
}

function subscribeSpeechSupport(): () => void {
  return () => {};
}

function cancelSpeech() {
  generation += 1;
  clearQueuedSpeak();
  if (!hasSpeechSynthesis()) return;
  window.speechSynthesis.cancel();
}

function startSpeech(text: string, lang: string, onEnd: SpeechEnd) {
  if (!hasSpeechSynthesis()) return;

  const synth = window.speechSynthesis;
  const wasSpeaking = synth.speaking || synth.pending;
  cancelSpeech();

  const myGeneration = generation;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = speechLocale(lang);
  utterance.rate = SPEECH_NARRATION.rate;
  utterance.pitch = SPEECH_NARRATION.pitch;
  utterance.volume = SPEECH_NARRATION.volume;
  const voice = voiceFor(lang);
  if (voice) utterance.voice = voice;
  logSelectedVoice(voice, lang);

  const finish = () => {
    if (myGeneration !== generation) return;
    onEnd();
  };

  utterance.onend = finish;
  utterance.onerror = finish;

  const speakNow = () => {
    if (myGeneration !== generation) return;
    try {
      if (synth.paused) synth.resume();
      synth.speak(utterance);
    } catch {
      finish();
    }
  };

  // After cancel(), some iOS Safari versions drop a follow-up speak()
  // unless it is deferred. The first tap in a session stays synchronous
  // so the user gesture is not lost.
  if (wasSpeaking) {
    queued = window.setTimeout(speakNow, 60);
    return;
  }

  speakNow();
}

export function useReadAloud() {
  const supported = useSyncExternalStore(
    subscribeSpeechSupport,
    hasSpeechSynthesis,
    () => false,
  );
  const [playingId, setPlayingId] = useState<string | null>(null);
  const playingIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!supported) return;

    const warmVoices = () => {
      refreshVoices();
    };
    warmVoices();
    window.speechSynthesis.addEventListener("voiceschanged", warmVoices);

    const stopForNavigation = () => {
      cancelSpeech();
      playingIdRef.current = null;
      setPlayingId(null);
    };
    window.addEventListener("pagehide", stopForNavigation);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", warmVoices);
      window.removeEventListener("pagehide", stopForNavigation);
      cancelSpeech();
    };
  }, [supported]);

  const stop = useCallback(() => {
    cancelSpeech();
    playingIdRef.current = null;
    setPlayingId(null);
  }, []);

  const toggle = useCallback((id: string, text: string) => {
    if (!hasSpeechSynthesis()) return;

    const spoken = text.trim();
    if (spoken.length === 0) return;

    const next = reduceSpeechPlayback(
      { playingId: playingIdRef.current },
      { type: "toggle", id },
    );

    if (next.effect === "cancel") {
      stop();
      return;
    }

    if (next.effect !== "start" && next.effect !== "cancel-then-start") {
      return;
    }

    startSpeech(spoken, document.documentElement.lang || "en", () => {
      const ended = reduceSpeechPlayback(
        { playingId: playingIdRef.current },
        { type: "ended", id },
      );
      playingIdRef.current = ended.state.playingId;
      setPlayingId(ended.state.playingId);
    });
    playingIdRef.current = next.state.playingId;
    setPlayingId(next.state.playingId);
  }, [stop]);

  return { supported, playingId, toggle, stop };
}

export type ReadAloudControls = ReturnType<typeof useReadAloud>;

export function ReadAloudButton({
  id,
  text,
  name,
  playingId,
  supported,
  accent,
  className,
  onToggle,
}: {
  id: string;
  text: string;
  name: string;
  playingId: string | null;
  supported: boolean;
  accent?: string;
  className?: string;
  onToggle: (id: string, text: string) => void;
}) {
  if (!supported || text.trim().length === 0) return null;

  const playing = playingId === id;
  const label = playing ? copy.quest.experience.readAloudStopAria : name;

  return (
    <button
      type="button"
      className={cn("read-aloud", className)}
      data-playing={playing ? "true" : "false"}
      style={
        accent
          ? { ["--read-aloud-accent" as string]: accent }
          : undefined
      }
      aria-label={label}
      aria-pressed={playing}
      onClick={() => onToggle(id, text)}
    >
      {playing ? <StopIcon /> : <SpeakerIcon />}
      <span>
        {playing
          ? copy.quest.experience.readAloudStop
          : copy.quest.experience.readAloud}
      </span>
    </button>
  );
}
