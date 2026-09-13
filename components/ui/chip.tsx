import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CollectibleToken } from "@/components/ui/play";

export function MeasurementChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return <CollectibleToken label={label} value={value} accent={accent} />;
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
        "inline-flex items-center gap-1.5 rounded-xl border-2 border-hair px-3 py-1.5 text-sm font-bold",
        className,
      )}
      style={accent ? { color: accent } : undefined}
    >
      {children}
    </span>
  );
}
