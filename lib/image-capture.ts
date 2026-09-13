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

/**
 * Types phones actually send that are the same file as a name on the
 * allowlist. `image/jpg` is the common iOS spelling; `octet-stream` is
 * treated as unspecified further down, not as an alias.
 */
const TYPE_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
};

const EXTENSION_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

/** Formats the safety gate and the vision models can actually read. */
const MODEL_READABLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

export type InspectedUpload =
  | { ok: true; file: File; type: string; extension: string }
  | { ok: false; reason: ImageRejection };

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
  if (file.size === 0) return "unsupported";

  if (file.size > maxBytes) return "tooLarge";

  if (normalisedImageType(file) !== null) return null;

  // Some camera paths omit a MIME type or send `application/octet-stream`
  // with a generic filename. Blocking those would reject a photo the
  // student just took; the decoder and the server magic-byte check decide.
  if (isUnspecifiedType(file.type)) return null;

  return "unsupported";
}

/**
 * The MIME type we treat the file as, after folding phone aliases and a
 * filename extension. Returns null when nothing trustworthy is claimed —
 * not the same as refusing the file.
 */
export function normalisedImageType(
  file: Pick<File, "type" | "name">,
): string | null {
  const raw = file.type.trim().toLowerCase();

  if (raw && !isUnspecifiedType(raw)) {
    const aliased = TYPE_ALIASES[raw] ?? raw;
    return aliased in IMAGE_EXTENSIONS ? aliased : null;
  }

  const filename = file.name.trim().toLowerCase();
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return null;

  return EXTENSION_TYPES[filename.slice(dot + 1)] ?? null;
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

/**
 * Server-side inspection of an uploaded body.
 *
 * Type and size are checked first. Then the first bytes have to look like
 * a real JPEG, PNG, or WebP — a renamed document or a truncated camera
 * dump fails here, before anything is stored or handed to a model.
 *
 * HEIC is accepted from the picker so iPhone capture still works, but a
 * HEIC that reaches this function was not re-encoded by the browser, and
 * the models cannot read it.
 */
export async function inspectUploadedImage(
  file: File | null | undefined,
): Promise<InspectedUpload> {
  const problem = validateImageFile(file, MAX_UPLOAD_BYTES);
  if (problem !== null || file === null || file === undefined) {
    return { ok: false, reason: problem ?? "missing" };
  }

  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const detected = detectImageType(bytes);
  if (detected === null || !MODEL_READABLE_TYPES.has(detected)) {
    return { ok: false, reason: "unsupported" };
  }

  const claimed = normalisedImageType(file);
  if (claimed !== null && claimed !== detected && MODEL_READABLE_TYPES.has(claimed)) {
    return { ok: false, reason: "unsupported" };
  }

  const extension = imageExtension(detected);
  if (extension === null) {
    return { ok: false, reason: "unsupported" };
  }

  return {
    ok: true,
    file: new File([file], `photo.${extension}`, { type: detected }),
    type: detected,
    extension,
  };
}

/**
 * Reads the file signature, not the claimed type.
 *
 * Used by the upload boundary and the check file so a later format cannot
 * slip in without a matching test.
 */
export function detectImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
    if (brand === "heic" || brand === "heif" || brand === "mif1" || brand === "msf1") {
      return "image/heic";
    }
  }

  return null;
}

function isUnspecifiedType(type: string): boolean {
  const raw = type.trim().toLowerCase();
  return raw.length === 0 || raw === "application/octet-stream";
}
