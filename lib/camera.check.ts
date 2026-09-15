/**
 * Scan camera permission and preview checks.
 *
 * Run with: npx tsx lib/camera.check.ts
 *
 * These do not open a device camera. They confirm a denied permission
 * never looks like a live preview, and that Choose from Photos stays open.
 */

import {
  cameraSurface,
  classifyCameraError,
  countLiveVideoTracks,
  isLiveVideoReady,
  photoLibraryAvailable,
  readCameraPermissionState,
  reduceCamera,
  requestCameraStream,
  shouldAutoStartCamera,
  shouldMarkDeniedWithoutPrompt,
  shouldRelaxConstraints,
  showsBlockedHint,
  showsLivePreview,
  stopCameraStream,
  takePhotoAction,
  usesRetryPrimary,
  type CameraStatus,
} from "@/lib/camera";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

function namedError(name: string) {
  const error = new Error(name);
  error.name = name;
  return error;
}

check(
  "permission granted becomes a live preview after playback",
  reduceCamera("requesting", { type: "playback_ready" }) === "ready" &&
    showsLivePreview("ready") === true &&
    cameraSurface("ready") === "live",
);

check(
  "permission denied is not a black fake-ready preview",
  cameraSurface("permission_denied") === "recovery" &&
    showsLivePreview("permission_denied") === false &&
    cameraSurface("permission_denied") !== "live",
);

check(
  "permission denied uses the recovery surface",
  cameraSurface("permission_denied") === "recovery" &&
    showsBlockedHint("permission_denied") === true,
);

check(
  "Choose from Photos stays available when permission is denied",
  photoLibraryAvailable("permission_denied") === true &&
    photoLibraryAvailable("unavailable") === true &&
    photoLibraryAvailable("ready") === true,
);

check(
  "Take a Photo while denied retries instead of capturing",
  takePhotoAction("permission_denied") === "retry" &&
    takePhotoAction("ready") === "capture" &&
    takePhotoAction("idle") === "request",
);

check(
  "Try Camera Again is the primary action after a denial",
  usesRetryPrimary("permission_denied") === true &&
    usesRetryPrimary("ready") === false,
);

check(
  "retry starts a fresh requesting state",
  reduceCamera("permission_denied", { type: "start_requested" }) === "requesting",
);

check(
  "retry success becomes ready after playback",
  reduceCamera(
    reduceCamera("permission_denied", { type: "start_requested" }),
    { type: "playback_ready" },
  ) === "ready",
);

check(
  "retry denied again stays in recovery",
  reduceCamera("requesting", {
    type: "stream_failed",
    failure: "permission_denied",
  }) === "permission_denied" &&
    cameraSurface("permission_denied") === "recovery",
);

check(
  "NotAllowedError is permission denied",
  classifyCameraError(namedError("NotAllowedError")) === "permission_denied",
);

check(
  "NotFoundError is unavailable, not ready",
  classifyCameraError(namedError("NotFoundError")) === "unavailable" &&
    showsLivePreview("unavailable") === false,
);

check(
  "NotReadableError is a playback failure",
  classifyCameraError(namedError("NotReadableError")) === "playback_failed",
);

check(
  "OverconstrainedError can relax constraints",
  shouldRelaxConstraints(namedError("OverconstrainedError")) === true &&
    classifyCameraError(namedError("SecurityError")) === "unavailable",
);

check(
  "unsupported camera uses a useful fallback capture",
  takePhotoAction("unavailable") === "fallback_capture" &&
    photoLibraryAvailable("unavailable") === true,
);

check(
  "a site that already blocked camera can skip the prompt",
  shouldMarkDeniedWithoutPrompt("denied") === true &&
    shouldAutoStartCamera("granted") === true &&
    shouldAutoStartCamera("unknown") === false,
);

check(
  "unknown iOS permission state is not treated as denied",
  readCameraPermissionState("prompt") === "prompt" &&
    readCameraPermissionState(undefined) === "unknown" &&
    shouldMarkDeniedWithoutPrompt("unknown") === false,
);

check(
  "live video is ready only with real dimensions",
  isLiveVideoReady({ videoWidth: 1280, videoHeight: 720 }) === true &&
    isLiveVideoReady({ videoWidth: 0, videoHeight: 0 }) === false,
);

check(
  "a requesting camera does not spam another permission prompt",
  takePhotoAction("requesting") === "wait",
);

check(
  "hiding the page does not clear an explicit denial",
  reduceCamera("permission_denied", { type: "visibility_hidden" }) ===
    "permission_denied",
);

check(
  "hiding a ready camera leaves idle, not a dead live preview",
  reduceCamera("ready", { type: "visibility_hidden" }) === "idle" &&
    showsLivePreview("idle") === false,
);

const statuses: CameraStatus[] = [
  "idle",
  "requesting",
  "ready",
  "permission_denied",
  "unavailable",
  "playback_failed",
];
check(
  "photo-library flow is never blocked by camera permission",
  statuses.every((status) => photoLibraryAvailable(status)),
);

const ended = {
  getVideoTracks: () => [{ readyState: "ended" as const }],
};
check("ended tracks do not count as live", countLiveVideoTracks(ended) === 0);

const halt = { stopped: false };
stopCameraStream({
  getTracks: () => [
    {
      stop: () => {
        halt.stopped = true;
      },
    },
  ],
});
check("stopCameraStream stops every track", halt.stopped === true);
stopCameraStream(null);
check("stopping a missing stream is safe", true);

async function run() {
  const order: string[] = [];
  const stale = {
    getTracks: () => [
      {
        stop: () => {
          order.push("stop");
        },
      },
    ],
    getVideoTracks: () => [{ readyState: "live" }],
  };
  const fresh = {
    getTracks: () => [{ stop: () => undefined }],
    getVideoTracks: () => [{ readyState: "live" }],
  };

  const retry = await requestCameraStream({
    previous: stale,
    getUserMedia: async () => {
      order.push("request");
      return fresh;
    },
  });

  check(
    "retry requests a fresh stream after stopping the old one",
    retry.ok === true && retry.videoTracks === 1 && order.join(" ") === "stop request",
  );

  const empty = await requestCameraStream({
    getUserMedia: async () => ({
      getTracks: () => [{ stop: () => undefined }],
      getVideoTracks: () => [],
    }),
  });
  check(
    "a stream with no video tracks is unavailable, not ready",
    empty.ok === false && empty.status === "unavailable",
  );

  const denied = await requestCameraStream({
    getUserMedia: async () => {
      throw namedError("NotAllowedError");
    },
  });
  check(
    "a denied getUserMedia stays in recovery and never reports ready",
    denied.ok === false && denied.status === "permission_denied",
  );

  if (failed > 0) {
    console.error(`\n${failed} camera checks failed`);
    process.exit(1);
  }

  console.log("\nall camera checks passed");
}

void run();
