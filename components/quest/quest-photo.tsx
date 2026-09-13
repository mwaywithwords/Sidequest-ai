"use client";

import { useState } from "react";
import { CameraIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";
import type { QuestPhoto } from "@/lib/quest-present";

type PhotoSize = "hero" | "companion" | "remnant";

const SIZES: Record<PhotoSize, string> = {
  hero: "min-h-[19rem] sm:min-h-[24rem] md:min-h-[28rem]",
  companion: "min-h-[12rem] sm:min-h-[16rem] md:min-h-full",
  remnant: "min-h-[7.5rem] sm:min-h-[9rem]",
};

/**
 * The student's photograph, framed with the same viewfinder the scan
 * screen uses. Signed URL in, no storage credentials. An expired or
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
        "viewfinder relative flex items-center justify-center overflow-hidden rounded-tile bg-void/60 ring-1 ring-hair",
        SIZES[size],
        className,
      )}
      style={{ ["--color-lime" as string]: accent }}
    >
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
          <CameraIcon className="mx-auto size-9 text-faint" />
          <p className="mt-4 text-sm text-faint">
            {copy.quest.experience.photoMissing}
          </p>
        </div>
      )}
    </div>
  );
}
