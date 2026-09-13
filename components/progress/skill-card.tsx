import type { PresentedSkill } from "@/lib/progress/presentation";
import { getSkill } from "@/lib/skills";

/**
 * One skill on the explorer map. Practiced skills get a glanceable bar
 * and a percentage. Unexplored skills stay empty on purpose — 0% would
 * look like a failing grade.
 */
export function SkillCard({ skill }: { skill: PresentedSkill }) {
  const catalogue = getSkill(skill.skillId);
  const percent = skill.practiced ? (skill.masteryPercent ?? 0) : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="font-display text-4xl leading-none font-extrabold"
          style={{ color: catalogue.accent }}
        >
          {catalogue.symbol}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-extrabold tracking-wide text-cream uppercase">
            {catalogue.label}
          </p>
          {skill.practiced && skill.masteryPercent !== null ? (
            <p className="text-sm font-extrabold" style={{ color: catalogue.accent }}>
              {skill.masteryPercent}%
            </p>
          ) : null}
        </div>
      </div>

      {skill.practiced ? (
        <div
          className="skill-bar"
          role="progressbar"
          aria-label={`${catalogue.label} mastery, ${percent} percent`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${percent === 0 ? 0 : Math.max(percent, 8)}%`,
              background: catalogue.accent,
            }}
          />
        </div>
      ) : null}

      <p className={skill.practiced ? "text-sm text-muted" : "text-sm text-faint"}>
        {skill.status}
      </p>
    </div>
  );
}
