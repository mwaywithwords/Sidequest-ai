"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
  type ImageRejection,
  MAX_IMAGE_MB,
  validateImageFile,
} from "@/lib/image-capture";
import type { Grade, Skill } from "@/lib/types";

type Stage = "idle" | "preview" | "processing";

/** Roughly the cadence the real two-stage pipeline will run at. */
const STEP_MS = 750;

const STEPS = copy.scan.processingSteps;

function rejectionBody(rejection: ImageRejection): string {
  return rejection === "tooLarge"
    ? copy.scan.rejected.tooLarge(MAX_IMAGE_MB)
    : copy.scan.rejected[rejection];
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rejection, setRejection] = useState<ImageRejection | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  const clearPreview = useCallback(() => {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, []);

  useEffect(() => clearPreview, [clearPreview]);

  const reject = useCallback(
    (reason: ImageRejection) => {
      clearPreview();
      setRejection(reason);
      setStage("idle");
    },
    [clearPreview],
  );

  function handlePick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Allow re-picking the same file, which otherwise fires no change event.
    event.target.value = "";

    // Dismissing the picker is a change of mind, not a mistake to report.
    if (!file) return;

    // Stands in for the real preparation step, which will also convert HEIC,
    // fix EXIF rotation, and downscale before anything is uploaded.
    const problem = validateImageFile(file);
    if (problem) {
      reject(problem);
      return;
    }

    clearPreview();
    setRejection(null);
    setPreviewUrl(URL.createObjectURL(file));
    setStage("preview");
  }

  function analyze() {
    if (!previewUrl) {
      reject("missing");
      return;
    }

    setStepIndex(0);
    setStage("processing");
  }

  useEffect(() => {
    if (stage !== "processing") return;

    const ticker = setInterval(() => {
      setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
    }, STEP_MS);

    const done = setTimeout(() => {
      router.push(`/quest/${questId}?grade=${grade}&skill=${skill.id}`);
    }, STEP_MS * STEPS.length);

    return () => {
      clearInterval(ticker);
      clearTimeout(done);
    };
  }, [stage, router, questId, grade, skill.id]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <SectionLabel accent={skill.accent}>
          Grade {grade} · {skill.label}
        </SectionLabel>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-cream sm:text-4xl">
          {rejection ? copy.scan.rejectedHeading : copy.scan.heading}
        </h1>
        <p
          role={rejection ? "alert" : undefined}
          className="mt-3 max-w-lg text-sm leading-relaxed text-muted sm:text-base"
        >
          {rejection ? (
            rejectionBody(rejection)
          ) : (
            <>
              {copy.scan.lookForLead(skill.label.toLowerCase())}
              <span className="text-cream">{skill.lookFor}</span>.
            </>
          )}
        </p>
      </div>

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

      {stage === "preview" ? (
        <div className="flex flex-col gap-3">
          <Button size="lg" onClick={analyze} className="w-full">
            Find the math
            <ArrowRightIcon className="size-5" />
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
