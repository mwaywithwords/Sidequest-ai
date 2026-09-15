/**
 * Answer-feedback sound policy checks.
 *
 * Run with: npx tsx lib/feedback-sound.check.ts
 *
 * These do not play audio or call a server. They confirm when a cue is
 * allowed to fire so a re-render or a completed refresh cannot celebrate.
 */

import {
  cueDuration,
  cueRecipe,
  peakGain,
  pcmPeak,
  renderCuePcm,
  shouldSkipCueDuringSpeech,
  shouldStopReadAloudForStatus,
  SUCCESS_MELODY,
} from "@/lib/feedback-cues";
import {
  cueAudioEvent,
  feedbackCueForResult,
  feedbackCueForSubmission,
  feedbackPlaybackPlan,
  parseSoundPreference,
  planAnswerFeedback,
  serializeSoundPreference,
  submissionFeedbackKey,
  withAudioGuard,
} from "@/lib/feedback-sound";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

check("default preference is sound on", parseSoundPreference(null) === true);
check("on is stored as on", parseSoundPreference("on") === true);
check("off is stored as off", parseSoundPreference("off") === false);
check("unknown values stay on", parseSoundPreference("maybe") === true);
check(
  "preference serializes for localStorage",
  serializeSoundPreference(true) === "on" &&
    serializeSoundPreference(false) === "off",
);

check(
  "first correct submission plays success once",
  feedbackCueForSubmission({
    previousStatus: "open",
    nextStatus: "correct",
    enabled: true,
  }) === "success",
);

check(
  "incorrect plays a gentle try-again cue",
  feedbackCueForSubmission({
    previousStatus: "open",
    nextStatus: "incorrect",
    enabled: true,
  }) === "try-again",
);

check(
  "a second incorrect still plays try-again",
  feedbackCueForSubmission({
    previousStatus: "incorrect",
    nextStatus: "incorrect",
    enabled: true,
  }) === "try-again",
);

check(
  "correct after a miss still celebrates",
  feedbackCueForSubmission({
    previousStatus: "incorrect",
    nextStatus: "correct",
    enabled: true,
  }) === "success",
);

check(
  "solution reveal is not the success celebration",
  feedbackCueForSubmission({
    previousStatus: "incorrect",
    nextStatus: "complete",
    enabled: true,
  }) === "reveal",
);

check(
  "max-attempt complete from open is not success",
  feedbackCueForSubmission({
    previousStatus: "open",
    nextStatus: "complete",
    enabled: true,
  }) === "reveal",
);

check(
  "refreshing a correct challenge stays silent",
  feedbackCueForSubmission({
    previousStatus: "correct",
    nextStatus: "correct",
    enabled: true,
  }) === null,
);

check(
  "refreshing a revealed solution stays silent",
  feedbackCueForSubmission({
    previousStatus: "complete",
    nextStatus: "complete",
    enabled: true,
  }) === null,
);

check(
  "sound disabled plays nothing on correct",
  feedbackCueForSubmission({
    previousStatus: "open",
    nextStatus: "correct",
    enabled: false,
  }) === null,
);

check(
  "sound disabled plays nothing on incorrect",
  feedbackCueForSubmission({
    previousStatus: "open",
    nextStatus: "incorrect",
    enabled: false,
  }) === null,
);

check(
  "malformed answers do not play a grade cue",
  feedbackCueForSubmission({
    previousStatus: "open",
    nextStatus: "invalid",
    enabled: true,
  }) === null,
);

check(
  "unavailable grading stays silent",
  feedbackCueForSubmission({
    previousStatus: "open",
    nextStatus: "unavailable",
    enabled: true,
  }) === null,
);

check(
  "incorrect stops read-aloud so the gentle cue can play",
  shouldStopReadAloudForStatus("incorrect") === true &&
    shouldSkipCueDuringSpeech("try-again") === false,
);

check(
  "correct still stops read-aloud before the fanfare",
  shouldStopReadAloudForStatus("correct") === true &&
    shouldSkipCueDuringSpeech("success") === false,
);

check(
  "success melody is C E G high C",
  SUCCESS_MELODY.join(" ") === "C5 E5 G5 C6",
);

check(
  "success fanfare lasts between 0.6s and 1s",
  cueDuration("success") >= 0.6 && cueDuration("success") <= 1,
);

const successRecipe = cueRecipe("success");
const loudest = successRecipe.notes.reduce((best, note) =>
  note.gain > best.gain ? note : best,
);

check(
  "the final C-major chord is the loudest brass moment",
  Math.round(loudest.freq) === 1047 && loudest.at >= 0.35 && loudest.at <= 0.5,
);

check(
  "incorrect cue is a short gentle pair",
  cueDuration("try-again") >= 0.32 && cueDuration("try-again") <= 0.55,
);

check(
  "success stays the louder celebration",
  peakGain("success") > peakGain("try-again"),
);

