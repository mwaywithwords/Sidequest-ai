"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ClueCollection,
  CluePanel,
} from "@/components/scan/clue-panel";
import { DetourPanel } from "@/components/scan/detour-panel";
import { ProcessingOverlay } from "@/components/scan/processing-overlay";
import { Button } from "@/components/ui/button";
import {
  CameraIcon,
  ImageIcon,
  RetryIcon,
} from "@/components/ui/icons";
import { ViewfinderCorners } from "@/components/ui/play";
import { type ClueRequest, presentClue } from "@/lib/clue";
import { copy } from "@/lib/copy";
import { type DetourRequest, presentDetour } from "@/lib/detour";
import {
  type ImageRejection,
  MAX_IMAGE_MB,
  validateImageFile,
} from "@/lib/image-capture";
import { uploadQuestImage } from "@/lib/quest-upload";
import type { Grade, Skill } from "@/lib/types";

type Stage = "idle" | "preview" | "processing";

/** How often the caption advances while the pipeline is still working. */
const STEP_MS = 2200;

const STEPS = copy.scan.processingSteps;

/**
 * The heading and body to show when something went wrong, or null when the
 * screen should read as normal. Keeps the branching out of the markup.
 */
function problemNotice(
  rejection: ImageRejection | null,
  uploadFailed: boolean,
  generationFailed: boolean,
) {
  if (rejection) {
    return {
      heading: copy.scan.rejectedHeading,
      body:
        rejection === "tooLarge"
          ? copy.scan.rejected.tooLarge(MAX_IMAGE_MB)
          : copy.scan.rejected[rejection],
    };
  }

  if (generationFailed) {
    return {
      heading: copy.scan.generationFailedHeading,
      body: copy.scan.generationFailedBody,
    };
  }

  if (uploadFailed) {
    return {
      heading: copy.scan.uploadFailedHeading,
      body: copy.scan.uploadFailedBody,
    };
  }

  return null;
}

