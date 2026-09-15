"use client";

import type { Ref } from "react";
import { CameraIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import {
  cameraSurface,
  showsBlockedHint,
  type CameraStatus,
} from "@/lib/camera";
import { copy } from "@/lib/copy";

export function CameraWell({
  status,
  videoRef,
  hasPhoto,
  rejection,
}: {
  status: CameraStatus;
  videoRef: Ref<HTMLVideoElement>;
  hasPhoto: boolean;
  rejection: boolean;
}) {
  const surface = cameraSurface(status);
  const recovery =
    status === "permission_denied"
      ? {
          heading: copy.scan.cameraNeededHeading,
          body: copy.scan.cameraNeededBody,
        }
      : status === "playback_failed"
        ? {
            heading: copy.scan.cameraPlaybackHeading,
            body: copy.scan.cameraPlaybackBody,
          }
        : status === "unavailable"
          ? {
              heading: copy.scan.cameraUnavailableHeading,
              body: copy.scan.cameraUnavailableBody,
            }
          : null;

  return (
    <>
      <video
        ref={videoRef}
        className={cn(
          "scan-live",
          surface === "live" && !hasPhoto ? "is-on" : "is-off",
        )}
        muted
        playsInline
        autoPlay
        aria-hidden={surface !== "live" || hasPhoto}
      />

      {hasPhoto || surface === "live" ? null : surface === "requesting" ? (
        <div className="scan-camera-copy" role="status" aria-live="polite">
          <CameraIcon className="mx-auto size-11" />
          <p className="mt-3 text-sm font-bold">{copy.scan.cameraRequesting}</p>
        </div>
      ) : recovery ? (
        <div className="scan-camera-copy" role="alert">
          <CameraIcon className="mx-auto size-11" />
          <h2 className="mt-3">{recovery.heading}</h2>
          <p className="mt-2 text-sm font-medium leading-relaxed sm:text-base">
            {recovery.body}
          </p>
          {showsBlockedHint(status) ? (
            <p className="mt-2 text-xs font-medium leading-relaxed text-on-game/75 sm:text-sm">
              {copy.scan.cameraNeededHint}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="scan-camera-copy">
          <CameraIcon className="mx-auto size-11 opacity-70" />
          <p className="mt-3 text-sm font-bold">
            {rejection ? copy.scan.rejectedPreview : copy.scan.emptyPreview}
          </p>
        </div>
      )}
    </>
  );
}
