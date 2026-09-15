/**
 * Camera permission and preview policy for Scan.
 *
 * This module classifies getUserMedia outcomes and decides what the
 * viewfinder may show. It does not talk to the browser camera itself.
 */

export type CameraStatus =
  | "idle"
  | "requesting"
  | "ready"
  | "permission_denied"
  | "unavailable"
  | "playback_failed";

export type CameraFailureStatus = Extract<
  CameraStatus,
  "permission_denied" | "unavailable" | "playback_failed"
>;

export type CameraSurface = "placeholder" | "requesting" | "live" | "recovery";

export type TakePhotoAction =
  | "capture"
  | "request"
  | "retry"
  | "fallback_capture"
  | "wait";

export type CameraPermissionState = "granted" | "denied" | "prompt" | "unknown";

export type CameraEvent =
  | { type: "start_requested" }
  | { type: "permission_blocked" }
  | { type: "stream_ready"; videoTracks: number }
  | { type: "stream_failed"; failure: CameraFailureStatus }
  | { type: "playback_ready" }
  | { type: "playback_failed" }
  | { type: "stopped" }
  | { type: "visibility_hidden" };

export const CAMERA_CONSTRAINTS_PREFERRED: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: { ideal: "environment" } },
};

export const CAMERA_CONSTRAINTS_RELAXED: MediaStreamConstraints = {
  audio: false,
  video: true,
};

export function classifyCameraError(error: unknown): CameraFailureStatus {
  const name = errorName(error);

  if (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    name === "PermissionDismissedError"
  ) {
    return "permission_denied";
  }

  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
    return "playback_failed";
  }

  return "unavailable";
}

export function shouldRelaxConstraints(error: unknown): boolean {
  return errorName(error) === "OverconstrainedError" || errorName(error) === "ConstraintNotSatisfiedError";
}

export function readCameraPermissionState(state: string | null | undefined): CameraPermissionState {
  if (state === "granted" || state === "denied" || state === "prompt") return state;
  return "unknown";
}

export function shouldAutoStartCamera(permission: CameraPermissionState): boolean {
  return permission === "granted";
}

export function shouldMarkDeniedWithoutPrompt(permission: CameraPermissionState): boolean {
  return permission === "denied";
}

export function reduceCamera(status: CameraStatus, event: CameraEvent): CameraStatus {
  switch (event.type) {
    case "start_requested":
      return "requesting";
    case "permission_blocked":
      return "permission_denied";
    case "stream_ready":
      return event.videoTracks > 0 ? "requesting" : "unavailable";
    case "stream_failed":
      return event.failure;
    case "playback_ready":
      return "ready";
    case "playback_failed":
      return "playback_failed";
    case "stopped":
      return keepBlocked(status);
    case "visibility_hidden":
      return keepBlocked(status);
    default:
      return status;
  }
}

export function cameraSurface(status: CameraStatus): CameraSurface {
  if (status === "ready") return "live";
  if (status === "requesting") return "requesting";
  if (
    status === "permission_denied" ||
    status === "unavailable" ||
    status === "playback_failed"
  ) {
    return "recovery";
  }
  return "placeholder";
}

export function showsLivePreview(status: CameraStatus): boolean {
  return cameraSurface(status) === "live";
}

export function takePhotoAction(status: CameraStatus): TakePhotoAction {
  if (status === "ready") return "capture";
  if (status === "requesting") return "wait";
  if (status === "idle") return "request";
  if (status === "unavailable") return "fallback_capture";
  return "retry";
}

export function photoLibraryAvailable(_status: CameraStatus = "idle"): true {
  void _status;
  return true;
}

export function usesRetryPrimary(status: CameraStatus): boolean {
  return status === "permission_denied" || status === "playback_failed";
}

export function showsBlockedHint(status: CameraStatus): boolean {
  return status === "permission_denied";
}

export function isLiveVideoReady(input: {
  videoWidth: number;
  videoHeight: number;
}): boolean {
  return input.videoWidth > 0 && input.videoHeight > 0;
}

export function countLiveVideoTracks(stream: {
  getVideoTracks: () => readonly { readyState?: string }[];
}): number {
  return stream
    .getVideoTracks()
    .filter((track) => track.readyState !== "ended")
    .length;
}

export function stopCameraStream(stream: {
  getTracks: () => readonly { stop: () => void }[];
} | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export async function requestCameraStream<
  TStream extends {
    getTracks: () => readonly { stop: () => void }[];
    getVideoTracks: () => readonly { readyState?: string }[];
  },
>(input: {
  previous?: { getTracks: () => readonly { stop: () => void }[] } | null;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<TStream>;
}): Promise<
  | { ok: true; stream: TStream; videoTracks: number }
  | { ok: false; status: CameraFailureStatus }
> {
  stopCameraStream(input.previous ?? null);

  try {
    const stream = await input.getUserMedia(CAMERA_CONSTRAINTS_PREFERRED);
    const videoTracks = countLiveVideoTracks(stream);
    if (videoTracks === 0) {
      stopCameraStream(stream);
      return { ok: false, status: "unavailable" };
    }
    return { ok: true, stream, videoTracks };
  } catch (error) {
    if (!shouldRelaxConstraints(error)) {
      return { ok: false, status: classifyCameraError(error) };
    }

    try {
      const stream = await input.getUserMedia(CAMERA_CONSTRAINTS_RELAXED);
      const videoTracks = countLiveVideoTracks(stream);
      if (videoTracks === 0) {
        stopCameraStream(stream);
        return { ok: false, status: "unavailable" };
      }
      return { ok: true, stream, videoTracks };
    } catch (relaxedError) {
      return { ok: false, status: classifyCameraError(relaxedError) };
    }
  }
}

function keepBlocked(status: CameraStatus): CameraStatus {
  if (
    status === "permission_denied" ||
    status === "unavailable" ||
    status === "playback_failed"
  ) {
    return status;
  }
  return "idle";
}

function errorName(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    const name = (error as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}
