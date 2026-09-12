import { cn } from "@/lib/cn";

/**
 * The selectable tile used for both grade and skill. Presentational only, so it
 * stays usable from whichever client component owns the selection state.
 */
export function OptionTile({
  mark,
  label,
  blurb,
  accent,
  selected,
  onSelect,
}: {
  mark: string;
  label: string;
  blurb: string;
  accent: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "group relative flex min-h-[104px] w-full flex-col items-start gap-1 overflow-hidden rounded-tile",
        "bg-raised/70 p-4 text-left ring-1 transition active:scale-[0.98]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime",
        selected ? "ring-transparent" : "ring-hair hover:bg-hover hover:ring-hair-strong",
      )}
      style={
        selected
          ? {
              boxShadow: `inset 0 0 0 2px ${accent}, 0 14px 40px -16px ${accent}80`,
              background: `linear-gradient(180deg, ${accent}1f, transparent 70%)`,
            }
          : undefined
      }
    >
      <span
        aria-hidden
        className="font-display text-2xl font-bold leading-none"
        style={{ color: accent }}
      >
        {mark}
      </span>
      <span className="mt-1 font-display text-base font-bold tracking-tight text-cream">
        {label}
      </span>
      <span className="text-xs leading-snug text-muted">{blurb}</span>
    </button>
  );
}
