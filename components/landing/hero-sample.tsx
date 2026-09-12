import { Card, SectionLabel } from "@/components/ui/card";
import { MeasurementChip } from "@/components/ui/chip";
import { FEATURED_QUEST } from "@/lib/mock-quests";
import { getSkill } from "@/lib/skills";

/**
 * A real example beats explaining the idea. Shows the featured mock quest as a
 * scanned-object card so a visitor sees the output before signing up for it.
 */
export function HeroSample() {
  const quest = FEATURED_QUEST;
  const skill = getSkill(quest.skillId);

  return (
    <Card accent={skill.accent} className="p-5 sm:p-6">
      <div className="viewfinder relative mb-5 flex h-36 items-center justify-center rounded-tile bg-void/60 ring-1 ring-hair sm:h-44">
        <div className="text-center">
          <p className="font-display text-2xl font-bold text-cream sm:text-3xl">
            {quest.objectName}
          </p>
          <p className="mt-1 text-xs text-faint">{quest.objectCaption}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
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

      <div className="mt-5">
        <SectionLabel accent={skill.accent}>
          Grade {quest.grade} · {skill.label}
        </SectionLabel>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {quest.challenge.prompt}
        </p>
      </div>
    </Card>
  );
}
