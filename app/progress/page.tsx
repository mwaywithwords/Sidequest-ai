import type { Metadata } from "next";
import { SkillCard } from "@/components/progress/skill-card";
import { StatTile } from "@/components/progress/stat-tile";
import { ButtonLink } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { ArrowRightIcon } from "@/components/ui/icons";
import { copy } from "@/lib/copy";
import { loadProgressSummary } from "@/lib/progress/summary";

export const metadata: Metadata = {
  title: "Your progress",
};

export default async function ProgressPage() {
  const progress = await loadProgressSummary();

  return (
    <div className="flex flex-col gap-10">
      <div>
        <SectionLabel>{copy.progress.eyebrow}</SectionLabel>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-cream sm:text-4xl">
          {progress.hasProgress
            ? copy.progress.heading
            : copy.progress.emptyHeading}
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
          {progress.hasProgress ? copy.progress.body : copy.progress.emptyBody}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile
          value={progress.explorerLevel}
          label={copy.progress.explorerStat}
          accent="#c8ff4d"
        />
        <StatTile
          value={progress.sidequestsCompleted}
          label={copy.progress.completedStat}
          accent="#57e2ff"
        />
        <StatTile
          value={progress.objectsDiscovered}
          label={copy.progress.discoveredStat}
          accent="#ffc94d"
        />
      </div>

      <section>
        <SectionLabel>{copy.progress.skillsLabel}</SectionLabel>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {progress.skills.map((skill) => (
            <SkillCard key={skill.skillId} skill={skill} />
          ))}
        </div>
      </section>

      <ButtonLink href="/setup" size="lg" className="w-full sm:w-auto">
        {progress.hasProgress
          ? copy.progress.nextCta
          : copy.progress.firstCta}
        <ArrowRightIcon className="size-5" />
      </ButtonLink>
    </div>
  );
}
