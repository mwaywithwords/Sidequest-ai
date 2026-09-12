import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type CardProps = {
  children: ReactNode;
  className?: string;
  /** Draws a coloured strip along the top edge, used to key a card to a skill. */
  accent?: string;
};

export function Card({ children, className, accent }: CardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-card bg-raised/70 ring-1 ring-hair backdrop-blur-sm",
        className,
      )}
    >
      {accent ? (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1"
          style={{ background: accent }}
        />
      ) : null}
      {children}
    </div>
  );
}

/** Small uppercase mono label. The recurring section marker across the app. */
export function SectionLabel({
  children,
  className,
  accent,
}: {
  children: ReactNode;
  className?: string;
  accent?: string;
}) {
  return (
    <p
      className={cn(
        "font-mono text-[0.7rem] uppercase tracking-[0.22em] text-faint",
        className,
      )}
      style={accent ? { color: accent } : undefined}
    >
      {children}
    </p>
  );
}
