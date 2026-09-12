"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DetourPanel } from "@/components/scan/detour-panel";
import { ProcessingOverlay } from "@/components/scan/processing-overlay";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import {
  ArrowRightIcon,
  CameraIcon,
  ImageIcon,
  RetryIcon,
} from "@/components/ui/icons";
import { copy } from "@/lib/copy";
import {
  type DetourRequest,
  presentDetour,
} from "@/lib/detour";
import {
  type ImageRejection,
  MAX_IMAGE_MB,
  validateImageFile,
} from "@/lib/image-capture";
import { uploadQuestImage } from "@/lib/quest-upload";
import type { Grade, Skill } from "@/lib/types";

type Stage = "idle" | "preview" | "processing";

/** Roughly the cadence the real two-stage pipeline will run at. */
const STEP_MS = 750;

const STEPS = copy.scan.processingSteps;

/**
 * The heading and body to show when something went wrong, or null when the
 * screen should read as normal. Keeps the branching out of the markup.
 */
function problemNotice(
  rejection: ImageRejection | null,
  uploadFailed: boolean,
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
  questId,
}: {
  grade: Grade;
  skill: Skill;
  questId: string;
}) {
  const router = useRouter();
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("idle");
  // The file is held, not just its preview URL, so a failed upload can resend
  // the same bytes without making the student photograph anything again.
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rejection, setRejection] = useState<ImageRejection | null>(null);
  // Student-safe presentation data only. The pipeline reason never lands here.
  const [detour, setDetour] = useState<DetourRequest | null>(null);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const clearPicked = useCallback(() => {
    setFile(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, []);

  useEffect(() => clearPicked, [clearPicked]);

  const reject = useCallback(
    (reason: ImageRejection) => {
      clearPicked();
      setRejection(reason);
      setDetour(null);
      setUploadFailed(false);
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
    setUploadFailed(false);
    setStage("preview");
  }, []);

  const dismissDetour = useCallback(() => {
    clearPicked();
    setDetour(null);
    setRejection(null);
    setUploadFailed(false);
    setStage("idle");
  }, [clearPicked]);

  function handlePick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    // Allow re-picking the same file, which otherwise fires no change event.
    event.target.value = "";

    // Dismissing the picker is a change of mind, not a mistake to report.
    if (!picked) return;

    // Checks the file as it sits on the device, so a full-size camera photo
    // passes here and gets normalised on the way out. The server re-checks the
    // prepared upload against its own, much smaller, budget.
    const problem = validateImageFile(picked);
    if (problem) {
      reject(problem);
      return;
    }

    clearPicked();
    setRejection(null);
    setDetour(null);
    setUploadFailed(false);
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
    setStage("preview");
  }

  async function findTheMath() {
    if (!file) {
      reject("missing");
      return;
    }

    setRejection(null);
    setDetour(null);
    setUploadFailed(false);
    setStepIndex(0);
    setStage("processing");

    // Hold the overlay for a full run of the messages even when the upload
    // beats them, so the wait reads as work rather than a flicker. A slower
    // upload just rests on the last message until it finishes.
    const [outcome] = await Promise.all([
      uploadQuestImage(file, grade, skill.id),
      new Promise((resolve) => setTimeout(resolve, STEP_MS * STEPS.length)),
    ]);

    if (outcome.status === "ok") {
      router.push(
        `/quest/${questId}?grade=${grade}&skill=${skill.id}&quest=${outcome.questId}`,
      );
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

    // Nothing was persisted, so go back to the photo with a retry offered.
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

  const notice = problemNotice(rejection, uploadFailed);

  return (
    <div className="flex flex-col gap-6">
      {detour ? (
        <DetourPanel
          presentation={presentDetour(detour, skill)}
          accent={skill.accent}
          primary={{
            label: "Find Another Object",
            onClick: dismissDetour,
          }}
          secondary={
            detour.offerSkillChange
              ? {
                  label: "Try Another Math Skill",
                  href: `/setup?grade=${grade}`,
                  onClick: dismissDetour,
                }
              : undefined
          }
        />
      ) : (
        <div>
          <SectionLabel accent={skill.accent}>
            Grade {grade} · {skill.label}
          </SectionLabel>
          <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-cream sm:text-4xl">
            {notice ? notice.heading : copy.scan.heading}
          </h1>
          <p
            role={notice ? "alert" : undefined}
            className="mt-3 max-w-lg text-sm leading-relaxed text-muted sm:text-base"
          >
            {notice ? (
              notice.body
            ) : (
              <>
                {copy.scan.lookForLead(skill.label.toLowerCase())}
                <span className="text-cream">{skill.lookFor}</span>.
              </>
            )}
          </p>
        </div>
      )}

      <div className="viewfinder relative flex min-h-[19rem] items-center justify-center overflow-hidden rounded-tile bg-void/60 ring-1 ring-hair sm:min-h-[24rem]">
        {previewUrl ? (
          <>
            {/* A blob URL from the local camera: nothing for next/image to optimise. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={copy.scan.previewAlt}
              // Catches formats the browser accepted but cannot actually decode.
              onError={() => reject("unsupported")}
              className="max-h-[24rem] w-full object-contain"
            />
            {stage === "processing" ? (
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-24 animate-sweep"
                style={{
                  background: `linear-gradient(180deg, transparent, ${skill.accent}2e, transparent)`,
                }}
              />
            ) : null}
          </>
        ) : (
          <div className="px-8 text-center">
            <CameraIcon className="mx-auto size-9 text-faint" />
            <p className="mt-4 text-sm text-faint">
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
        className="hidden"
      />
      <input
        ref={libraryInput}
        type="file"
        accept="image/*"
        onChange={handlePick}
        className="hidden"
      />

      {detour ? (
        <div className="flex flex-col gap-3 sm:flex-row">
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
        <div className="flex flex-col gap-3">
          <Button size="lg" onClick={findTheMath} className="w-full">
            {uploadFailed ? (
              <>
                Try again
                <RetryIcon className="size-5" />
              </>
            ) : (
              <>
                Find the math
                <ArrowRightIcon className="size-5" />
              </>
            )}
          </Button>
          <div className="flex flex-col gap-3 sm:flex-row">
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
        </div>
      ) : stage === "processing" ? null : (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            size="lg"
            onClick={() => cameraInput.current?.click()}
            className="w-full sm:flex-1"
          >
            <CameraIcon className="size-5" />
            Take a photo
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => libraryInput.current?.click()}
            className="w-full sm:w-auto"
          >
            <ImageIcon className="size-5" />
            Choose a photo
          </Button>
        </div>
      )}
    </div>
  );
}
