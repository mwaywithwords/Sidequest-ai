"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { ArrowRightIcon, CheckIcon, RetryIcon } from "@/components/ui/icons";
import { copy } from "@/lib/copy";
import { isAnswerCorrect } from "@/lib/mock-grade";
import type { Challenge, Grade, Skill } from "@/lib/types";

type Result = "unanswered" | "correct" | "incorrect";

export function AnswerForm({
  challenge,
  skill,
  grade,
}: {
  challenge: Challenge;
  skill: Skill;
  grade: Grade;
}) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<Result>("unanswered");
  const [misses, setMisses] = useState(0);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim()) return;

    if (isAnswerCorrect(value, challenge.expectedAnswer)) {
      setResult("correct");
      return;
    }

    setResult("incorrect");
    setMisses((count) => count + 1);
  }

  const solved = result === "correct";

  return (
    <Card accent={skill.accent} className="p-5 sm:p-7">
      <SectionLabel accent={skill.accent}>
        {copy.quest.challengeLabel}
      </SectionLabel>
      <p className="mt-3 text-lg leading-relaxed text-cream sm:text-xl">
        {challenge.prompt}
      </p>

      {solved ? (
        <div className="mt-6 animate-rise">
          <div
            className="flex items-center gap-2.5 rounded-tile px-4 py-3.5"
            style={{ background: `${skill.accent}1f` }}
          >
            <CheckIcon className="size-5" style={{ color: skill.accent }} />
            <p className="font-display text-lg font-bold tracking-tight text-cream">
              {copy.quest.correct(
                challenge.expectedAnswer,
                challenge.answerUnit,
              )}
            </p>
          </div>

          <div className="mt-5">
            <SectionLabel>{copy.quest.solutionLabel}</SectionLabel>
            <ol className="mt-3 space-y-2">
              {challenge.solutionSteps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm text-muted">
                  <span className="font-mono text-xs text-faint">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-mono">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <ButtonLink
              href={`/scan?grade=${grade}&skill=${skill.id}`}
              size="lg"
              className="w-full sm:flex-1"
            >
              Scan another object
              <ArrowRightIcon className="size-5" />
            </ButtonLink>
            <ButtonLink
              href="/setup"
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto"
            >
              Change mission
            </ButtonLink>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6">
          <label
            htmlFor="answer"
            className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-faint"
          >
            Your answer in {challenge.answerUnit}
          </label>

          <div className="mt-2.5 flex flex-col gap-3 sm:flex-row">
            <input
              id="answer"
              name="answer"
              inputMode="decimal"
              autoComplete="off"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setResult("unanswered");
              }}
              placeholder={`How many ${challenge.answerUnit}?`}
              className="min-h-14 w-full rounded-full bg-void/60 px-5 text-cream ring-1 ring-hair transition placeholder:text-faint focus:ring-2 focus:ring-lime focus:outline-none sm:flex-1"
            />
            <Button
              type="submit"
              size="lg"
              disabled={!value.trim()}
              className="w-full sm:w-auto"
            >
              Check it
            </Button>
          </div>

          {result === "incorrect" ? (
            <div className="mt-5 animate-rise rounded-tile bg-void/50 p-4 ring-1 ring-hair">
              <div className="flex items-center gap-2">
                <RetryIcon className="size-4 text-coral" />
                <p className="text-sm font-medium text-cream">
                  {copy.quest.incorrect}
                </p>
              </div>
              {misses >= 1 ? (
                <p className="mt-2.5 text-sm leading-relaxed text-muted">
                  <span className="text-amber">Hint: </span>
                  {challenge.hint}
                </p>
              ) : null}
              {misses >= 2 ? (
                <ol className="mt-3 space-y-1.5 border-t border-hair pt-3">
                  {challenge.solutionSteps.map((step) => (
                    <li key={step} className="font-mono text-xs text-muted">
                      {step}
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : null}
        </form>
      )}
    </Card>
  );
}
