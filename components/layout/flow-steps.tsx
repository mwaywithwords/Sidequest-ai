import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";

const STEPS = [
  { id: "setup", label: copy.flow.setup },
  { id: "scan", label: copy.flow.scan },
  { id: "discover", label: copy.flow.discover },
  { id: "solve", label: copy.flow.solve },
] as const;

export type FlowStep = (typeof STEPS)[number]["id"];

/** Compact mission HUD. One path for the whole student journey. */
export function FlowSteps({ current }: { current: FlowStep }) {
  const currentIndex = STEPS.findIndex((step) => step.id === current);

  return (
    <ol aria-label="Mission steps" className="game-path">
      {STEPS.map((step, index) => {
        const isActive = index === currentIndex;
        const isDone = index < currentIndex;

        return (
          <li
            key={step.id}
            className="game-path-item"
            aria-current={isActive ? "step" : undefined}
          >
            <span
              className={cn(
                "game-path-label",
                isActive && "is-active",
                isDone && "is-done",
              )}
            >
              {step.label}
            </span>
            {index < STEPS.length - 1 ? (
              <span
                aria-hidden
                className={cn("game-path-rail", isDone && "is-done")}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
