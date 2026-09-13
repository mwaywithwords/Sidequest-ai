/**
 * Image-acceptance checks for phone aliases, empty types, and magic bytes.
 *
 * Run with: npx tsx lib/image-capture.check.ts
 */

import {
  detectImageType,
  inspectUploadedImage,
  normalisedImageType,
  validateImageFile,
} from "@/lib/image-capture";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const webpBytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);
const heicBytes = new Uint8Array([
  0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
]);
const textBytes = new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]);

check("jpeg magic is recognised", detectImageType(jpegBytes) === "image/jpeg");
check("png magic is recognised", detectImageType(pngBytes) === "image/png");
check("webp magic is recognised", detectImageType(webpBytes) === "image/webp");
check("heic ftyp is recognised", detectImageType(heicBytes) === "image/heic");
check("html bytes are not an image", detectImageType(textBytes) === null);

check(
  "image/jpg aliases to jpeg",
  normalisedImageType({ type: "image/jpg", name: "photo.JPG" }) === "image/jpeg",
);
check(
  "image/pjpeg aliases to jpeg",
  normalisedImageType({ type: "image/pjpeg", name: "camera" }) === "image/jpeg",
);
check(
  "empty type uses a jpeg extension",
  normalisedImageType({ type: "", name: "IMG_1234.JPEG" }) === "image/jpeg",
);
check(
  "octet-stream uses a heic extension",
  normalisedImageType({ type: "application/octet-stream", name: "photo.heic" }) ===
    "image/heic",
);
check(
  "a pdf is not accepted by name",
  normalisedImageType({ type: "application/pdf", name: "notes.pdf" }) === null,
);

const jpegFile = new File([jpegBytes], "photo.jpg", { type: "image/jpeg" });
check("a jpeg file passes the picker check", validateImageFile(jpegFile) === null);

const jpgAlias = new File([jpegBytes], "photo.jpg", { type: "image/jpg" });
check("an iOS image/jpg file is accepted", validateImageFile(jpgAlias) === null);

const unnamedCamera = new File([jpegBytes], "image", { type: "" });
check(
  "a camera dump with no type still reaches preparation",
  validateImageFile(unnamedCamera) === null,
);

const pdf = new File([textBytes], "notes.pdf", { type: "application/pdf" });
check("a pdf is rejected", validateImageFile(pdf) === "unsupported");

const empty = new File([], "photo.jpg", { type: "image/jpeg" });
check("an empty file is unsupported", validateImageFile(empty) === "unsupported");

const oversized = new File([jpegBytes], "photo.jpg", { type: "image/jpeg" });
Object.defineProperty(oversized, "size", { value: 20 * 1024 * 1024 });
check("an oversized file is tooLarge", validateImageFile(oversized) === "tooLarge");

async function run() {
  const inspectedJpeg = await inspectUploadedImage(jpegFile);
  check(
    "a real jpeg is accepted for upload",
    inspectedJpeg.ok && inspectedJpeg.type === "image/jpeg",
  );

  const labeledHtml = new File([textBytes], "photo.jpg", { type: "image/jpeg" });
  const inspectedFake = await inspectUploadedImage(labeledHtml);
  check(
    "a renamed document fails the magic-byte check",
    !inspectedFake.ok && inspectedFake.reason === "unsupported",
  );

  const heicFile = new File([heicBytes], "photo.heic", { type: "image/heic" });
  const inspectedHeic = await inspectUploadedImage(heicFile);
  check(
    "a raw HEIC is refused at the upload boundary",
    !inspectedHeic.ok && inspectedHeic.reason === "unsupported",
  );

  const mismatched = new File([pngBytes], "photo.jpg", { type: "image/jpeg" });
  const inspectedMismatch = await inspectUploadedImage(mismatched);
  check(
    "a type that does not match its bytes is refused",
    !inspectedMismatch.ok && inspectedMismatch.reason === "unsupported",
  );

  if (failed > 0) {
    console.error(`\n${failed} image-capture checks failed`);
    process.exit(1);
  }

  console.log("\nall image-capture checks passed");
}

void run();