check(
  "solution reveal is a tiny tick, not the fanfare",
  cueDuration("reveal") < 0.2 &&
    cueDuration("reveal") < cueDuration("success") / 3,
);

const successPcm = renderCuePcm("success");
const tryAgainPcm = renderCuePcm("try-again");

check(
  "rendered success has more energy than try-again",
  pcmPeak(successPcm) > pcmPeak(tryAgainPcm) * 1.4,
);

check(
  "rendered incorrect cue is well above the near-silent floor",
  pcmPeak(tryAgainPcm) >= 0.06,
);

check(
  "audio exceptions cannot escape the playback wrapper",
  (() => {
    let threw = false;
    try {
      withAudioGuard(() => {
        throw new Error("audio graph failed");
      });
    } catch {
      threw = true;
    }
    return threw === false;
  })(),
);

check(
  "incorrect submissions map to the incorrect diagnostic event",
  cueAudioEvent("try-again") === "incorrect" &&
    cueAudioEvent("success") === "success",
);

check(
  "a running context plays the cue without an extra resume",
  feedbackPlaybackPlan({
    cue: "success",
    contextState: "running",
    soundEnabled: true,
  }).play === true &&
    feedbackPlaybackPlan({
      cue: "success",
      contextState: "running",
      soundEnabled: true,
    }).resumeFirst === false,
);

check(
  "a suspended context resumes before scheduling",
  feedbackPlaybackPlan({
    cue: "try-again",
    contextState: "suspended",
    soundEnabled: true,
  }).resumeFirst === true &&
    feedbackPlaybackPlan({
      cue: "try-again",
      contextState: "suspended",
      soundEnabled: true,
    }).play === true,
);

check(
  "an interrupted Safari context also resumes first",
  feedbackPlaybackPlan({
    cue: "success",
    contextState: "interrupted",
    soundEnabled: true,
  }).resumeFirst === true,
);

check(
  "sound off never attempts playback",
  feedbackPlaybackPlan({
    cue: "success",
    contextState: "running",
    soundEnabled: false,
  }).attempted === false &&
    feedbackPlaybackPlan({
      cue: "success",
      contextState: "running",
      soundEnabled: false,
    }).play === false,
);

check(
  "a missing AudioContext cannot play",
  feedbackPlaybackPlan({
    cue: "try-again",
    contextState: "missing",
    soundEnabled: true,
  }).play === false &&
    feedbackPlaybackPlan({
      cue: "try-again",
      contextState: "missing",
      soundEnabled: true,
    }).attempted === true,
);

check(
  "duplicate React status is not required for a second incorrect cue",
  feedbackCueForSubmission({
    previousStatus: "incorrect",
    nextStatus: "incorrect",
    enabled: true,
  }) === "try-again",
);

const PREVIOUS_TRY_AGAIN_PEAK_GAIN = 0.028;
const tryAgainRecipe = cueRecipe("try-again");

check(
  "incorrect cue has non-zero gain",
  tryAgainRecipe.notes.every((note) => note.gain > 0) &&
    peakGain("try-again") > 0,
);

check(
  "incorrect cue has a meaningful duration",
  cueDuration("try-again") >= 0.32 &&
    tryAgainRecipe.notes.every((note) => note.dur >= 0.12),
);

check(
  "incorrect cue stays in an audible phone-speaker range",
  tryAgainRecipe.notes.every((note) => note.freq >= 300 && note.freq <= 1200),
);

check(
  "incorrect cue is substantially louder than the near-silent recipe",
  peakGain("try-again") >= PREVIOUS_TRY_AGAIN_PEAK_GAIN * 2.5,
);

check(
  "incorrect cue is a descending pair, not a buzzer",
  tryAgainRecipe.notes.length === 2 &&
    tryAgainRecipe.notes[0]!.freq > tryAgainRecipe.notes[1]!.freq &&
    tryAgainRecipe.notes.every((note) => note.voice === "soft"),
);

const incorrectAttempt1 = {
  status: "incorrect" as const,
  attemptNumber: 1,
  hint: "Look at the first amount.",
};
const incorrectAttempt2 = {
  status: "incorrect" as const,
  attemptNumber: 2,
  hint: "Split the total.",
};
const correctAttempt2 = {
  status: "correct" as const,
  attemptNumber: 2,
  xp: 7,
  explanation: "Subtract the leftover.",
  revealedAnswer: "7",
};
const revealedAttempt3 = {
  status: "complete" as const,
  attemptNumber: 3,
  xp: 2,
  explanation: "Subtract the leftover.",
  solution: "Subtract the leftover.",
  revealedAnswer: "7",
};
const correctAttempt1 = {
  status: "correct" as const,
  attemptNumber: 1,
  xp: 10,
  explanation: "Add the amounts.",
  revealedAnswer: "12",
};

