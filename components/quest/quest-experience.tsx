"use client";

import { useState } from "react";
import { QuestPhotoFrame } from "@/components/quest/quest-photo";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { ArrowRightIcon, SparkIcon } from "@/components/ui/icons";
import { copy } from "@/lib/copy";
import type { StudentQuest } from "@/lib/quest-present";

type Stage = "discover" | "connect" | "challenge";

/**
 * The three-beat reveal. Receives a shaped presentation only — never a
 * database row — and keeps stage + answer entry on the client.
 */
export function QuestExperience({ quest }: { quest: StudentQuest }) {
  const [stage, setStage] = useState<Stage>("discover");

  return (
    <div className="flex flex-col gap-6">
      {quest.missionLabel ? (
        <SectionLabel accent={quest.accent}>{quest.missionLabel}</SectionLabel>
      ) : null}

      {stage === "discover" ? (
        <DiscoverStage quest={quest} onContinue={() => setStage("connect")} />
      ) : null}
      {stage === "connect" ? (
        <ConnectStage quest={quest} onContinue={() => setStage("challenge")} />
      ) : null}
      {stage === "challenge" ? <ChallengeStage quest={quest} /> : null}
    </div>
  );
}

function DiscoverStage({
  quest,
  onContinue,
}: {
  quest: StudentQuest;
  onContinue: () => void;
}) {
  return (
    <div key="discover" className="flex flex-col gap-6 animate-rise">
      <QuestPhotoFrame photo={quest.photo} accent={quest.accent} size="hero" />

      <div>
        <div className="flex items-center gap-2">
          <SparkIcon className="size-4 text-amber" />
          <SectionLabel>{copy.quest.experience.discoverEyebrow}</SectionLabel>
        </div>
        <p className="mt-3 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-faint">
          {copy.quest.objectFoundLabel}
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-cream sm:text-4xl">
          {quest.objectName}
        </h1>
        <h2 className="mt-5 font-display text-xl font-bold tracking-tight text-cream sm:text-2xl">
          {quest.discoveryTitle}
        </h2>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-cream/90 sm:text-lg">
          {quest.discoveryText}
        </p>
      </div>

      <Button size="lg" onClick={onContinue} className="w-full sm:w-auto">
        {copy.quest.experience.showMath}
        <ArrowRightIcon className="size-5" />
      </Button>
    </div>
  );
}

