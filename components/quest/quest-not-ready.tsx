import { DetourPanel } from "@/components/scan/detour-panel";
import { ProcessingOverlay } from "@/components/scan/processing-overlay";
import { ButtonLink } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { ArrowRightIcon, RetryIcon } from "@/components/ui/icons";
import { QuestPhotoFrame } from "@/components/quest/quest-photo";
import { copy } from "@/lib/copy";
import type { QuestExperience } from "@/lib/quest-present";

type NotReady = Exclude<QuestExperience, { kind: "missing" } | { kind: "ready" }>;

/**
 * Pending, rejected, and failed quests. Never receives a candidate
 * challenge — those fields are not loaded when the quest is not ready.
 */
export function QuestNotReady({ state }: { state: NotReady }) {
  if (state.kind === "working") {
    return (
      <div className="flex flex-col gap-6">
        {state.missionLabel ? (
          <SectionLabel accent={state.accent}>{state.missionLabel}</SectionLabel>
        ) : null}

        <div className="relative">
          <QuestPhotoFrame
            photo={state.photo}
            accent={state.accent}
            size="hero"
          />
          <ProcessingOverlay
            message={copy.scan.processingSteps[0]}
            accent={state.accent}
          />
        </div>

        <Card className="p-5 sm:p-7">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-cream sm:text-4xl">
            {copy.quest.experience.processingHeading}
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
            {copy.quest.experience.processingBody}
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={state.retryHref} size="lg" className="w-full sm:flex-1">
              {copy.quest.experience.checkAgain}
              <RetryIcon className="size-5" />
            </ButtonLink>
            <ButtonLink
              href={state.scanHref}
              variant="secondary"
              size="lg"
              className="w-full sm:flex-1"
            >
              {copy.quest.experience.findAnother}
            </ButtonLink>
          </div>
        </Card>
      </div>
    );
  }

  if (state.kind === "rejected") {
    return (
      <div className="flex flex-col gap-6">
        <QuestPhotoFrame photo={state.photo} accent={state.accent} size="companion" />
        <DetourPanel
          presentation={state.detour}
          accent={state.accent}
          primary={{
            label: copy.quest.experience.findAnother,
            href: state.primaryHref,
          }}
          secondary={
            state.secondaryHref
              ? {
                  label: copy.quest.experience.tryAnotherSkill,
                  href: state.secondaryHref,
                }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <QuestPhotoFrame photo={state.photo} accent={state.accent} size="companion" />
      <Card accent={state.accent} className="p-5 sm:p-7">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-cream sm:text-4xl">
          {copy.quest.experience.failedHeading}
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
          {copy.quest.experience.failedBody}
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href={state.scanHref} size="lg" className="w-full sm:flex-1">
            {copy.quest.experience.tryAgain}
            <ArrowRightIcon className="size-5" />
          </ButtonLink>
          <ButtonLink
            href={state.setupHref}
            variant="secondary"
            size="lg"
            className="w-full sm:flex-1"
          >
            {copy.quest.experience.changeMission}
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
