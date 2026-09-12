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
import type { Grade, Skill } from "@/lib/types";

type Stage = "idle" | "preview" | "processing" | "rejected";

/** Roughly the cadence the real two-stage pipeline will run at. */
const STEP_MS = 750;

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
  const [stepIndex, setStepIndex] = useState(0);

  const steps = copy.scan.processingSteps(skill.label.toLowerCase());

  const clearPreview = useCallback(() => {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, []);

  useEffect(() => clearPreview, [clearPreview]);

  function handlePick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Allow re-picking the same file, which otherwise fires no change event.
    event.target.value = "";
    if (!file) return;

    clearPreview();

    // Stands in for the real preparation step, which will also convert HEIC,
    // fix EXIF rotation, and downscale before anything is uploaded.
    if (!file.type.startsWith("image/") || file.size === 0) {
      setStage("rejected");
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    setStage("preview");
  }

  function analyze() {
    setStepIndex(0);
    setStage("processing");
  }

  useEffect(() => {
    if (stage !== "processing") return;

    const ticker = setInterval(() => {
      setStepIndex((index) => Math.min(index + 1, steps.length - 1));
    }, STEP_MS);

    const done = setTimeout(() => {
      router.push(`/quest/${questId}?grade=${grade}`);
    }, STEP_MS * steps.length);

    return () => {
      clearInterval(ticker);
      clearTimeout(done);
    };
  }, [stage, router, questId, grade, steps.length]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <SectionLabel accent={skill.accent}>
          Grade {grade} · {skill.label}
        </SectionLabel>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-cream sm:text-4xl">
          {stage === "rejected" ? copy.scan.rejectedHeading : copy.scan.heading}
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
          {stage === "rejected" ? (
            copy.scan.rejectedBody
          ) : (
            <>
              {copy.scan.lookForLead(skill.label.toLowerCase())}
              <span className="text-cream">{skill.lookFor}</span>.
            </>
          )}
        </p>
      </div>

      <div className="viewfinder relative flex min-h-[19rem] items-center justify-center overflow-hidden rounded-tile bg-void/60 ring-1 ring-hair sm:min-h-[24rem]">
        {previewUrl && stage !== "rejected" ? (
          <>
            {/* A blob URL from the local camera: nothing for next/image to optimise. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={copy.scan.previewAlt}
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
              {stage === "rejected"
                ? copy.scan.rejectedPreview
                : copy.scan.emptyPreview}
            </p>
          </div>
        )}

        {stage === "processing" ? (
          <ProcessingOverlay message={steps[stepIndex]} accent={skill.accent} />
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
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button size="lg" onClick={analyze} className="w-full sm:flex-1">
            Find the math
            <ArrowRightIcon className="size-5" />
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => {
              clearPreview();
              setStage("idle");
            }}
            className="w-full sm:w-auto"
          >
            <RetryIcon className="size-5" />
            Retake
          </Button>
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
