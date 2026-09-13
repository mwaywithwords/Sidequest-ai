"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { OptionTile } from "@/components/setup/option-tile";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy";
import { SKILLS, getSkill } from "@/lib/skills";
import { GRADES, type Grade, type SkillId } from "@/lib/types";

export function SetupFlow({
  initialGrade = null,
}: {
  /** Carried from a detour so the student does not have to pick their grade again. */
  initialGrade?: Grade | null;
}) {
  const router = useRouter();
  const [grade, setGrade] = useState<Grade | null>(initialGrade);
  const [skillId, setSkillId] = useState<SkillId | null>(null);

  const ready = grade !== null && skillId !== null;

  function launch() {
    if (!ready) return;
    router.push(`/scan?grade=${grade}&skill=${skillId}`);
  }

  return (
    <div className="flex flex-col">
      <fieldset className="border-0 p-0">
        <legend className="game-title">
          {copy.setup.gradeHeading}
        </legend>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {GRADES.map((option) => (
            <OptionTile
              key={option}
              variant="grade"
              mark={String(option)}
              label={`Grade ${option}`}
              accent="#c8ff4d"
              selected={grade === option}
              onSelect={() => setGrade(option)}
            />
          ))}
        </div>
      </fieldset>

      {grade === null ? (
        <p className="mt-4 text-center text-sm text-faint">{copy.setup.skillsLocked}</p>
      ) : (
        <fieldset className="mt-6 animate-rise border-0 p-0">
          <legend className="game-title">
            {copy.setup.skillHeading}
          </legend>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {SKILLS.map((skill, index) => (
              <div
                key={skill.id}
                className={
                  index === SKILLS.length - 1
                    ? "col-span-2 mx-auto w-[min(100%,11.75rem)]"
                    : undefined
                }
              >
                <OptionTile
                  variant="skill"
                  mark={skill.symbol}
                  label={skill.label}
                  accent={skill.accent}
                  selected={skillId === skill.id}
                  onSelect={() => setSkillId(skill.id)}
                />
              </div>
            ))}
          </div>
        </fieldset>
      )}

      <div className="game-cta-dock">
        <p className="mb-2 text-center text-sm font-bold text-muted">
          {ready && grade !== null && skillId !== null ? (
            <>
              Grade {grade} ·{" "}
              <span style={{ color: getSkill(skillId).accent }}>
                {getSkill(skillId).label}
              </span>
            </>
          ) : (
            copy.setup.nothingChosen
          )}
        </p>
        <Button size="lg" onClick={launch} disabled={!ready} className="w-full">
          {copy.setup.launch}
        </Button>
      </div>
    </div>
  );
}
