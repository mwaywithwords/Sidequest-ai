import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * The wordmark sets SIDE against QUEST so the second half carries the accent.
 * The bracket glyphs echo the viewfinder device used on the scan screen.
 */
export function Wordmark({
  className,
  asLink = true,
}: {
  className?: string;
  asLink?: boolean;
}) {
  const mark = (
    <span
      className={cn(
        "font-display text-lg font-extrabold tracking-tight",
        className,
      )}
    >
      <span className="text-cream">SIDE</span>
      <span className="text-lime-ink">QUEST</span>
    </span>
  );

  if (!asLink) return mark;

  return (
    <Link
      href="/"
      className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime"
    >
      {mark}
    </Link>
  );
}
