import { FlowSteps } from "@/components/layout/flow-steps";
import { DetourPanel } from "@/components/scan/detour-panel";
import { ProcessingOverlay } from "@/components/scan/processing-overlay";
import { ButtonLink } from "@/components/ui/button";
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
      <div className="flex flex-col gap-5 text-center">
        <FlowSteps current="scan" />
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

        <h1 className="game-title">{copy.quest.experience.processingHeading}</h1>
        <p className="game-support mx-auto">{copy.quest.experience.processingBody}</p>
        <div className="game-actions">
          <ButtonLink href={state.retryHref} size="lg" className="w-full">
            {copy.quest.experience.checkAgain}
          </ButtonLink>
          <ButtonLink href={state.scanHref} variant="ghost" size="md" className="w-full">
            {copy.quest.experience.findAnother}
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (state.kind === "rejected") {
    return (
      <div className="flex flex-col gap-5">
        <FlowSteps current="scan" />
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
    <div className="flex flex-col gap-5 text-center">
      <FlowSteps current="scan" />
      <QuestPhotoFrame photo={state.photo} accent={state.accent} size="companion" />
      <h1 className="game-title">{copy.quest.experience.failedHeading}</h1>
      <p className="game-support mx-auto">{copy.quest.experience.failedBody}</p>
      <div className="game-actions">
        <ButtonLink href={state.scanHref} size="lg" className="w-full">
          {copy.quest.experience.tryAgain}
        </ButtonLink>
        <ButtonLink href={state.setupHref} variant="ghost" size="md" className="w-full">
          {copy.quest.experience.changeMission}
        </ButtonLink>
      </div>
    </div>
  );
}
