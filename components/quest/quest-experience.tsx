"use client";

import { useEffect, useRef, useState } from "react";
import { submitQuestAnswer } from "@/app/quest/actions";
import {
  playFeedbackCue,
  primeFeedbackAudio,
} from "@/components/game/feedback-audio";
import { QuestPhotoFrame } from "@/components/quest/quest-photo";
import {
  ReadAloudButton,
  useReadAloud,
  type ReadAloudControls,
} from "@/components/quest/read-aloud";
import { FlowSteps } from "@/components/layout/flow-steps";
import { Button, ButtonLink } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import {
  CollectibleToken,
  RevealLink,
  TOKEN_MARKS,
  XpBadge,
} from "@/components/ui/play";
import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";
import {
  feedbackCueForSubmission,
  readStoredSoundPreference,
} from "@/lib/feedback-sound";
import { shouldStopReadAloudForStatus } from "@/lib/feedback-cues";
import {
  spokenMathExpression,
  type StudentMathExpression,
} from "@/lib/math/expression";
import {
  formatSpokenProse,
  spokenChallengeReadout,
  spokenConnectReadout,
  spokenDiscoverReadout,
} from "@/lib/speech";
import type {
  ChallengeProgress,
  StudentGradeView,
} from "@/lib/progress/outcome";
import type { StudentQuest } from "@/lib/quest-present";

type Stage = "discover" | "connect" | "challenge";

function skillFromMission(label: string) {
  return label.split("·")[1]?.trim() || "Math";
}

/**
 * The three-beat reveal. Receives a shaped presentation only — never a
 * database row — and keeps stage + answer entry on the client.
 */
export function QuestExperience({ quest }: { quest: StudentQuest }) {
  const [stage, setStage] = useState<Stage>("discover");
  const readAloud = useReadAloud();

  function goTo(next: Stage) {
    readAloud.stop();
    setStage(next);
  }

  return (
    <div className="flex flex-col gap-5">
      <FlowSteps current={stage === "challenge" ? "solve" : "discover"} />

      {stage === "discover" ? (
        <DiscoverStage
          quest={quest}
          readAloud={readAloud}
          onContinue={() => goTo("connect")}
        />
      ) : null}
      {stage === "connect" ? (
        <ConnectStage
          quest={quest}
          readAloud={readAloud}
          onContinue={() => goTo("challenge")}
        />
      ) : null}
      {stage === "challenge" ? (
        <ChallengeStage quest={quest} readAloud={readAloud} />
      ) : null}
    </div>
  );
}

