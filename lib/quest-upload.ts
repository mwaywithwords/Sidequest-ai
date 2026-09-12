import { copy } from "@/lib/copy";
import type { ImageRejection } from "@/lib/image-capture";
import { prepareImageForUpload } from "@/lib/image-prepare";
import type { Grade, SkillId } from "@/lib/types";

/**
 * What came back from handing a photo to the server.
 *
 * The split matters for what the student is told. "rejected" is the server
 * disagreeing with the file itself, which deserves the same specific wording
 * the browser check already uses, and retrying the same bytes would only fail
 * again. "refused" is a stage of the pipeline turning the photo away — unsafe,
 * unsuitable, or unreadable — which arrives with its own sentence already
 * written. "failed" is everything else — offline, storage, database, or a stage
 * that could not finish — where the same photo is worth resending.
 */
export type UploadOutcome =
  | { status: "ok"; questId: string }
  | { status: "rejected"; reason: ImageRejection }
  | { status: "refused"; message: string }
  | { status: "failed" };

function isRejection(value: unknown): value is ImageRejection {
  return value === "missing" || value === "unsupported" || value === "tooLarge";
}

/**
 * Normalises the photo, posts it to the upload boundary, and returns the new
 * quest's id.
 *
 * Preparation lives here rather than in the component because getting a photo
 * to the server is what this module is for, and the server only ever sees the
 * prepared file — the original never leaves the device.
 *
 * The body is FormData so the browser sets the multipart boundary itself;
 * setting Content-Type by hand here would corrupt the request.
 */
export async function uploadQuestImage(
  file: File,
  grade: Grade,
  skillId: SkillId,
): Promise<UploadOutcome> {
  const prepared = await prepareImageForUpload(file);

  // The browser could not decode it, which in practice means an HEIC outside
  // Safari. Reported as 'unsupported' because from the student's side it is
  // the same problem as a file that was never a readable photo.
  if (prepared === null) {
    return { status: "rejected", reason: "unsupported" };
  }

  const body = new FormData();
  body.append("image", prepared);
  body.append("grade", String(grade));
  body.append("skill", skillId);

  let response: Response;
  try {
    response = await fetch("/api/quests", { method: "POST", body });
  } catch {
    // Offline, or the request was cut off in flight.
    return { status: "failed" };
  }

  const payload: unknown = await response.json().catch(() => null);
  const field = (name: string) =>
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)[name]
      : undefined;

  if (response.ok) {
    const questId = field("questId");

    return typeof questId === "string"
      ? { status: "ok", questId }
      : { status: "failed" };
  }

  const reason = field("error");

  if (reason === "refused") {
    const message = field("message");

    // The response also carries the stage's normalised reason. It stops here:
    // the screen needs the sentence, and nothing in the UI should branch on why
    // a photo was refused. The fallback covers a truncated response — the
    // student still gets a next step rather than a retry that would be refused
    // the same way.
    return {
      status: "refused",
      message:
        typeof message === "string" && message.length > 0
          ? message
          : copy.safety.unsuitable,
    };
  }

  // 'badMission' also lands here: the grade or skill in the URL was not one we
  // recognise, which is not something retrying the photo can fix, but it is
  // rare enough not to deserve its own screen.
  return isRejection(reason)
    ? { status: "rejected", reason }
    : { status: "failed" };
}
