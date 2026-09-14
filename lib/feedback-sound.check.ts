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
  peakGain,
  pcmPeak,
  renderCuePcm,
  shouldSkipCueDuringSpeech,
  shouldStopReadAloudForStatus,
  SUCCESS_MELODY,
} from "@/lib/feedback-cues";
import {
  feedbackCueForSubmission,
  parseSoundPreference,
  serializeSoundPreference,
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
  "correct stops read-aloud before the fanfare",
  shouldStopReadAloudForStatus("correct") === true &&
    shouldSkipCueDuringSpeech("success") === false,
);

check(
  "incorrect cue is skipped while read-aloud is speaking",
  shouldStopReadAloudForStatus("incorrect") === false &&
    shouldSkipCueDuringSpeech("try-again") === true,
);

check(
  "success melody is C E G high C",
  SUCCESS_MELODY.join(" ") === "C5 E5 G5 C6",
);

check(
  "success fanfare lasts between 0.6s and 1s",
  cueDuration("success") >= 0.6 && cueDuration("success") <= 1,
);

check(
  "incorrect cue is a short gentle pair",
  cueDuration("try-again") >= 0.2 && cueDuration("try-again") <= 0.35,
);

check(
  "success is substantially louder than incorrect",
  peakGain("success") > peakGain("try-again") * 2,
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

if (failed > 0) {
  console.error(`\n${failed} feedback-sound checks failed`);
  process.exit(1);
}

console.log("\nall feedback-sound checks passed");