function DiscoverStage({
  quest,
  readAloud,
  onContinue,
}: {
  quest: StudentQuest;
  readAloud: ReadAloudControls;
  onContinue: () => void;
}) {
  const discoverSpeech = spokenDiscoverReadout({
    objectName: quest.objectName,
    discoveryText: quest.discoveryText,
    observations: quest.highlightedValues,
  });

  return (
    <div key="discover" className="flex flex-col items-center gap-5 text-center animate-rise">
      <p className="game-moment">{copy.quest.objectFoundLabel}</p>

      <QuestPhotoFrame photo={quest.photo} accent={quest.accent} size="hero" className="w-full" />

      <h1 className="game-object">{quest.objectName}</h1>

      {quest.highlightedValues.length > 0 ? (
        <ul className="flex flex-wrap justify-center gap-2">
          {quest.highlightedValues.map((value, index) => (
            <li key={`${value.label}-${value.display}`}>
              <CollectibleToken
                label={value.label}
                value={value.display}
                accent={quest.accent}
                mark={TOKEN_MARKS[index % TOKEN_MARKS.length]}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {quest.discoveryText ? (
        <p className="game-support">{quest.discoveryText}</p>
      ) : null}

      <ReadAloudButton
        id="discover"
        text={discoverSpeech}
        name={copy.quest.experience.readAloudDiscover}
        playingId={readAloud.playingId}
        supported={readAloud.supported}
        accent={quest.accent}
        onToggle={readAloud.toggle}
      />

      <div className="game-actions">
        <Button size="lg" onClick={onContinue} className="w-full">
          {copy.quest.experience.showMath}
        </Button>
      </div>
    </div>
  );
}

function ConnectStage({
  quest,
  readAloud,
  onContinue,
}: {
  quest: StudentQuest;
  readAloud: ReadAloudControls;
  onContinue: () => void;
}) {
  const skillLabel = skillFromMission(quest.missionLabel);
  const property = quest.highlightedValues[0];
  const lookCloselyVisible = Boolean(
    quest.lookClosely && (quest.worldContext || !property),
  );
  const connectSpeech = spokenConnectReadout({
    connection: quest.connection,
    lookClosely: quest.lookClosely,
    lookCloselyVisible,
  });

  return (
    <div key="connect" className="flex flex-col items-center gap-5 text-center animate-rise">
      <p className="game-moment">{copy.quest.experience.connectEyebrow}</p>

      <QuestPhotoFrame
        photo={quest.photo}
        accent={quest.accent}
        size="companion"
        className="w-full"
      />

      {quest.worldContext ? (
        <RevealLink
          fromLabel="Your object"
          fromValue={quest.objectName}
          toLabel={skillLabel}
          accent={quest.accent}
        />
      ) : property ? (
        <RevealLink
          fromLabel={property.label}
          fromValue={property.display}
          toLabel={skillLabel}
          accent={quest.accent}
        />
      ) : (
        <RevealLink
          fromLabel="Your find"
          fromValue={quest.objectName}
          toLabel={skillLabel}
          accent={quest.accent}
        />
      )}

      {lookCloselyVisible && quest.lookClosely ? (
        <p className="max-w-sm text-base font-medium leading-relaxed text-cream">
          {quest.lookClosely}
        </p>
      ) : null}

      <p className="game-support">{quest.connection}</p>

      <ReadAloudButton
        id="connect"
        text={connectSpeech}
        name={copy.quest.experience.readAloudConnect}
        playingId={readAloud.playingId}
        supported={readAloud.supported}
        accent={quest.accent}
        onToggle={readAloud.toggle}
      />

      {quest.imaginedSituation ? (
        <p className="max-w-sm text-sm leading-relaxed text-faint">
          {quest.worldContext
            ? copy.quest.experience.inspiredSituation
            : copy.quest.experience.imaginedSituation}
        </p>
      ) : null}

      <div className="game-actions">
        <Button size="lg" onClick={onContinue} className="w-full">
          {copy.quest.experience.startQuest}
        </Button>
      </div>
    </div>
  );
}

function ChallengeStage({
  quest,
  readAloud,
}: {
  quest: StudentQuest;
  readAloud: ReadAloudControls;
}) {
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
  const {
    supported: speechSupported,
    playingId,
    toggle: toggleSpeech,
    stop: stopSpeech,
  } = readAloud;

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
  const challengeSpeech = spokenChallengeReadout({
    question: quest.question,
    expression: quest.mathExpression,
  });
  const hintSpeech = shownHint ? formatSpokenProse(shownHint) : "";

  const answerReady =
    quest.answer.kind === "number"
      ? value.trim().length > 0
      : quest.answer.kind === "fraction"
        ? numerator.trim().length > 0 && denominator.trim().length > 0
        : quest.answer.kind === "choice"
          ? value.trim().length > 0
          : false;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!answerReady || submitting || finished || submitLock.current) return;
    if (quest.answer.kind === "unsupported") return;

    submitLock.current = true;
    setSubmitting(true);
    setInvalid(null);
    primeFeedbackAudio();

    const answer =
      quest.answer.kind === "fraction"
        ? { kind: "fraction" as const, numerator, denominator }
        : quest.answer.kind === "choice"
          ? { kind: "choice" as const, value }
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
          : quest.answer.kind === "choice"
            ? copy.quest.experience.invalidChoice
            : copy.quest.experience.invalidNumber,
      );
      return;
    }

    if (result.status === "unavailable") {
      setInvalid(copy.quest.experience.unavailable);
      return;
    }

    const cue = feedbackCueForSubmission({
      previousStatus: progress.status,
      nextStatus: result.status,
      enabled: readStoredSoundPreference(),
    });

    setProgress(result);
    if (result.status === "incorrect") {
      setHintOpen(true);
      setHintRevealed(true);
    }
    if (shouldStopReadAloudForStatus(result.status)) {
      stopSpeech();
    }
    if (cue) playFeedbackCue(cue);
  }

  const skillLabel = skillFromMission(quest.missionLabel);

  return (
    <div key="challenge" className="flex flex-col gap-5 animate-rise">
      <div className="flex items-center gap-3">
        <QuestPhotoFrame
          photo={quest.photo}
          accent={quest.accent}
          size="remnant"
        />
        <div>
          <p className="game-moment" style={{ color: quest.accent }}>
            {skillLabel}
          </p>
          <p className="font-display text-lg font-extrabold tracking-tight text-cream">
            {quest.objectName}
          </p>
        </div>
      </div>

      <div>
        <p className="game-moment">{copy.quest.experience.challengeEyebrow}</p>
        <p className="mt-2 font-display text-[1.75rem] leading-snug font-extrabold tracking-tight text-pretty text-cream sm:text-3xl">
          {quest.question}
        </p>
        <ReadAloudButton
          id="challenge"
          text={challengeSpeech}
          name={copy.quest.experience.readAloudChallenge}
          playingId={playingId}
          supported={speechSupported}
          accent={quest.accent}
          className="mt-3"
          onToggle={toggleSpeech}
        />
      </div>

      <MathBoard expression={quest.mathExpression} accent={quest.accent} />

      {quest.answer.kind === "unsupported" ? (
        <p className="text-sm leading-relaxed text-muted">
          {copy.quest.experience.unsupportedAnswer}
        </p>
      ) : progress.status === "correct" || progress.status === "complete" ? (
        <FinishedState
          progress={progress}
          quest={quest}
          speechSupported={speechSupported}
          playingId={playingId}
          onToggleSpeech={toggleSpeech}
        />
      ) : (
        <form onSubmit={submit}>
          <AnswerFields
            quest={quest}
            value={value}
            numerator={numerator}
            denominator={denominator}
            onNumber={setValue}
            onNumerator={setNumerator}
            onDenominator={setDenominator}
          />

          <div className="game-actions mt-5">
            <Button
              type="submit"
              size="lg"
              disabled={!answerReady || submitting}
              className="w-full"
            >
              {submitting
                ? copy.quest.experience.checking
                : copy.quest.experience.submit}
            </Button>
            {quest.hint && !shownHint ? (
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => {
                  setHintOpen(true);
                  setHintRevealed(true);
                }}
                className="w-full"
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
            <div className="answer-nudge mt-5 text-center animate-rise">
              <div role="status">
                <p className="font-display text-3xl font-extrabold tracking-tight text-amber uppercase">
                  {copy.quest.experience.incorrectHeading}
                </p>
                <p className="mt-2 text-base font-medium text-cream">
                  {copy.quest.experience.incorrectTrail}
                </p>
                {progress.hint ? (
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    <span className="font-bold text-amber">{hintLabel}: </span>
                    {progress.hint}
                  </p>
                ) : null}
              </div>
              {progress.hint ? (
                <div className="mt-3 flex justify-center">
                  <ReadAloudButton
                    id="hint"
                    text={hintSpeech}
                    name={copy.quest.experience.readAloudHint}
                    playingId={playingId}
                    supported={speechSupported}
                    accent={quest.accent}
                    onToggle={toggleSpeech}
                  />
                </div>
              ) : null}
            </div>
          ) : shownHint ? (
            <div className="mt-5 animate-rise">
              <p role="status" className="text-sm leading-relaxed text-muted">
                <span className="font-bold text-amber">{hintLabel}: </span>
                {shownHint}
              </p>
              <ReadAloudButton
                id="hint"
                text={hintSpeech}
                name={copy.quest.experience.readAloudHint}
                playingId={playingId}
                supported={speechSupported}
                accent={quest.accent}
                className="mt-3"
                onToggle={toggleSpeech}
              />
            </div>
          ) : null}
        </form>
      )}
    </div>
  );
}

