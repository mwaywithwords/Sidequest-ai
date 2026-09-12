import { Card, SectionLabel } from "@/components/ui/card";
import { MeasurementChip } from "@/components/ui/chip";
import { SparkIcon } from "@/components/ui/icons";
import { copy } from "@/lib/copy";
import { getSkill } from "@/lib/skills";
import type { Grade, Quest } from "@/lib/types";

/**
 * The three beats of a sidequest: what the object is, what is interesting about
 * it, and which property connects it to the skill.
 */
export function QuestCard({ quest, grade }: { quest: Quest; grade: Grade }) {
  const skill = getSkill(quest.skillId);

  return (
    <div className="flex flex-col gap-4">
      <Card accent={skill.accent} className="p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <SectionLabel accent={skill.accent}>
            Grade {grade} · {skill.label}
          </SectionLabel>
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-faint">
            {copy.quest.objectFoundLabel}
          </span>
        </div>

        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-cream sm:text-4xl">
          {quest.objectName}
        </h1>
        <p className="mt-1.5 text-sm text-faint">{quest.objectCaption}</p>

        <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
          {quest.observed.map((property) => (
            <MeasurementChip
              key={property.label}
              label={property.label}
              value={property.value}
              source={property.source}
              accent={skill.accent}
            />
          ))}
        </div>
      </Card>

      <Card className="p-5 sm:p-7">
        <div className="flex items-center gap-2">
          <SparkIcon className="size-4 text-amber" />
          <SectionLabel>{copy.quest.discoverLabel}</SectionLabel>
        </div>
        <p className="mt-3 leading-relaxed text-cream/90">{quest.discovery}</p>
      </Card>

      <Card className="p-5 sm:p-7">
        <SectionLabel>{copy.quest.connectionLabel}</SectionLabel>
        <p className="mt-3 leading-relaxed text-cream/90">{quest.connection}</p>
      </Card>
    </div>
  );
}
