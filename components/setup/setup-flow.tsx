"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { OptionTile } from "@/components/setup/option-tile";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { ArrowRightIcon } from "@/components/ui/icons";
import { GRADE_BLURBS, SKILLS, getSkill } from "@/lib/skills";
import { GRADES, type Grade, type SkillId } from "@/lib/types";

export function SetupFlow() {
  const router = useRouter();
  const [grade, setGrade] = useState<Grade | null>(null);
  const [skillId, setSkillId] = useState<SkillId | null>(null);

  const ready = grade !== null && skillId !== null;

  function launch() {
    if (!ready) return;
    router.push(`/scan?grade=${grade}&skill=${skillId}`);
  }

  return (
    <div className="flex flex-col gap-10">
      <section>
        <SectionLabel>Step one · Your grade</SectionLabel>
        <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-cream sm:text-3xl">
          Which grade are you in?
        </h2>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {GRADES.map((option) => (
            <OptionTile
              key={option}
              mark={String(option)}
              label={`Grade ${option}`}
              blurb={GRADE_BLURBS[option]}
              accent="#c8ff4d"
              selected={grade === option}
              onSelect={() => setGrade(option)}
            />
          ))}
        </div>
      </section>

      {grade === null ? (
        <p className="rounded-tile bg-raised/50 px-4 py-6 text-center text-sm text-faint ring-1 ring-hair">
          Pick a grade to unlock your skills.
        </p>
      ) : (
        <section className="animate-rise">
          <SectionLabel>Step two · Your mission</SectionLabel>
          <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-cream sm:text-3xl">
            What are you working on?
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {SKILLS.map((skill) => (
              <OptionTile
                key={skill.id}
                mark={skill.symbol}
                label={skill.label}
                blurb={skill.blurb}
                accent={skill.accent}
                selected={skillId === skill.id}
                onSelect={() => setSkillId(skill.id)}
              />
            ))}
          </div>
        </section>
      )}

      <div className="sticky bottom-4 z-10">
        <div className="flex flex-col gap-3 rounded-card border border-hair bg-ink/90 p-4 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            {ready && grade !== null && skillId !== null ? (
              <>
                Grade {grade} ·{" "}
                <span style={{ color: getSkill(skillId).accent }}>
                  {getSkill(skillId).label}
                </span>
              </>
            ) : (
              "Choose a grade and a skill to begin."
            )}
          </p>
          <Button
            size="lg"
            onClick={launch}
            disabled={!ready}
            className="w-full sm:w-auto"
          >
            Find an object
            <ArrowRightIcon className="size-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
