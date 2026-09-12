import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Spec-sheet readout for a measurement the camera found. Monospace on purpose:
 * it should look like data lifted off the object, not decoration.
 */
export function MeasurementChip({
  label,
  value,
  source,
  accent,
}: {
  label: string;
  value: string;
  source: string;
  accent: string;
}) {
  return (
    <div className="rounded-tile bg-void/50 px-3.5 py-3 ring-1 ring-hair">
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-faint">
        {label}
      </p>
      <p
        className="mt-1 font-mono text-lg font-medium"
        style={{ color: accent }}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[0.7rem] text-faint">{source}</p>
    </div>
  );
}

export function Pill({
  children,
  className,
  accent,
}: {
  children: ReactNode;
  className?: string;
  accent?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-void/50 px-3 py-1.5",
        "text-xs font-medium ring-1 ring-hair",
        className,
      )}
      style={accent ? { color: accent } : undefined}
    >
      {children}
    </span>
  );
}