function FinishedState({
  progress,
  quest,
  speechSupported,
  playingId,
  onToggleSpeech,
}: {
  progress: Extract<ChallengeProgress, { status: "correct" | "complete" }>;
  quest: StudentQuest;
  speechSupported: boolean;
  playingId: string | null;
  onToggleSpeech: (id: string, text: string) => void;
}) {
  const solved = progress.status === "correct";
  const explanationSpeech = formatSpokenProse(progress.explanation);

  return (
    <div className="animate-rise text-center">
      <div role="status" className={cn("flex flex-col items-center", solved && "animate-discover")}>
        {solved ? (
          <>
            <span
              aria-hidden
              className="grid size-[4.5rem] place-items-center rounded-2xl border-b-4 text-void"
              style={{ background: quest.accent, borderColor: "#0b0914" }}
            >
              <CheckIcon className="size-10" />
            </span>
            <p className="mt-4 font-display text-4xl font-extrabold tracking-tight text-cream uppercase">
              {copy.quest.experience.correctHeading}
            </p>
            <div className="mt-3">
              <XpBadge amount={progress.xp} />
            </div>
          </>
        ) : (
          <>
            <p className="font-display text-3xl font-extrabold tracking-tight text-cream">
              {copy.quest.experience.revealedHeading}
            </p>
            <p className="mt-2 text-sm text-muted">
              {copy.quest.experience.revealedBody}
            </p>
          </>
        )}
      </div>

      <p className="mt-5 text-base leading-relaxed text-cream/90">
        {progress.explanation}
      </p>
      <div className="mt-3 flex justify-center">
        <ReadAloudButton
          id="explanation"
          text={explanationSpeech}
          name={copy.quest.experience.readAloudExplanation}
          playingId={playingId}
          supported={speechSupported}
          accent={quest.accent}
          onToggle={onToggleSpeech}
        />
      </div>
      <p className="mt-4 font-display text-lg font-extrabold" style={{ color: quest.accent }}>
        {progress.revealedAnswer}
      </p>

      <div className="game-actions mt-7">
        <ButtonLink href={quest.scanHref} size="lg" className="w-full">
          {copy.quest.experience.scanAnother}
        </ButtonLink>
        <ButtonLink href={quest.setupHref} variant="ghost" size="md" className="w-full">
          {copy.quest.experience.changeMission}
        </ButtonLink>
      </div>
    </div>
  );
}

