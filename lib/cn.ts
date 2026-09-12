/** Minimal class joiner. Not worth a dependency for what it does. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
