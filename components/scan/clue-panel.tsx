"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
 * This is progress, not a detour: lime accent, spark, and the same game
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
    <div className="animate-rise text-center">
      <span hidden data-quest-id={questId} />
      <div className="flex items-center justify-center gap-2">
        <SparkIcon className="size-5" style={{ color: accent }} />
        <p
          className="game-moment accent-ink"
          style={{ ["--accent" as string]: accent }}
        >
          {presentation.title}
        </p>
      </div>

      <h1 className="game-title mt-3">{presentation.heading}</h1>

      <p className="mx-auto mt-3 game-support text-cream">
        {presentation.investigate}
      </p>

      <p className="mx-auto mt-4 max-w-sm text-lg font-extrabold leading-snug text-cream">
        {presentation.prompt}
      </p>

      <p className="mx-auto mt-2 game-support">{presentation.reason}</p>

      <div className="game-actions mt-6">
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
          size="md"
          className="w-full"
          onClick={onChangeObject}
        >
          {copy.clue.anotherObject}
        </Button>
      </div>
    </div>
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
      <div className="flex flex-col items-center gap-3">
        <p className="game-support">{copy.clue.photoReady}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={collection.previewUrl}
          alt={copy.scan.previewAlt}
          className="h-24 w-24 rounded-2xl object-cover"
          style={{ boxShadow: "0 6px 0 var(--frame-shelf)" }}
        />
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={onAddPhoto}
          className="w-full"
        >
          {presentation.replaceCta}
        </Button>
      </div>
    );
  }

  if (collection.status === "value") {
    return (
      <p className="game-support text-cream">
        {copy.clue.valueReady}
        <span className="mt-1 block font-display text-xl font-extrabold text-cream">
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
        className="game-input text-base"
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
