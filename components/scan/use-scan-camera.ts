"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isLiveVideoReady,
  readCameraPermissionState,
  reduceCamera,
  requestCameraStream,
  shouldAutoStartCamera,
  shouldMarkDeniedWithoutPrompt,
  stopCameraStream,
  type CameraPermissionState,
  type CameraStatus,
} from "@/lib/camera";

type CameraLog = {
  stage: "permission" | "retry" | "stream" | "playback" | "capture";
  status: string;
  videoTracks?: number;
};

function logCamera(info: CameraLog) {
  if (process.env.NODE_ENV === "production") return;
  console.info("[camera]", info);
}

function browserGetUserMedia(constraints: MediaStreamConstraints) {
  const media = navigator.mediaDevices;
  if (!media?.getUserMedia) {
    const error = new Error("Camera is not available");
    error.name = "NotFoundError";
    return Promise.reject(error);
  }
  return media.getUserMedia(constraints);
}

async function queryCameraPermission(): Promise<CameraPermissionState> {
  const permissions = navigator.permissions;
  if (!permissions?.query) return "unknown";

  try {
    const result = await permissions.query({
      name: "camera" as PermissionName,
    });
    return readCameraPermissionState(result.state);
  } catch {
    return "unknown";
  }
}

function clearVideo(video: HTMLVideoElement | null) {
  if (!video) return;
  video.pause();
  video.srcObject = null;
}

async function snapshotFrame(video: HTMLVideoElement): Promise<File | null> {
  if (!isLiveVideoReady(video)) return null;

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.92);
  });
  if (!blob) return null;

  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

/**
 * Live Scan camera. Permission prompts only happen from a user gesture
 * unless the browser already granted camera access.
 */
export function useScanCamera(active: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const statusRef = useRef<CameraStatus>("idle");
  const startLock = useRef(false);
  const generation = useRef(0);
  const [status, setStatus] = useState<CameraStatus>("idle");

  const setCameraStatus = useCallback((next: CameraStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const teardown = useCallback(() => {
    stopCameraStream(streamRef.current);
    streamRef.current = null;
    clearVideo(videoRef.current);
  }, []);

  const start = useCallback(async () => {
    if (!active || startLock.current) return;

    const attempt = generation.current + 1;
    generation.current = attempt;
    startLock.current = true;
    setCameraStatus(reduceCamera(statusRef.current, { type: "start_requested" }));
    logCamera({ stage: "retry", status: "started" });

    const result = await requestCameraStream({
      previous: streamRef.current,
      getUserMedia: browserGetUserMedia,
    });

    if (attempt !== generation.current) {
      if (result.ok) stopCameraStream(result.stream);
      return;
    }

    streamRef.current = null;
    clearVideo(videoRef.current);

    if (!result.ok) {
      startLock.current = false;
      setCameraStatus(
        reduceCamera(statusRef.current, {
          type: "stream_failed",
          failure: result.status,
        }),
      );
      logCamera({
        stage: "permission",
        status: result.status === "permission_denied" ? "denied" : result.status,
      });
      return;
    }

    streamRef.current = result.stream;
    setCameraStatus(
      reduceCamera(statusRef.current, {
        type: "stream_ready",
        videoTracks: result.videoTracks,
      }),
    );
    logCamera({
      stage: "stream",
      status: "ready",
      videoTracks: result.videoTracks,
    });

    const video = videoRef.current;
    if (!video) {
      teardown();
      startLock.current = false;
      setCameraStatus(
        reduceCamera(statusRef.current, { type: "playback_failed" }),
      );
      logCamera({ stage: "playback", status: "failed" });
      return;
    }

    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.srcObject = result.stream;

    try {
      await video.play();
      if (!isLiveVideoReady(video)) {
        await new Promise<void>((resolve) => {
          const finish = () => {
            video.removeEventListener("loadedmetadata", finish);
            resolve();
          };
          if (isLiveVideoReady(video)) {
            resolve();
            return;
          }
          video.addEventListener("loadedmetadata", finish, { once: true });
          window.setTimeout(finish, 400);
        });
      }

      if (attempt !== generation.current) {
        teardown();
        return;
      }

      if (!isLiveVideoReady(video)) {
        teardown();
        setCameraStatus(
          reduceCamera(statusRef.current, { type: "playback_failed" }),
        );
        logCamera({ stage: "playback", status: "failed" });
        startLock.current = false;
        return;
      }

      setCameraStatus(
        reduceCamera(statusRef.current, { type: "playback_ready" }),
      );
      logCamera({
        stage: "playback",
        status: "ready",
        videoTracks: result.videoTracks,
      });
    } catch {
      if (attempt !== generation.current) return;
      teardown();
      setCameraStatus(
        reduceCamera(statusRef.current, { type: "playback_failed" }),
      );
      logCamera({ stage: "playback", status: "failed" });
    }

    startLock.current = false;
  }, [active, setCameraStatus, teardown]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || statusRef.current !== "ready") return null;
    const file = await snapshotFrame(video);
    logCamera({
      stage: "capture",
      status: file ? "ready" : "failed",
    });
    return file;
  }, []);

  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (!active && status !== "idle") {
      setStatus("idle");
    }
  }

  useEffect(() => {
    if (!active) {
      generation.current += 1;
      teardown();
      startLock.current = false;
      return;
    }

    let cancelled = false;

    void (async () => {
      const permission = await queryCameraPermission();
      if (cancelled) return;

      logCamera({ stage: "permission", status: permission });

      if (shouldMarkDeniedWithoutPrompt(permission)) {
        setCameraStatus("permission_denied");
        return;
      }

      if (shouldAutoStartCamera(permission)) {
        await startRef.current();
      }
    })();

    return () => {
      cancelled = true;
      generation.current += 1;
      teardown();
      startLock.current = false;
    };
  }, [active, setCameraStatus, teardown]);

  useEffect(() => {
    if (!active) return;

    function onVisibility() {
      if (document.visibilityState !== "hidden") return;
      const next = reduceCamera(statusRef.current, { type: "visibility_hidden" });
      if (next === statusRef.current) return;
      generation.current += 1;
      teardown();
      setCameraStatus(next);
      startLock.current = false;
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, setCameraStatus, teardown]);

  return { status, videoRef, start, capture };
}
