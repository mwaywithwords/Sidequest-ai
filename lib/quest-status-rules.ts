/**
 * Allowed quest status transitions, kept out of the database write so they
 * can be tested without a network.
 *
 * Closed states are terminal. A later pipeline stage cannot overwrite them.
 */

export type QuestStatus =
  | "pending"
  | "processing"
  | "ready"
  | "rejected"
  | "failed";

export const QUEST_STATUSES = [
  "pending",
  "processing",
  "ready",
  "rejected",
  "failed",
] as const;

const CLOSED_STATUSES: readonly QuestStatus[] = [
  "ready",
  "rejected",
  "failed",
];

export function canTransition(from: QuestStatus, to: QuestStatus): boolean {
  if (from === to) return true;
  return !CLOSED_STATUSES.includes(from);
}
