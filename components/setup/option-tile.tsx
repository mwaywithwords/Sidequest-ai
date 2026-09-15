import { cn } from "@/lib/cn";
import { CheckIcon } from "@/components/ui/icons";

/**
 * The selectable tile used for both grade and skill. Presentational only, so it
 * stays usable from whichever client component owns the selection state.
 */
export function OptionTile({
  mark,
  label,
  accent,
  selected,
  onSelect,
  variant = "skill",
}: {
  mark: string;
  label: string;
  blurb?: string;
  accent: string;
  selected: boolean;
  onSelect: () => void;
  variant?: "skill" | "grade";
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      data-selected={selected}
      className={cn(
        "relative flex w-full flex-col items-center justify-center overflow-hidden rounded-[1.15rem] border-[3px] border-b-8 px-2 py-4 text-center transition-transform",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime",
        "active:translate-y-1",
        variant === "grade" ? "min-h-[6.5rem] sm:min-h-[7.25rem]" : "min-h-[7.5rem] sm:min-h-[8.25rem]",
      )}
      style={{
        borderColor: selected ? accent : "var(--border-strong)",
        borderBottomColor: selected ? accent : "var(--edge)",
        background: selected
          ? `linear-gradient(180deg, color-mix(in oklab, ${accent} 34%, var(--surface-raised)), var(--surface-raised) 68%)`
          : `linear-gradient(180deg, color-mix(in oklab, ${accent} 16%, var(--surface-raised)), var(--surface-raised) 62%)`,
        boxShadow: selected ? `0 0 0 3px ${accent}` : "0 2px 0 var(--shadow)",
        transform: selected ? "translateY(3px)" : undefined,
      }}
    >
      {selected ? (
        <span
          aria-hidden
          className="absolute top-2 right-2 grid size-6 place-items-center rounded-md text-void"
          style={{ background: accent }}
        >
          <CheckIcon className="size-4" />
        </span>
      ) : null}
      <span
        aria-hidden
        className={cn(
          "skill-mark font-display leading-none font-extrabold",
          variant === "grade" ? "text-4xl sm:text-5xl" : "text-5xl sm:text-6xl",
        )}
        style={{ ["--accent" as string]: accent }}
      >
        {mark}
      </span>
      <span className="mt-2 font-display text-[0.7rem] font-extrabold tracking-wide text-cream uppercase sm:text-sm">
        {label}
      </span>
    </button>
  );
}