function MathBoard({
  expression,
  accent,
}: {
  expression: StudentMathExpression;
  accent: string;
}) {
  if (expression.kind !== "equation") return null;

  const spoken = spokenMathExpression(expression);
  const multi = expression.lines.length > 1;

  return (
    <div
      role="img"
      className="math-board"
      data-lines={multi ? "multi" : "single"}
      style={{ color: accent }}
      aria-label={spoken}
    >
      {expression.lines.map((line, index) => (
        <div
          key={`${line.heading ?? "eq"}-${index}`}
          aria-hidden
          className="math-board-line"
        >
          {line.heading ? <p className="math-board-step">{line.heading}</p> : null}
          <p className="math-board-eq">{line.display}</p>
        </div>
      ))}
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
    quest.answer.kind === "number" || quest.answer.kind === "fraction"
      ? quest.answer.unit
      : null;
  const label =
    quest.answer.kind === "choice"
      ? copy.quest.experience.answerChoiceLabel
      : unit
        ? copy.quest.experience.answerUnitLabel(unit)
        : copy.quest.experience.answerLabel;

  if (quest.answer.kind === "choice") {
    return (
      <fieldset
        className="min-w-0 border-0 p-0"
        style={{ ["--choice-accent" as string]: quest.accent }}
      >
        <legend className="text-sm font-bold text-muted">{label}</legend>
        <div className="mt-3 grid gap-3">
          {quest.answer.options.map((option) => {
            const selected = value === option;
            return (
              <label
                key={option}
                data-selected={selected}
                className="choice-tile"
              >
                <input
                  type="radio"
                  name="geometry-choice"
                  value={option}
                  checked={selected}
                  onChange={() => onNumber(option)}
                  className="sr-only"
                />
                {option}
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (quest.answer.kind === "fraction") {
    return (
      <fieldset className="min-w-0 border-0 p-0">
        <legend className="text-sm font-bold text-muted">{label}</legend>
        <div className="mx-auto mt-4 flex max-w-[12rem] flex-col items-center gap-2">
          <input
            id="numerator"
            name="numerator"
            inputMode="numeric"
            autoComplete="off"
            aria-label={copy.quest.experience.fractionNumerator}
            value={numerator}
            onChange={(event) => onNumerator(event.target.value)}
            placeholder={copy.quest.experience.fractionNumerator}
            className="game-input"
          />
          <span aria-hidden className="h-1 w-24 rounded-full bg-cream" />
          <input
            id="denominator"
            name="denominator"
            inputMode="numeric"
            autoComplete="off"
            aria-label={copy.quest.experience.fractionDenominator}
            value={denominator}
            onChange={(event) => onDenominator(event.target.value)}
            placeholder={copy.quest.experience.fractionDenominator}
            className="game-input"
          />
        </div>
      </fieldset>
    );
  }

  return (
    <div>
      <label htmlFor="answer" className="text-sm font-bold text-muted">
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
        className="game-input mt-3"
      />
    </div>
  );
}
