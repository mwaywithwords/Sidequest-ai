import {
  parseEvidenceRequest,
  sanitiseObjectName,
} from "@/lib/clue";
import {
  type DetourRequest,
  isDetourKind,
  sanitiseSuggestions,
} from "@/lib/detour";
import type { EvidenceRequest } from "@/lib/ai/schemas";
import type { ImageRejection } from "@/lib/image-capture";
import { prepareImageForUpload } from "@/lib/image-prepare";
import type { Grade, SkillId } from "@/lib/types";

/**
 * What came back from handing a photo to the server.
 *
 * The split matters for what the student is told. "rejected" is the server
 * disagreeing with the file itself. "refused" is a stage turning the photo
 * away, already mapped to a student-safe detour. "needsEvidence" is progress:
 * the quest is alive and waiting for one more observation. "failed" is
 * everything else, where the same photo is worth resending.
 */
export type UploadOutcome =
  | { status: "ok"; questId: string }
  | {
      status: "needsEvidence";
      questId: string;
      objectName: string;
      evidenceRequest: EvidenceRequest;
    }
  | { status: "rejected"; reason: ImageRejection }
  | { status: "refused"; detour: DetourRequest }
  | { status: "failed" };

function isRejection(value: unknown): value is ImageRejection {
  return value === "missing" || value === "unsupported" || value === "tooLarge";
}

/**
 * Normalises the photo, posts it to the upload boundary, and returns the new
 * quest's id — or the investigation that should continue from it.
 *
 * Preparation lives here rather than in the component because getting a photo
 * to the server is what this module is for, and the server only ever sees the
 * prepared file — the original never leaves the device.
 */
export async function uploadQuestImage(
  file: File,
  grade: Grade,
  skillId: SkillId,
): Promise<UploadOutcome> {
  const prepared = await prepareImageForUpload(file);

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
    return { status: "failed" };
  }

  const payload: unknown = await response.json().catch(() => null);
  const field = (name: string) =>
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)[name]
      : undefined;

  if (response.ok) {
    const questId = field("questId");
    if (typeof questId !== "string") return { status: "failed" };

    if (field("challengeMode") === "needs_evidence") {
      const evidenceRequest = parseEvidenceRequest(field("evidenceRequest"));
      if (evidenceRequest === null) return { status: "failed" };

      return {
        status: "needsEvidence",
        questId,
        objectName: sanitiseObjectName(field("objectName")),
        evidenceRequest,
      };
    }

    return { status: "ok", questId };
  }

  const reason = field("error");

  if (reason === "refused") {
    const rawKind = field("kind");
    const kind = isDetourKind(rawKind) ? rawKind : "unsafe";

    return {
      status: "refused",
      detour: {
        kind,
        suggestions: sanitiseSuggestions(field("suggestions")),
        offerSkillChange: field("offerSkillChange") === true,
      },
    };
  }

  return isRejection(reason)
    ? { status: "rejected", reason }
    : { status: "failed" };
}
