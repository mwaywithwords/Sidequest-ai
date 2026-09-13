"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { SparkIcon } from "@/components/ui/icons";
import type { EvidenceRequestType } from "@/lib/ai/schemas";
import type { CluePresentation } from "@/lib/clue";
import { copy } from "@/lib/copy";

export type ClueCollection =
  | { status: "idle" }
  | { status: "entering" }
  | { status: "photo"; previewUrl: string }
  | { status: "value"; value: string };

/**
 * The student-facing face of a live investigation.
 *
 * This is progress, not a detour: lime accent, spark, and the same card
 * language as the rest of the product. It never receives a reason code.
 */
export function CluePanel({
  questId,
  presentation,
  type,
  accent,
  collection,
  onAddPhoto,
  onStartEntry,
  onSaveEntry,
  onChangeObject,
}: {
  /** The pending quest this clue belongs to. Ready for the next evidence step. */
  questId: string;
  presentation: CluePresentation;
  type: EvidenceRequestType;
  accent: string;
  collection: ClueCollection;
  onAddPhoto: () => void;
  onStartEntry: () => void;
  onSaveEntry: (value: string) => void;
  onChangeObject: () => void;
}) {
  return (
    <Card accent={accent} className="animate-rise p-5 sm:p-8">
      <span hidden data-quest-id={questId} />
      <div className="flex items-center gap-2">
        <SparkIcon className="size-6" style={{ color: accent }} />
        <SectionLabel accent={accent}>{presentation.title}</SectionLabel>
      </div>

      <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-cream sm:text-4xl">
        {presentation.heading}
      </h1>

      <p className="mt-4 max-w-lg text-base leading-relaxed text-cream/90 sm:text-lg">
        {presentation.investigate}
      </p>

      <p className="mt-5 max-w-lg text-lg font-medium leading-relaxed text-cream sm:text-xl">
        {presentation.prompt}
      </p>

      <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
        {presentation.reason}
      </p>

      <div className="mt-8 flex flex-col gap-3">
        <ClueAction
          type={type}
          presentation={presentation}
          collection={collection}
          onAddPhoto={onAddPhoto}
          onStartEntry={onStartEntry}
          onSaveEntry={onSaveEntry}
        />

        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="w-full sm:w-auto"
          onClick={onChangeObject}
        >
          {copy.clue.anotherObject}
        </Button>
      </div>
    </Card>
  );
}

function ClueAction({
  type,
  presentation,
  collection,
  onAddPhoto,
  onStartEntry,
  onSaveEntry,
}: {
  type: EvidenceRequestType;
  presentation: CluePresentation;
  collection: ClueCollection;
  onAddPhoto: () => void;
  onStartEntry: () => void;
  onSaveEntry: (value: string) => void;
}) {
  if (collection.status === "photo") {
    return (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm leading-relaxed text-cream sm:text-base">
          {copy.clue.photoReady}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={collection.previewUrl}
          alt={copy.scan.previewAlt}
          className="size-16 shrink-0 rounded-xl object-cover ring-1 ring-hair"
        />
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={onAddPhoto}
          className="w-full sm:w-auto"
        >
          {presentation.replaceCta}
        </Button>
      </div>
    );
  }

  if (collection.status === "value") {
    return (
      <p className="text-sm leading-relaxed text-cream sm:text-base">
        {copy.clue.valueReady}
        <span className="mt-1 block font-medium text-cream">
          {collection.value}
        </span>
      </p>
    );
  }

  if (type === "second_photo") {
    return (
      <Button type="button" size="lg" className="w-full" onClick={onAddPhoto}>
        {presentation.cta}
      </Button>
    );
  }

  if (collection.status === "entering") {
    return (
      <ClueEntry
        type={type}
        prompt={presentation.prompt}
        onSaveEntry={onSaveEntry}
      />
    );
  }

  return (
    <Button type="button" size="lg" className="w-full" onClick={onStartEntry}>
      {presentation.cta}
    </Button>
  );
}

function ClueEntry({
  type,
  prompt,
  onSaveEntry,
}: {
  type: Exclude<EvidenceRequestType, "second_photo">;
  prompt: string;
  onSaveEntry: (value: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const ready = draft.trim().length > 0;

  return (
    <div className="flex flex-col gap-3">
      <label className="sr-only" htmlFor="clue-entry">
        {prompt}
      </label>
      <input
        id="clue-entry"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        inputMode={type === "student_count" ? "numeric" : "text"}
        placeholder={placeholderFor(type)}
        autoComplete="off"
        className="min-h-14 w-full rounded-tile bg-void/60 px-5 text-base text-cream ring-1 ring-hair placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
      />
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!ready}
        onClick={() => onSaveEntry(draft.trim())}
      >
        {copy.clue.saveClue}
      </Button>
    </div>
  );
}

function placeholderFor(
  type: Exclude<EvidenceRequestType, "second_photo">,
): string {
  if (type === "student_measurement") return copy.clue.measurementPlaceholder;
  if (type === "student_count") return copy.clue.countPlaceholder;
  return copy.clue.inputPlaceholder;
}
