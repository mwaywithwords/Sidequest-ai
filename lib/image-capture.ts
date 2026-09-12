/**
 * The rules a photo has to pass before it enters the challenge flow.
 *
 * The file inputs themselves stay on `accept="image/*"`, because that is the
 * hint phones use to offer the camera and the photo library. `accept` is only
 * a filter on the picker, so this is the check that actually decides.
 */

/**
 * Camera and photo-library formats. HEIC is included because iPhones shoot in
 * it: Safari usually converts to JPEG on the way out of a file input, but not
 * on every path, and rejecting a photo the student just took would be wrong.
 */
const ACCEPTED_IMAGE_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

/**
 * A 48-megapixel phone photo lands around 8 MB, so this clears real camera
 * output while stopping a video-sized file from being held in memory.
 */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export const MAX_IMAGE_MB = MAX_IMAGE_BYTES / (1024 * 1024);

export type ImageRejection = "missing" | "unsupported" | "tooLarge";

export function validateImageFile(
  file: File | null | undefined,
): ImageRejection | null {
  if (!file) return "missing";

  // A zero-byte read is as unusable as the wrong format, so it fails the same
  // way: there is nothing the student can do differently except pick again.
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type) || file.size === 0) {
    return "unsupported";
  }

  if (file.size > MAX_IMAGE_BYTES) return "tooLarge";

  return null;
}