check(
  "submission 1 incorrect plays exactly one incorrect cue",
  (() => {
    const first = planAnswerFeedback({
      result: incorrectAttempt1,
      soundEnabled: true,
      lastPlayedKey: null,
    });
    const replay = planAnswerFeedback({
      result: incorrectAttempt1,
      soundEnabled: true,
      lastPlayedKey: first.nextPlayedKey,
    });
    return (
      first.play === true &&
      first.event === "incorrect" &&
      first.cue === "try-again" &&
      replay.play === false &&
      replay.skipReason === "duplicate_submission"
    );
  })(),
);

check(
  "submission 2 still plays incorrect when the UI was already incorrect",
  (() => {
    const first = planAnswerFeedback({
      result: incorrectAttempt1,
      soundEnabled: true,
      lastPlayedKey: null,
    });
    const second = planAnswerFeedback({
      result: incorrectAttempt2,
      soundEnabled: true,
      lastPlayedKey: first.nextPlayedKey,
    });
    return (
      first.event === "incorrect" &&
      second.play === true &&
      second.event === "incorrect" &&
      second.cue === "try-again" &&
      second.nextPlayedKey !== first.nextPlayedKey
    );
  })(),
);

check(
  "incorrect then correct plays try-again then success",
  (() => {
    const miss = planAnswerFeedback({
      result: incorrectAttempt1,
      soundEnabled: true,
      lastPlayedKey: null,
    });
    const hit = planAnswerFeedback({
      result: correctAttempt2,
      soundEnabled: true,
      lastPlayedKey: miss.nextPlayedKey,
    });
    return miss.event === "incorrect" && hit.play === true && hit.event === "success";
  })(),
);

check(
  "final incorrect that reveals the solution plays reveal only",
  (() => {
    const second = planAnswerFeedback({
      result: incorrectAttempt2,
      soundEnabled: true,
      lastPlayedKey: "incorrect:1",
    });
    const revealed = planAnswerFeedback({
      result: revealedAttempt3,
      soundEnabled: true,
      lastPlayedKey: second.nextPlayedKey,
    });
    return (
      second.event === "incorrect" &&
      revealed.play === true &&
      revealed.event === "reveal" &&
      revealed.cue === "reveal"
    );
  })(),
);

check(
  "correct plays success only",
  (() => {
    const hit = planAnswerFeedback({
      result: correctAttempt1,
      soundEnabled: true,
      lastPlayedKey: null,
    });
    return hit.play === true && hit.event === "success" && hit.cue === "success";
  })(),
);

check(
  "rerender after incorrect does not play another cue",
  planAnswerFeedback({
    result: incorrectAttempt1,
    soundEnabled: true,
    lastPlayedKey: submissionFeedbackKey(incorrectAttempt1),
  }).play === false,
);

check(
  "a completed refresh has no live playback key until a new submission",
  feedbackCueForSubmission({
    previousStatus: "complete",
    nextStatus: "complete",
    enabled: true,
  }) === null &&
    feedbackCueForResult({ status: "complete", enabled: true }) === "reveal",
);

check(
  "sound disabled skips the incorrect cue",
  planAnswerFeedback({
    result: incorrectAttempt1,
    soundEnabled: false,
    lastPlayedKey: null,
  }).play === false &&
    planAnswerFeedback({
      result: incorrectAttempt1,
      soundEnabled: false,
      lastPlayedKey: null,
    }).skipReason === "sound_disabled",
);

check(
  "sound re-enabled plays the next submission",
  (() => {
    const muted = planAnswerFeedback({
      result: incorrectAttempt1,
      soundEnabled: false,
      lastPlayedKey: null,
    });
    const next = planAnswerFeedback({
      result: incorrectAttempt2,
      soundEnabled: true,
      lastPlayedKey: muted.nextPlayedKey,
    });
    return muted.play === false && next.play === true && next.event === "incorrect";
  })(),
);

check(
  "speech does not suppress an incorrect cue",
  shouldSkipCueDuringSpeech("try-again") === false &&
    shouldStopReadAloudForStatus("incorrect") === true &&
    planAnswerFeedback({
      result: incorrectAttempt1,
      soundEnabled: true,
      lastPlayedKey: null,
    }).play === true,
);

check(
  "a suspended AudioContext still plans to play incorrect",
  feedbackPlaybackPlan({
    cue: "try-again",
    contextState: "suspended",
    soundEnabled: true,
  }).play === true &&
    feedbackPlaybackPlan({
      cue: "try-again",
      contextState: "suspended",
      soundEnabled: true,
    }).resumeFirst === true,
);

check(
  "result mapping does not use a previous UI status",
  feedbackCueForResult({ status: "incorrect", enabled: true }) === "try-again" &&
    submissionFeedbackKey(incorrectAttempt1) === "incorrect:1" &&
    submissionFeedbackKey(incorrectAttempt2) === "incorrect:2",
);

if (failed > 0) {
  console.error(`\n${failed} feedback-sound checks failed`);
  process.exit(1);
}

console.log("\nall feedback-sound checks passed");
