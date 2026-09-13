import { ViewfinderCorners } from "@/components/ui/play";

/**
 * Covers the wait without fake percentages. The photo stays visible;
 * corners, a scan line, and the caption change as existing state allows.
 */
export function ProcessingOverlay({
  message,
  accent,
}: {
  message: string;
  accent: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="processing-veil"
      style={{ color: accent }}
    >
      <ViewfinderCorners scanning accent={accent} />
      <span aria-hidden className="processing-scan" />
      <span aria-hidden className="processing-glyphs">
        <span>+</span>
        <span>÷</span>
        <span>△</span>
        <span>½</span>
      </span>
      <p className="processing-caption">{message}</p>
    </div>
  );
}
