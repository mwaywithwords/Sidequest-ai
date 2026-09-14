import type { ChallengeProgress, StudentGradeView } from "@/lib/progress/outcome";

/**
 * Visual XP celebration policy.
 *
 * This decides whether the correct-answer burst, particles, and HUD pulse
 * may run. It does not compute XP, grade answers, or persist anything.
 * The amount it displays is whatever the authoritative grade view already
 * carries.
 */

export type CelebrationKind = "victory";

export type XpCelebrationView = {
  showBurst: boolean;
  showParticles: boolean;
  showTrumpet: boolean;
  showFlight: boolean;
  showHudPulse: boolean;
};

function awardedXp(view: StudentGradeView | ChallengeProgress): number {
  if (view.status !== "correct" && view.status !== "complete") return 0;
  if (!Number.isFinite(view.xp) || view.xp <= 0) return 0;
  return Math.floor(view.xp);
}

/**
 * One newly earned correct answer → one victory celebration.
 *
 * Finished quests (refresh / returning to a solved Sidequest) stay still.
 * Solution reveal after max attempts is never the victory burst, even
 * when a small XP amount was stored for finishing.
 */
export function celebrationForSubmission(input: {
  previousStatus: ChallengeProgress["status"];
  nextStatus: StudentGradeView["status"];
  xp?: number | null;
}): CelebrationKind | null {
  if (
    input.previousStatus === "correct" ||
    input.previousStatus === "complete"
  ) {
    return null;
  }

  if (input.nextStatus !== "correct") return null;

  const xp = input.xp;
  if (xp === undefined || xp === null || !Number.isFinite(xp) || xp <= 0) {
    return null;
  }

  return "victory";
}

export function xpCelebrationView(input: {
  celebrate: boolean;
  reducedMotion: boolean;
  xp: number;
}): XpCelebrationView {
  const hasReward = Number.isFinite(input.xp) && input.xp > 0;
  if (!input.celebrate || !hasReward) {
    return {
      showBurst: hasReward,
      showParticles: false,
      showTrumpet: false,
      showFlight: false,
      showHudPulse: false,
    };
  }

  if (input.reducedMotion) {
    return {
      showBurst: true,
      showParticles: false,
      showTrumpet: false,
      showFlight: false,
      showHudPulse: true,
    };
  }

  return {
    showBurst: true,
    showParticles: true,
    showTrumpet: true,
    showFlight: true,
    showHudPulse: true,
  };
}

export function hudXpAmountForProgress(
  progress: ChallengeProgress,
): number {
  return awardedXp(progress);
}
