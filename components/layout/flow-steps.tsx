import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";

const STEPS = [
  { id: "setup", label: copy.flow.setup },
  { id: "scan", label: copy.flow.scan },
  { id: "quest", label: copy.flow.quest },
] as const;

export type FlowStep = (typeof STEPS)[number]["id"];

/** Numbered mission tracker. Tells the student where they are in three beats. */
export function FlowSteps({ current }: { current: FlowStep }) {
  const currentIndex = STEPS.findIndex((step) => step.id === current);

  return (
    <ol aria-label="Mission steps" className="flex items-center gap-2 sm:gap-3">
      {STEPS.map((step, index) => {
        const isActive = index === currentIndex;
        const isDone = index < currentIndex;

        return (
          <li
            key={step.id}
            className="flex items-center gap-2 sm:gap-3"
            aria-current={isActive ? "step" : undefined}
          >
            <div
              className={cn(
                "flex items-center gap-2 rounded-full px-2.5 py-1",
                isActive && "bg-lime/15",
              )}
            >
              <span
                className={cn(
                  "font-mono text-[0.7rem] tracking-[0.14em]",
                  isActive && "font-semibold text-lime",
                  isDone && "text-muted",
                  !isActive && !isDone && "text-faint",
                )}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span
                className={cn(
                  "text-sm",
                  isActive && "font-semibold text-cream",
                  isDone && "text-muted",
                  !isActive && !isDone && "text-faint",
                )}
              >
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 ? (
              <span
                aria-hidden
                className={cn(
                  "h-px w-6 sm:w-10",
                  index < currentIndex ? "bg-muted" : "bg-hair",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
