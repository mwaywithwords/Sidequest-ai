"use client";

import { useEffect, useRef, useState } from "react";
import { submitQuestAnswer } from "@/app/quest/actions";
import { QuestPhotoFrame } from "@/components/quest/quest-photo";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { ArrowRightIcon, CheckIcon, SparkIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";
import type {
  ChallengeProgress,
  StudentGradeView,
} from "@/lib/progress/outcome";
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

      <StageTrail stage={stage} accent={quest.accent} />

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
        <div className="flex items-center gap-2.5">
          <SparkIcon className="size-6 text-amber" />
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
  const startedAt = useRef(0);
  const submitLock = useRef(false);
  const [value, setValue] = useState("");
  const [numerator, setNumerator] = useState("");
  const [denominator, setDenominator] = useState("");
  const [progress, setProgress] = useState<ChallengeProgress>(quest.progress);
  const [hintOpen, setHintOpen] = useState(quest.progress.status === "incorrect");
  const [hintRevealed, setHintRevealed] = useState(
    quest.progress.status === "incorrect",
  );
  const [submitting, setSubmitting] = useState(false);
  const [invalid, setInvalid] = useState<string | null>(null);

  useEffect(() => {
    startedAt.current = performance.now();
  }, []);

  const finished = progress.status === "correct" || progress.status === "complete";
  const shownHint =
    progress.status === "incorrect" ? progress.hint : hintOpen ? quest.hint : null;
  const hintLabel =
    progress.status === "incorrect" && progress.attemptNumber >= 2
      ? copy.quest.experience.hint2
      : copy.quest.experience.hint1;

  const answerReady =
    quest.answer.kind === "number"
      ? value.trim().length > 0
      : quest.answer.kind === "fraction"
        ? numerator.trim().length > 0 && denominator.trim().length > 0
        : false;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!answerReady || submitting || finished || submitLock.current) return;
    if (quest.answer.kind === "unsupported") return;

    submitLock.current = true;
    setSubmitting(true);
    setInvalid(null);

    const answer =
      quest.answer.kind === "fraction"
        ? { kind: "fraction" as const, numerator, denominator }
        : { kind: "number" as const, value };

    const result = await submitQuestAnswer({
      questId: quest.questId,
      answer,
      hintRevealed: hintRevealed || shownHint !== null,
      // Telemetry only: measured in the submit handler, not during render.
      // eslint-disable-next-line react-hooks/purity -- event-handler clock
      responseTimeMs: Math.max(0, Math.round(performance.now() - startedAt.current)),
    });

    applyGrade(result);
    setSubmitting(false);
    submitLock.current = false;
  }

  function applyGrade(result: StudentGradeView) {
    if (result.status === "invalid") {
      setInvalid(
        quest.answer.kind === "fraction"
          ? copy.quest.experience.invalidFraction
          : copy.quest.experience.invalidNumber,
      );
      return;
    }

    if (result.status === "unavailable") {
      setInvalid(copy.quest.experience.unavailable);
      return;
    }

    setProgress(result);
    if (result.status === "incorrect") {
      setHintOpen(true);
      setHintRevealed(true);
    }
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
        ) : progress.status === "correct" || progress.status === "complete" ? (
          <FinishedState progress={progress} quest={quest} />
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
                disabled={!answerReady || submitting}
                className="w-full sm:flex-1"
              >
                {submitting
                  ? copy.quest.experience.checking
                  : copy.quest.experience.submit}
              </Button>
              {quest.hint && !shownHint ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => {
                    setHintOpen(true);
                    setHintRevealed(true);
                  }}
                  className="w-full sm:w-auto"
                >
                  {copy.quest.experience.hint}
                </Button>
              ) : null}
            </div>

            {invalid ? (
              <p
                role="alert"
                className="mt-5 animate-rise text-sm leading-relaxed text-muted"
              >
                {invalid}
              </p>
            ) : null}

            {progress.status === "incorrect" ? (
              <div
                role="status"
                className="mt-5 animate-rise rounded-tile bg-void/50 p-4 ring-1 ring-hair"
              >
                <p className="text-sm font-medium text-cream sm:text-base">
                  {copy.quest.experience.incorrectTrail}
                </p>
                {progress.hint ? (
                  <p className="mt-2.5 text-sm leading-relaxed text-muted sm:text-base">
                    <span className="font-medium text-amber">{hintLabel}: </span>
                    {progress.hint}
                  </p>
                ) : null}
              </div>
            ) : shownHint ? (
              <p
                role="status"
                className="mt-5 animate-rise text-sm leading-relaxed text-muted sm:text-base"
              >
                <span className="font-medium text-amber">{hintLabel}: </span>
                {shownHint}
              </p>
            ) : null}
          </form>
        )}
      </Card>
    </div>
  );
}

function FinishedState({
  progress,
  quest,
}: {
  progress: Extract<ChallengeProgress, { status: "correct" | "complete" }>;
  quest: StudentQuest;
}) {
  const solved = progress.status === "correct";

  return (
    <div className="mt-6 animate-rise">
      <div
        className="flex items-center gap-2.5 rounded-tile px-4 py-3.5"
        style={{ background: `${quest.accent}1f` }}
      >
        <CheckIcon className="size-5" style={{ color: quest.accent }} />
        <p className="font-display text-lg font-bold tracking-tight text-cream">
          {solved
            ? copy.quest.experience.correctHeading
            : copy.quest.experience.revealedHeading}
        </p>
      </div>

      {solved ? (
        <p
          className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 font-mono text-sm font-semibold"
          style={{ color: quest.accent, background: `${quest.accent}24` }}
        >
          <SparkIcon className="size-4" />
          {copy.quest.experience.xp(progress.xp)}
        </p>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
          {copy.quest.experience.revealedBody}
        </p>
      )}

      <p className="mt-4 text-base leading-relaxed text-cream/90 sm:text-lg">
        {progress.explanation}
      </p>
      <p className="mt-2 font-mono text-sm text-muted">
        {progress.revealedAnswer}
      </p>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href={quest.scanHref} size="lg" className="w-full sm:flex-1">
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
      <fieldset className="min-w-0 border-0 p-0">
        <legend className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-faint">
          {label}
        </legend>
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
      </fieldset>
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

const QUEST_STAGES: Stage[] = ["discover", "connect", "challenge"];

function StageTrail({ stage, accent }: { stage: Stage; accent: string }) {
  const current = QUEST_STAGES.indexOf(stage);
  const labels = {
    discover: copy.quest.experience.stageDiscover,
    connect: copy.quest.experience.stageConnect,
    challenge: copy.quest.experience.stageChallenge,
  };

  return (
    <ol className="flex flex-wrap items-center gap-2">
      {QUEST_STAGES.map((id, index) => {
        const isActive = index === current;
        const isDone = index < current;

        return (
          <li key={id} className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex min-h-8 items-center rounded-full px-3 text-xs font-semibold",
                isActive && "text-void",
                isDone && "text-cream ring-1 ring-hair",
                !isActive && !isDone && "text-faint ring-1 ring-hair",
              )}
              style={isActive ? { background: accent } : undefined}
              aria-current={isActive ? "step" : undefined}
            >
              {labels[id]}
            </span>
            {index < QUEST_STAGES.length - 1 ? (
              <span
                aria-hidden
                className={cn("h-px w-4 sm:w-6", isDone ? "bg-muted" : "bg-hair")}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
