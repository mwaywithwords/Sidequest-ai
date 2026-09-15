import type { Metadata } from "next";
import { SkillCard } from "@/components/progress/skill-card";
import { StatTile } from "@/components/progress/stat-tile";
import { ButtonLink } from "@/components/ui/button";
import { copy } from "@/lib/copy";
import { loadProgressSummary } from "@/lib/progress/summary";

export const metadata: Metadata = {
  title: "Your progress",
};

export default async function ProgressPage() {
  const progress = await loadProgressSummary();

  return (
    <div className="game-page">
      <div className="text-center">
        <h1 className="game-title uppercase">{copy.progress.heading}</h1>
        <p className="mt-2 font-display text-2xl font-extrabold text-lime-ink">
          {copy.progress.explorerStat} {progress.explorerLevel}
        </p>
        {!progress.hasProgress ? (
          <p className="mx-auto mt-3 game-support">{copy.progress.emptyBody}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <StatTile
          value={progress.totalXp}
          label={copy.progress.xpStat}
          accent="#c8ff4d"
          mark="⚡"
        />
        <StatTile
          value={progress.sidequestsCompleted}
          label={copy.progress.completedStat}
          accent="#ffc94d"
          mark="🧭"
        />
        <StatTile
          value={progress.objectsDiscovered}
          label={copy.progress.discoveredStat}
          accent="#57e2ff"
          mark="🔎"
        />
      </div>

      <p className="mx-auto game-support text-center">
        {copy.progress.keepExploring}
      </p>

      <section>
        <h2 className="game-moment text-cream">
          {copy.progress.skillsLabel}
        </h2>
        <div className="mt-4 flex flex-col gap-4">
          {progress.skills.map((skill) => (
            <SkillCard key={skill.skillId} skill={skill} />
          ))}
        </div>
      </section>

      <div className="game-actions">
        <ButtonLink href="/setup" size="lg" className="w-full">
          {progress.hasProgress
            ? copy.progress.nextCta
            : copy.progress.firstCta}
        </ButtonLink>
      </div>
    </div>
  );
}
