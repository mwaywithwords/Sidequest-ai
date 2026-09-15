"use client";

import { useEffect, useState } from "react";
import { DiceIcon, SearchIcon } from "@/components/ui/icons";
import { copy } from "@/lib/copy";
import {
  nextHuntStart,
  suggestionsForSkill,
  surpriseSuggestion,
  type PhotoSuggestion,
} from "@/lib/photo-suggestions";
import type { Grade, SkillId } from "@/lib/types";

/**
 * Playful scavenger-hunt ideas on Scan. Presentation only: tapping
 * Surprise Me never starts a quest, never calls AI, and never changes
 * whether a later photograph is accepted.
 */
export function HuntIdeas({
  skillId,
  grade,
  accent,
  recentIds,
  onRemember,
}: {
  skillId: SkillId;
  grade: Grade;
  accent: string;
  recentIds: readonly string[];
  onRemember: (ids: readonly string[]) => void;
}) {
  const [items] = useState(() =>
    suggestionsForSkill(skillId, {
      grade,
      excludeIds: recentIds,
      count: 3,
      start: nextHuntStart(recentIds, 8),
    }),
  );
  const [surprise, setSurprise] = useState<PhotoSuggestion | null>(null);
  const [surpriseSalt, setSurpriseSalt] = useState(0);

  useEffect(() => {
    onRemember(items.map((item) => item.id));
    // Remember the visible set once per mount. Skill changes remount via key.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only persist
  }, []);

  function revealSurprise() {
    const hidden = [
      ...items.map((item) => item.id),
      ...(surprise ? [surprise.id] : []),
    ];
    const next = surpriseSuggestion(skillId, {
      grade,
      hiddenIds: hidden,
      start: items.length + surpriseSalt,
    });
    setSurprise(next);
    setSurpriseSalt((value) => value + 1);
    onRemember([...items.map((item) => item.id), next.id]);
  }

  return (
    <section
      className="hunt-ideas"
      style={{ ["--accent" as string]: accent }}
      aria-label={copy.scan.needAnIdea}
    >
      <p className="game-moment hunt-ideas-heading">{copy.scan.needAnIdea}</p>
      <p className="sr-only">{copy.scan.huntNote}</p>
      <ul className="hunt-chip-row">
        {items.map((item) => (
          <li key={item.id}>
            <p className="hunt-chip">
              <span aria-hidden className="hunt-chip-icon">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </p>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="hunt-surprise"
        onClick={revealSurprise}
        aria-label={
          surprise
            ? copy.scan.surpriseFind(
                `${surprise.article} ${surprise.shortName.toUpperCase()}`,
              )
            : copy.scan.surpriseMeAria
        }
      >
        {surprise ? <SearchIcon className="size-5" /> : <DiceIcon className="size-5" />}
        <span>
          {surprise
            ? copy.scan.surpriseFind(
                `${surprise.article} ${surprise.shortName.toUpperCase()}`,
              )
            : copy.scan.surpriseMe}
        </span>
      </button>
    </section>
  );
}
