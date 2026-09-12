import { getSkill } from "@/lib/skills";
import type { SkillProgress } from "@/lib/types";

/**
 * One skill's accuracy. The bar is deliberately not a percentage readout: the
 * point is a glanceable sense of "solid here, shaky there".
 */
export function SkillRow({ progress }: { progress: SkillProgress }) {
  const skill = getSkill(progress.skillId);
  const untouched = progress.attempted === 0;
  const share = untouched ? 0 : progress.correct / progress.attempted;

  return (
    <div className="flex items-center gap-4 py-3.5">
      <span
        aria-hidden
        className="w-6 shrink-0 text-center font-mono text-base"
        style={{ color: skill.accent }}
      >
        {skill.symbol}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-medium text-cream">
            {skill.label}
          </p>
          <p className="shrink-0 font-mono text-xs text-faint">
            {untouched
              ? "not tried yet"
              : `${progress.correct} of ${progress.attempted}`}
          </p>
        </div>

        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-hair">
          <div
            className="h-full rounded-full transition-[width]"
            style={{
              width: `${Math.round(share * 100)}%`,
              background: skill.accent,
            }}
          />
        </div>
      </div>
    </div>
  );
}
