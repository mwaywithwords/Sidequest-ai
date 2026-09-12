/**
 * Mock grading, running in the browser only because there is no backend yet.
 * In the real build this logic moves into a Server Action and the expected
 * answer never ships to the client.
 */

/** Accepts "12", "12.5", "3/4", and "1 1/2", ignoring any unit the student types. */
export function parseStudentAnswer(raw: string): number | null {
  const cleaned = raw.trim().replace(/[^0-9./\s]/g, " ").trim();
  if (!cleaned) return null;

  const parts = cleaned.split(/\s+/);
  if (parts.length > 2) return null;

  const values = parts.map(toNumber);
  if (values.some((value) => value === null)) return null;

  const [first, second] = values as number[];
  const total = second === undefined ? first : first + second;

  return Number.isFinite(total) ? total : null;
}

function toNumber(part: string): number | null {
  if (part.includes("/")) {
    const [numerator, denominator] = part.split("/");
    const top = Number(numerator);
    const bottom = Number(denominator);
    if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom === 0) {
      return null;
    }
    return top / bottom;
  }

  const value = Number(part);
  return Number.isFinite(value) ? value : null;
}

export function isAnswerCorrect(raw: string, expected: number): boolean {
  const value = parseStudentAnswer(raw);
  return value !== null && Math.abs(value - expected) < 1e-6;
}