function ConnectStage({
  quest,
  onContinue,
}: {
  quest: StudentQuest;
  onContinue: () => void;
}) {
  return (
    <div key="connect" className="flex flex-col gap-6 animate-rise">
      <div className="grid gap-6 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:items-stretch">
        <QuestPhotoFrame
          photo={quest.photo}
          accent={quest.accent}
          size="companion"
        />

        <div className="flex flex-col justify-center">
          <SectionLabel accent={quest.accent}>
            {copy.quest.experience.connectEyebrow}
          </SectionLabel>

          {quest.lookClosely ? (
            <p className="mt-4 text-lg font-medium leading-relaxed text-cream sm:text-xl">
              {quest.lookClosely}
            </p>
          ) : null}

          {quest.highlightedValues.length > 0 ? (
            <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {quest.highlightedValues.map((value) => (
                <div
                  key={`${value.label}-${value.display}`}
                  className="rounded-tile bg-void/50 px-4 py-4 ring-1 ring-hair"
                >
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-faint">
                    {value.label}
                  </p>
                  <p
                    className="mt-1 font-mono text-2xl font-semibold tracking-tight sm:text-3xl"
                    style={{ color: quest.accent }}
                  >
                    {value.display}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          <p className="mt-5 max-w-xl text-base leading-relaxed text-cream/90 sm:text-lg">
            {quest.connection}
          </p>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            {quest.practiceLine}
          </p>
          {quest.imaginedSituation ? (
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-faint sm:text-base">
              {copy.quest.experience.imaginedSituation}
            </p>
          ) : null}
        </div>
      </div>

      <Button size="lg" onClick={onContinue} className="w-full sm:w-auto">
        {copy.quest.experience.startQuest}
        <ArrowRightIcon className="size-5" />
      </Button>
    </div>
  );
}

function ChallengeStage({ quest }: { quest: StudentQuest }) {
  const [value, setValue] = useState("");
  const [numerator, setNumerator] = useState("");
  const [denominator, setDenominator] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);

  const answerReady =
    quest.answer.kind === "number"
      ? value.trim().length > 0
      : quest.answer.kind === "fraction"
        ? numerator.trim().length > 0 && denominator.trim().length > 0
        : false;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!answerReady) return;
    setSubmitted(true);
  }

  return (
    <div key="challenge" className="flex flex-col gap-6 animate-rise">
      <QuestPhotoFrame photo={quest.photo} accent={quest.accent} size="remnant" />

      <Card accent={quest.accent} className="p-5 sm:p-7">
        <SectionLabel accent={quest.accent}>
          {copy.quest.experience.challengeEyebrow}
        </SectionLabel>
        <p className="mt-3 text-lg leading-relaxed text-cream sm:text-xl">
          {quest.question}
        </p>

        {quest.answer.kind === "unsupported" ? (
          <p className="mt-6 text-sm leading-relaxed text-muted sm:text-base">
            {copy.quest.experience.unsupportedAnswer}
          </p>
        ) : submitted ? (
          <div className="mt-6">
            <p className="text-base leading-relaxed text-cream/90">
              {copy.quest.experience.submitted}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <ButtonLink
                href={quest.scanHref}
                size="lg"
                className="w-full sm:flex-1"
              >
                {copy.quest.experience.scanAnother}
                <ArrowRightIcon className="size-5" />
              </ButtonLink>
              <ButtonLink
                href={quest.setupHref}
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto"
              >
                {copy.quest.experience.changeMission}
              </ButtonLink>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6">
            <AnswerFields
              quest={quest}
              value={value}
              numerator={numerator}
              denominator={denominator}
              onNumber={setValue}
              onNumerator={setNumerator}
              onDenominator={setDenominator}
            />

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Button
                type="submit"
                size="lg"
                disabled={!answerReady}
                className="w-full sm:flex-1"
              >
                {copy.quest.experience.submit}
              </Button>
              {quest.hint ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => setHintOpen((open) => !open)}
                  className="w-full sm:w-auto"
                >
                  {copy.quest.experience.hint}
                </Button>
              ) : null}
            </div>

            {hintOpen && quest.hint ? (
              <p className="mt-5 animate-rise text-sm leading-relaxed text-muted sm:text-base">
                <span className="text-amber">{copy.quest.experience.hint}: </span>
                {quest.hint}
              </p>
            ) : null}
          </form>
        )}
      </Card>
    </div>
  );
}

function AnswerFields({
  quest,
  value,
  numerator,
  denominator,
  onNumber,
  onNumerator,
  onDenominator,
}: {
  quest: StudentQuest;
  value: string;
  numerator: string;
  denominator: string;
  onNumber: (value: string) => void;
  onNumerator: (value: string) => void;
  onDenominator: (value: string) => void;
}) {
  const unit =
    quest.answer.kind === "unsupported" ? null : quest.answer.unit;
  const label = unit
    ? copy.quest.experience.answerUnitLabel(unit)
    : copy.quest.experience.answerLabel;

  if (quest.answer.kind === "fraction") {
    return (
      <div>
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-faint">
          {label}
        </p>
        <div className="mt-2.5 flex items-center gap-3">
          <input
            id="numerator"
            name="numerator"
            inputMode="numeric"
            autoComplete="off"
            aria-label={copy.quest.experience.fractionNumerator}
            value={numerator}
            onChange={(event) => onNumerator(event.target.value)}
            placeholder={copy.quest.experience.fractionNumerator}
            className="min-h-14 w-full rounded-full bg-void/60 px-5 text-base text-cream ring-1 ring-hair transition placeholder:text-faint focus:ring-2 focus:ring-lime focus:outline-none"
          />
          <span aria-hidden className="font-display text-2xl text-faint">
            /
          </span>
          <input
            id="denominator"
            name="denominator"
            inputMode="numeric"
            autoComplete="off"
            aria-label={copy.quest.experience.fractionDenominator}
            value={denominator}
            onChange={(event) => onDenominator(event.target.value)}
            placeholder={copy.quest.experience.fractionDenominator}
            className="min-h-14 w-full rounded-full bg-void/60 px-5 text-base text-cream ring-1 ring-hair transition placeholder:text-faint focus:ring-2 focus:ring-lime focus:outline-none"
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor="answer"
        className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-faint"
      >
        {label}
      </label>
      <input
        id="answer"
        name="answer"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => onNumber(event.target.value)}
        placeholder={copy.quest.experience.numberPlaceholder}
        className="mt-2.5 min-h-14 w-full rounded-full bg-void/60 px-5 text-base text-cream ring-1 ring-hair transition placeholder:text-faint focus:ring-2 focus:ring-lime focus:outline-none"
      />
    </div>
  );
}