export function ScanStage({
  grade,
  skill,
}: {
  grade: Grade;
  skill: Skill;
}) {
  const router = useRouter();
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const cluePhotoInput = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("idle");
  // The file is held, not just its preview URL, so a failed upload can resend
  // the same bytes without making the student photograph anything again.
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rejection, setRejection] = useState<ImageRejection | null>(null);
  const [detour, setDetour] = useState<DetourRequest | null>(null);
  const [clue, setClue] = useState<ClueRequest | null>(null);
  const [clueCollection, setClueCollection] = useState<ClueCollection>({
    status: "idle",
  });
  const [uploadFailed, setUploadFailed] = useState(false);
  const [generationFailed, setGenerationFailed] = useState(false);
  const [cluePhotoFailed, setCluePhotoFailed] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const uploadLock = useRef(false);

  const revokeCluePreview = useCallback(() => {
    setClueCollection((current) => {
      if (current.status === "photo") URL.revokeObjectURL(current.previewUrl);
      return { status: "idle" };
    });
  }, []);

  const clearPicked = useCallback(() => {
    setFile(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    revokeCluePreview();
  }, [revokeCluePreview]);

  useEffect(() => clearPicked, [clearPicked]);

  const reject = useCallback(
    (reason: ImageRejection) => {
      clearPicked();
      setRejection(reason);
      setDetour(null);
      setClue(null);
      setCluePhotoFailed(false);
      setUploadFailed(false);
      setGenerationFailed(false);
      setStage("idle");
    },
    [clearPicked],
  );

  /**
   * A validation refusal is a detour, not a discarded photo. The file and its
   * preview stay so the student can still see what they pointed at; they are
   * cleared only when the student starts over.
   */
  const refuse = useCallback((request: DetourRequest) => {
    setRejection(null);
    setDetour(request);
    setClue(null);
    revokeCluePreview();
    setCluePhotoFailed(false);
    setUploadFailed(false);
    setGenerationFailed(false);
    setStage("preview");
  }, [revokeCluePreview]);

  /**
   * An investigation that needs one more observation. The original photo and
   * quest stay; this is not a failure and not a detour.
   */
  const beginClue = useCallback((request: ClueRequest) => {
    setRejection(null);
    setDetour(null);
    setClue(request);
    revokeCluePreview();
    setCluePhotoFailed(false);
    setUploadFailed(false);
    setGenerationFailed(false);
    setStage("preview");
  }, [revokeCluePreview]);

  const dismissInvestigation = useCallback(() => {
    clearPicked();
    setDetour(null);
    setClue(null);
    setRejection(null);
    setCluePhotoFailed(false);
    setUploadFailed(false);
    setGenerationFailed(false);
    setStage("idle");
  }, [clearPicked]);

  function handlePick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = "";

    if (!picked) return;

    const problem = validateImageFile(picked);
    if (problem) {
      reject(problem);
      return;
    }

    clearPicked();
    setRejection(null);
    setDetour(null);
    setClue(null);
    setCluePhotoFailed(false);
    setUploadFailed(false);
    setGenerationFailed(false);
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
    setStage("preview");
  }

  /**
   * A supporting photograph for the current investigation. It must not replace
   * the original object, and it is not uploaded yet — multi-image storage is
   * the next implementation step.
   */
  function handleCluePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = "";

    if (!picked) return;

    const problem = validateImageFile(picked);
    if (problem) {
      // The original investigation photo is still the one on screen. A bad
      // supporting shot should not wipe it.
      setCluePhotoFailed(true);
      return;
    }

    setCluePhotoFailed(false);
    setClueCollection((current) => {
      if (current.status === "photo") URL.revokeObjectURL(current.previewUrl);
      return { status: "photo", previewUrl: URL.createObjectURL(picked) };
    });
  }

  async function findTheMath() {
    if (uploadLock.current) return;

    if (!file) {
      reject("missing");
      return;
    }

    uploadLock.current = true;

    setRejection(null);
    setDetour(null);
    setClue(null);
    revokeCluePreview();
    setCluePhotoFailed(false);
    setUploadFailed(false);
    setGenerationFailed(false);
    setStepIndex(0);
    setStage("processing");

    const outcome = await uploadQuestImage(file, grade, skill.id);

    if (outcome.status === "ok") {
      router.push(`/quest/${outcome.questId}`);
      return;
    }

    uploadLock.current = false;

    if (outcome.status === "needsEvidence") {
      beginClue({
        questId: outcome.questId,
        objectName: outcome.objectName,
        evidenceRequest: outcome.evidenceRequest,
      });
      return;
    }

    if (outcome.status === "rejected") {
      reject(outcome.reason);
      return;
    }

    if (outcome.status === "refused") {
      refuse(outcome.detour);
      return;
    }

    if (outcome.status === "generationFailed") {
      setGenerationFailed(true);
      setStage("preview");
      return;
    }

    setUploadFailed(true);
    setStage("preview");
  }

  useEffect(() => {
    if (stage !== "processing") return;

    const ticker = setInterval(() => {
      setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
    }, STEP_MS);

    return () => clearInterval(ticker);
  }, [stage]);

  const notice = problemNotice(rejection, uploadFailed, generationFailed);
  const investigating = clue !== null;

  return (
    <div className="flex flex-col gap-4">
      {investigating ? (
        <CluePanel
          questId={clue.questId}
          presentation={presentClue(clue)}
          type={clue.evidenceRequest.type}
          accent={skill.accent}
          collection={clueCollection}
          onAddPhoto={() => cluePhotoInput.current?.click()}
          onStartEntry={() => setClueCollection({ status: "entering" })}
          onSaveEntry={(value) => setClueCollection({ status: "value", value })}
          onChangeObject={dismissInvestigation}
        />
      ) : detour ? (
        <DetourPanel
          presentation={presentDetour(detour, skill)}
          accent={skill.accent}
          primary={{
            label: "Find Another Object",
            onClick: dismissInvestigation,
          }}
          secondary={
            detour.offerSkillChange
              ? {
                  label: "Try Another Math Skill",
                  href: `/setup?grade=${grade}`,
                  onClick: dismissInvestigation,
                }
              : undefined
          }
        />
      ) : (
        <div className="text-center">
          <p className="game-moment">{copy.scan.missionLabel}</p>
          <p className="mt-1 font-display text-lg font-extrabold" style={{ color: skill.accent }}>
            {skill.label}
          </p>
          {notice ? (
            <>
              <h1 className="game-title mx-auto mt-3 text-balance">
                {notice.heading}
              </h1>
              <p
                role="alert"
                className={`mx-auto mt-2 game-support ${generationFailed ? "text-cream" : ""}`}
              >
                {notice.body}
              </p>
            </>
          ) : stage === "preview" || stage === "processing" ? null : (
            <h1 className="game-title mx-auto mt-2 max-w-[14rem] text-balance sm:max-w-none">
              {copy.scan.heading}
            </h1>
          )}
        </div>
      )}

      {cluePhotoFailed ? (
        <p role="alert" className="text-sm leading-relaxed text-muted sm:text-base">
          {copy.scan.cluePhotoFailed}
        </p>
      ) : null}

      <div
        className={
          previewUrl
            ? "photo-frame scan-frame is-hero"
            : "photo-frame scan-frame"
        }
        aria-busy={stage === "processing"}
      >
        {stage !== "processing" ? (
          <ViewfinderCorners accent={skill.accent} />
        ) : null}
        {previewUrl ? (
          // A blob URL from the local camera: nothing for next/image to optimise.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={copy.scan.previewAlt}
            onError={() => reject("unsupported")}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="px-8 text-center">
            <CameraIcon className="mx-auto size-11 text-faint" />
            <p className="mt-3 text-sm font-bold text-faint">
              {rejection ? copy.scan.rejectedPreview : copy.scan.emptyPreview}
            </p>
          </div>
        )}

        {stage === "processing" ? (
          <ProcessingOverlay message={STEPS[stepIndex]} accent={skill.accent} />
        ) : null}
      </div>

      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePick}
        aria-hidden
        tabIndex={-1}
        className="hidden"
      />
      <input
        ref={libraryInput}
        type="file"
        accept="image/*"
        onChange={handlePick}
        aria-hidden
        tabIndex={-1}
        className="hidden"
      />
      <input
        ref={cluePhotoInput}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCluePhoto}
        aria-hidden
        tabIndex={-1}
        className="hidden"
      />

      {investigating || detour ? (
        <div className="game-actions">
          <Button
            variant="secondary"
            size="lg"
            onClick={() => cameraInput.current?.click()}
            className="w-full sm:flex-1"
          >
            <RetryIcon className="size-5" />
            Retake
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => libraryInput.current?.click()}
            className="w-full sm:flex-1"
          >
            <ImageIcon className="size-5" />
            Choose another
          </Button>
        </div>
      ) : stage === "preview" ? (
        <div className="game-actions">
          <Button size="lg" onClick={findTheMath} className="w-full">
            {uploadFailed || generationFailed ? (
              <>
                Try again
                <RetryIcon className="size-5" />
              </>
            ) : (
              copy.scan.usePhoto
            )}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => cameraInput.current?.click()}
            className="w-full"
          >
            <RetryIcon className="size-5" />
            Retake
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={() => libraryInput.current?.click()}
            className="w-full"
          >
            <ImageIcon className="size-5" />
            {copy.scan.choosePhoto}
          </Button>
        </div>
      ) : stage === "processing" ? null : (
        <div className="game-actions">
          <Button
            size="lg"
            onClick={() => cameraInput.current?.click()}
            className="w-full"
          >
            <CameraIcon className="size-6" />
            {copy.scan.takePhoto}
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={() => libraryInput.current?.click()}
            className="w-full"
          >
            {copy.scan.choosePhoto}
          </Button>
          {!notice ? (
            <p className="text-center text-sm text-muted">{copy.scan.tip}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
