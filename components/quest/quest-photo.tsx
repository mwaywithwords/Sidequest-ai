"use client";

import { useState } from "react";
import { CameraIcon } from "@/components/ui/icons";
import { ViewfinderCorners } from "@/components/ui/play";
import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";
import type { QuestPhoto } from "@/lib/quest-present";

type PhotoSize = "hero" | "companion" | "remnant";

const SIZES: Record<PhotoSize, string> = {
  hero: "min-h-[16rem] max-h-[min(22rem,52dvh)] sm:min-h-[20rem] sm:max-h-[26rem]",
  companion: "min-h-[10rem] max-h-[16rem] sm:min-h-[13rem] sm:max-h-[18rem]",
  remnant: "min-h-[4.75rem] w-24 sm:min-h-[5.5rem] sm:w-28",
};

/**
 * The student's photograph, framed with SIDEQUEST corners.
 * Signed URL in, no storage credentials. An expired or
 * broken URL falls back to the empty frame instead of a dead image.
 */
export function QuestPhotoFrame({
  photo,
  accent,
  size,
  className,
}: {
  photo: QuestPhoto | null;
  accent: string;
  size: PhotoSize;
  className?: string;
}) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const visible = photo !== null && photo.url !== brokenUrl;

  return (
    <div
      className={cn(
        "photo-frame relative flex items-center justify-center",
        size === "hero" && "animate-discover",
        SIZES[size],
        className,
      )}
    >
      <ViewfinderCorners accent={accent} />
      {visible ? (
        // Signed URL from the private bucket: short-lived, not a next/image host.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.url}
          alt={photo.alt}
          onError={() => setBrokenUrl(photo.url)}
          className="max-h-[32rem] w-full object-contain"
        />
      ) : (
        <div className="px-8 text-center">
          <CameraIcon className="mx-auto size-10 text-faint" />
          <p className="mt-3 text-sm font-bold text-faint">
            {copy.quest.experience.photoMissing}
          </p>
        </div>
      )}
    </div>
  );
}
