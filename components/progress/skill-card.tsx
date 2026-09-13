import { Card } from "@/components/ui/card";
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
    <Card accent={catalogue.accent} className="p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="font-display text-2xl font-bold leading-none"
          style={{ color: catalogue.accent }}
        >
          {catalogue.symbol}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold tracking-tight text-cream">
            {catalogue.label}
          </p>
          {skill.practiced && skill.masteryPercent !== null ? (
            <p
              className="mt-0.5 font-mono text-sm"
              style={{ color: catalogue.accent }}
            >
              {skill.masteryPercent}%
            </p>
          ) : null}
        </div>
      </div>

      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-void/70 ring-1 ring-hair"
        {...(skill.practiced
          ? {
              role: "progressbar" as const,
              "aria-label": `${catalogue.label} mastery`,
              "aria-valuemin": 0,
              "aria-valuemax": 100,
              "aria-valuenow": percent,
            }
          : { "aria-hidden": true })}
      >
        {skill.practiced ? (
          <div
            className="h-full rounded-full"
            style={{
              width: `${percent}%`,
              background: catalogue.accent,
            }}
          />
        ) : null}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-muted">{skill.status}</p>
    </Card>
  );
}
