import type { Metadata } from "next";
import Link from "next/link";
import { SkillRow } from "@/components/progress/skill-row";
import { StatTile } from "@/components/progress/stat-tile";
import { ButtonLink } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Pill } from "@/components/ui/chip";
import { ArrowRightIcon, CheckIcon } from "@/components/ui/icons";
import { copy } from "@/lib/copy";
import { MOCK_PROGRESS } from "@/lib/mock-progress";
import { getSkill } from "@/lib/skills";

export const metadata: Metadata = {
  title: "Your progress",
};

export default function ProgressPage() {
  const { questsSolved, objectsScanned, dayStreak, skills, recent } =
    MOCK_PROGRESS;

  return (
    <div className="flex flex-col gap-10">
      <div>
        <SectionLabel>{copy.progress.eyebrow}</SectionLabel>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-cream sm:text-4xl">
          {copy.progress.heading}
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
          {copy.progress.body}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile
          value={questsSolved}
          label={copy.progress.solvedStat}
          accent="#c8ff4d"
        />
        <StatTile
          value={objectsScanned}
          label={copy.progress.scannedStat}
          accent="#57e2ff"
        />
        <StatTile
          value={dayStreak}
          label={copy.progress.streakStat}
          accent="#ffc94d"
        />
      </div>

      <section>
        <SectionLabel>{copy.progress.skillsLabel}</SectionLabel>
        <Card className="mt-4 divide-y divide-hair px-5 py-2 sm:px-7">
          {skills.map((progress) => (
            <SkillRow key={progress.skillId} progress={progress} />
          ))}
        </Card>
      </section>

      <section>
        <SectionLabel>{copy.progress.recentLabel}</SectionLabel>
        <div className="mt-4 flex flex-col gap-2.5">
          {recent.map((entry) => {
            const skill = getSkill(entry.skillId);
            return (
              <Link
                key={`${entry.id}-${entry.when}`}
                href={`/quest/${entry.id}`}
                className="group flex items-center justify-between gap-4 rounded-tile bg-raised/60 px-4 py-4 ring-1 ring-hair transition hover:bg-hover hover:ring-hair-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
              >
                <div className="flex min-w-0 items-center gap-3.5">
                  <span
                    aria-hidden
                    className="w-5 shrink-0 text-center font-mono"
                    style={{ color: skill.accent }}
                  >
                    {skill.symbol}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-cream">
                      {entry.objectName}
                    </p>
                    <p className="text-xs text-faint">
                      {skill.label} · {entry.when}
                    </p>
                  </div>
                </div>

                {entry.solved ? (
                  <Pill accent="#c8ff4d" className="shrink-0">
                    <CheckIcon className="size-3.5" />
                    Solved
                  </Pill>
                ) : (
                  <Pill className="shrink-0 text-muted">Unfinished</Pill>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <Card className="p-5 sm:p-7">
        <SectionLabel>{copy.progress.comingNextLabel}</SectionLabel>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {copy.progress.comingNextBody}
        </p>
        <ButtonLink href="/setup" size="lg" className="mt-6">
          Start a sidequest
          <ArrowRightIcon className="size-5" />
        </ButtonLink>
      </Card>
    </div>
  );
}
