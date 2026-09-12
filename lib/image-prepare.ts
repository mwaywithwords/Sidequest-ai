import "client-only";

/**
 * Normalises a picked photo into something worth putting on the wire.
 *
 * This is the preparation step the scan flow always assumed: it bakes in EXIF
 * rotation, converts whatever the camera produced into one predictable format,
 * and shrinks the result so an upload stays well inside the request-body limit
 * a serverless function gets.
 *
 * Browser-only by necessity — `createImageBitmap` and canvas encoding have no
 * server equivalent — hence the `client-only` guard. The server re-validates
 * whatever comes out of here; nothing in this file is a security control.
 */

/**
 * The longest edge a prepared photo keeps.
 *
 * Vision models downsample to roughly this before they look at anything, and
 * printed labels stay legible at it, so pixels beyond this are bytes spent on
 * detail nothing downstream reads.
 */
const MAX_EDGE_PX = 1600;

/**
 * Encoder passes, roughest acceptable last. The first pass is what essentially
 * every photo takes; the rest exist so an unusually noisy image still lands
 * under budget instead of failing.
 */
const QUALITY_STEPS = [0.82, 0.7, 0.55];

/**
 * What preparation aims for, comfortably under `MAX_UPLOAD_BYTES` and further
 * still under the platform's own limit. A 1600px JPEG normally lands far below
 * this, so the budget is a ceiling rather than a target to fill.
 */
const TARGET_BYTES = 2 * 1024 * 1024;

/**
 * JPEG rather than WebP: both would be smaller than the original and both are
 * accepted by the upload endpoint, but JPEG is the format every downstream
 * vision API handles without qualification. The size win from WebP is not
 * worth owning that compatibility question.
 */
const OUTPUT_TYPE = "image/jpeg";

/**
 * Returns an upload-ready copy of `file`, or null when the browser cannot
 * decode it.
 *
 * Null is overwhelmingly an HEIC or HEIF outside Safari. It also covers the
 * unreachable case of an image that will not compress under budget; both leave
 * the student with the same problem and the same next step, so they are not
 * worth distinguishing.
 */
export async function prepareImageForUpload(file: File): Promise<File | null> {
  let bitmap: ImageBitmap;
  try {
    // 'from-image' applies the EXIF orientation while decoding, so a photo
    // taken sideways uploads the way the student saw it rather than relying on
    // metadata that later stages may ignore.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }

  try {
    const canvas = drawScaled(bitmap);
    if (!canvas) return null;

    for (const quality of QUALITY_STEPS) {
      const blob = await encode(canvas, quality);
      if (blob && blob.size <= TARGET_BYTES) {
        // The endpoint derives the stored extension from the MIME type, so
        // this name is for developer tools only.
        return new File([blob], "photo.jpg", { type: OUTPUT_TYPE });
      }
    }

    return null;
  } finally {
    // Large bitmaps are worth releasing promptly on a phone.
    bitmap.close();
  }
}

/** Draws the bitmap onto a canvas no larger than `MAX_EDGE_PX` on its long edge. */
function drawScaled(bitmap: ImageBitmap): HTMLCanvasElement | null {
  // Never upscale: a small photo stays its own size.
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext("2d");
  if (!context) return null;

  // JPEG carries no alpha, and an unpainted canvas composites transparency to
  // black. A screenshot or a cut-out PNG reads better flattened onto white.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return canvas;
}

function encode(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), OUTPUT_TYPE, quality);
  });
}
