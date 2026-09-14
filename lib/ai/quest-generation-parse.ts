/**
 * Recover a combined generation JSON object without logging it.
 *
 * Used when OpenAI structured parse throws. Investigation / discovery /
 * challenge are validated independently by the caller.
 */

export function extractCombinedPayload(
  value: unknown,
): Record<string, unknown> | null {
  return findCombinedRecord(value, 0, new Set());
}

function findCombinedRecord(
  value: unknown,
  depth: number,
  seen: Set<object>,
): Record<string, unknown> | null {
  if (depth > 6 || value === null || value === undefined) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 200_000) return null;
    if (trimmed.startsWith("data:") || trimmed.includes("base64")) return null;
    if (!trimmed.startsWith("{")) return null;
    try {
      return findCombinedRecord(JSON.parse(trimmed), depth + 1, seen);
    } catch {
      return null;
    }
  }

  if (typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  const record = value as Record<string, unknown>;
  if ("investigation" in record) return record;

  for (const key of [
    "output_parsed",
    "parsed",
    "output_text",
    "error",
    "cause",
    "response",
    "data",
  ]) {
    if (!(key in record)) continue;
    const found = findCombinedRecord(record[key], depth + 1, seen);
    if (found) return found;
  }

  return null;
}
