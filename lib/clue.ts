import {
  type EvidenceRequest,
  EvidenceRequestSchema,
} from "@/lib/ai/schemas";
import { copy } from "@/lib/copy";

/**
 * Student-safe presentation of a needs_evidence investigation.
 *
 * Built here, not in JSX, so the clue panel never has to know a pipeline
 * code or a fit score. The evidence request has already been through
 * `EvidenceRequestSchema` on the server; it is parsed again here because a
 * response can be truncated or spoofed.
 */

export type ClueRequest = {
  /** The live quest waiting for this observation. Not uploaded to again yet. */
  questId: string;
  objectName: string;
  evidenceRequest: EvidenceRequest;
};

export type CluePresentation = {
  title: string;
  heading: string;
  investigate: string;
  prompt: string;
  reason: string;
  cta: string;
  replaceCta: string;
};

const OBJECT_NAME_MAX = 60;

export function parseEvidenceRequest(value: unknown): EvidenceRequest | null {
  const parsed = EvidenceRequestSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function sanitiseObjectName(value: unknown): string {
  if (typeof value !== "string") return "object";

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > OBJECT_NAME_MAX) {
    return "object";
  }

  return trimmed;
}

export function presentClue(request: ClueRequest): CluePresentation {
  const { evidenceRequest, objectName } = request;

  return {
    title: copy.clue.eyebrow,
    heading: copy.clue.heading,
    investigate: copy.clue.investigate(objectName.toLowerCase()),
    prompt: evidenceRequest.prompt,
    reason: evidenceRequest.reason,
    cta: copy.clue.cta[evidenceRequest.type],
    replaceCta: copy.clue.replacePhoto,
  };
}
