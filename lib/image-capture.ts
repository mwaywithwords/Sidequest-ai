/**
 * The rules a photo has to pass before it enters the challenge flow.
 *
 * The file inputs themselves stay on `accept="image/*"`, because that is the
 * hint phones use to offer the camera and the photo library. `accept` is only
 * a filter on the picker, so this is the check that actually decides.
 *
 * Shared by the browser and the upload Route Handler. The browser runs it to
 * give the student a fast, specific answer; the server runs the same code
 * again because a request can arrive without ever passing through the UI.
 */

/**
 * Accepted formats, and the extension each one is stored under.
 *
 * Camera and photo-library types only. HEIC is included because iPhones shoot
 * in it: Safari usually converts to JPEG on the way out of a file input, but
 * not on every path, and rejecting a photo the student just took would be
 * wrong.
 */
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

const ACCEPTED_IMAGE_TYPES: readonly string[] = Object.keys(IMAGE_EXTENSIONS);

/**
 * The largest file accepted from the picker. A 48-megapixel phone photo lands
 * around 8 MB, so this clears real camera output while stopping a video-sized
 * file from being decoded.
 *
 * This is not the upload budget. A photo this size is normalised down by
 * lib/image-prepare.ts long before it reaches the network.
 */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export const MAX_IMAGE_MB = MAX_IMAGE_BYTES / (1024 * 1024);

/**
 * The largest body the upload endpoint accepts.
 *
 * Vercel rejects function request bodies over roughly 4.5 MB at the edge, so
 * the trust boundary stops short of that and returns its own answer rather
 * than letting the platform hand back an opaque 413. Preparation aims at half
 * of this again.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export type ImageRejection = "missing" | "unsupported" | "tooLarge";

/**
 * `maxBytes` differs by side of the wire. The browser checks the file the
 * student picked, which may be a full-size camera photo; the server checks the
 * normalised body that actually arrived.
 */
export function validateImageFile(
  file: File | null | undefined,
  maxBytes: number = MAX_IMAGE_BYTES,
): ImageRejection | null {
  if (!file) return "missing";

  // A zero-byte read is as unusable as the wrong format, so it fails the same
  // way: there is nothing the student can do differently except pick again.
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type) || file.size === 0) {
    return "unsupported";
  }

  if (file.size > maxBytes) return "tooLarge";

  return null;
}

/**
 * The extension a validated image is stored under, taken from its MIME type
 * rather than its filename. The filename arrives from the client and can claim
 * anything, including a path; the type is what `validateImageFile` checked.
 *
 * Returns null for a type outside the allowlist, which `validateImageFile`
 * would already have rejected.
 */
export function imageExtension(type: string): string | null {
  return IMAGE_EXTENSIONS[type] ?? null;
}
