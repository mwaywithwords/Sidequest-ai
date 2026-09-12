/**
 * Covers the 5-10 seconds the real pipeline will take. The sweeping line and
 * the changing caption exist so the wait reads as deliberate work.
 */
export function ProcessingOverlay({
  message,
  accent,
}: {
  message: string;
  accent: string;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 rounded-tile bg-void/85 backdrop-blur-sm">
      <div className="relative flex size-16 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 animate-pulse-ring rounded-full"
          style={{ border: `2px solid ${accent}` }}
        />
        <span
          aria-hidden
          className="size-3 rounded-full"
          style={{ background: accent }}
        />
      </div>

      <p aria-live="polite" className="px-6 text-center text-sm text-cream">
        {message}
      </p>

      <div className="relative h-1 w-40 overflow-hidden rounded-full bg-hair">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1/3 animate-slide rounded-full"
          style={{ background: accent }}
        />
      </div>
    </div>
  );
}
