/**
 * XP celebration presentation checks.
 *
 * Run with: npx tsx lib/feedback-celebration.check.ts
 *
 * These do not play audio, animate the DOM, or call a server. They confirm
 * when the visual burst may fire so a re-render or a completed refresh
 * cannot celebrate twice.
 */

import {
  celebrationForSubmission,
  hudXpAmountForProgress,
  xpCelebrationView,
} from "@/lib/feedback-celebration";
import { feedbackCueForSubmission } from "@/lib/feedback-sound";
import { resetHudXpView, setHudXpView, readHudXpView } from "@/lib/hud-xp-view";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

check(
  "first correct with awarded XP celebrates once",
  celebrationForSubmission({
    previousStatus: "open",
    nextStatus: "correct",
    xp: 10,
  }) === "victory",
);

check(
  "correct after a miss still celebrates",
  celebrationForSubmission({
    previousStatus: "incorrect",
    nextStatus: "correct",
    xp: 7,
  }) === "victory",
);

const firstCorrect = celebrationForSubmission({
  previousStatus: "open",
  nextStatus: "correct",
  xp: 10,
});
const rerender = celebrationForSubmission({
  previousStatus: "correct",
  nextStatus: "correct",
  xp: 10,
});
check(
  "correct + XP awarded triggers exactly once",
  firstCorrect === "victory" && rerender === null,
);

check(
  "correct + sound on still uses the fanfare cue",
  feedbackCueForSubmission({
    previousStatus: "open",
    nextStatus: "correct",
    enabled: true,
  }) === "success" &&
    celebrationForSubmission({
      previousStatus: "open",
      nextStatus: "correct",
      xp: 10,
    }) === "victory",
);

check(
  "correct + sound off still runs the visual celebration",
  feedbackCueForSubmission({
    previousStatus: "open",
    nextStatus: "correct",
    enabled: false,
  }) === null &&
    celebrationForSubmission({
      previousStatus: "open",
      nextStatus: "correct",
      xp: 10,
    }) === "victory",
);

check(
  "incorrect does not celebrate XP",
  celebrationForSubmission({
    previousStatus: "open",
    nextStatus: "incorrect",
    xp: 10,
  }) === null,
);

check(
  "second incorrect still does not celebrate XP",
  celebrationForSubmission({
    previousStatus: "incorrect",
    nextStatus: "incorrect",
  }) === null,
);

check(
  "solution reveal without a successful XP reward is not a victory",
  celebrationForSubmission({
    previousStatus: "incorrect",
    nextStatus: "complete",
    xp: 2,
  }) === null,
);

check(
  "completed challenge reload does not celebrate",
  celebrationForSubmission({
    previousStatus: "correct",
    nextStatus: "correct",
    xp: 10,
  }) === null &&
    celebrationForSubmission({
      previousStatus: "complete",
      nextStatus: "complete",
      xp: 2,
    }) === null,
);

check(
  "React re-render of an already-correct view is not a new celebration",
  celebrationForSubmission({
    previousStatus: "correct",
    nextStatus: "correct",
    xp: 10,
  }) === null,
);

check(
  "read-aloud state is not part of the celebration trigger",
  celebrationForSubmission({
    previousStatus: "open",
    nextStatus: "correct",
    xp: 10,
  }) === "victory",
);

const reduced = xpCelebrationView({
  celebrate: true,
  reducedMotion: true,
  xp: 10,
});
check(
  "reduced motion shows static XP and a HUD highlight",
  reduced.showBurst === true &&
    reduced.showParticles === false &&
    reduced.showTrumpet === false &&
    reduced.showFlight === false &&
    reduced.showHudPulse === true,
);

const live = xpCelebrationView({
  celebrate: true,
  reducedMotion: false,
  xp: 10,
});
check(
  "full-motion victory includes burst, particles, trumpet, flight, and HUD pulse",
  live.showBurst &&
    live.showParticles &&
    live.showTrumpet &&
    live.showFlight &&
    live.showHudPulse,
);

check(
  "incorrect view helper never shows particles",
  xpCelebrationView({
    celebrate: false,
    reducedMotion: false,
    xp: 0,
  }).showParticles === false,
);

check(
  "audio being disabled does not change the visual helper",
  xpCelebrationView({ celebrate: true, reducedMotion: false, xp: 10 })
    .showBurst === true,
);

check(
  "animation helper cannot invent XP",
  xpCelebrationView({ celebrate: true, reducedMotion: false, xp: 0 })
    .showBurst === false &&
    celebrationForSubmission({
      previousStatus: "open",
      nextStatus: "correct",
      xp: 0,
    }) === null,
);

resetHudXpView();
setHudXpView({ amount: 10, celebrate: true });
check(
  "HUD chip mirrors the awarded amount, not a second total",
  readHudXpView().amount === 10 && readHudXpView().celebrate === true,
);

setHudXpView({ amount: 10.9, celebrate: true });
check("HUD chip floors the authoritative amount", readHudXpView().amount === 10);

setHudXpView({ amount: 2, celebrate: false });
check(
  "reveal XP can show in the HUD without a victory pulse",
  readHudXpView().amount === 2 && readHudXpView().celebrate === false,
);

resetHudXpView();
check("HUD resets without keeping a shadow total", readHudXpView().amount === 0);

check(
  "HUD amount for a correct progress row is the stored xp",
  hudXpAmountForProgress({
    status: "correct",
    attemptNumber: 1,
    xp: 10,
    explanation: "Add the amounts.",
    revealedAnswer: "70",
  }) === 10,
);

check(
  "open progress has no HUD XP",
  hudXpAmountForProgress({ status: "open" }) === 0,
);

if (failed > 0) {
  console.error(`\n${failed} feedback-celebration checks failed`);
  process.exit(1);
}

console.log("\nall feedback-celebration checks passed");
