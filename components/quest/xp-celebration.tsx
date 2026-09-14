import { SparkIcon } from "@/components/ui/icons";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";
import { xpCelebrationView } from "@/lib/feedback-celebration";

const SPARKS = [
  { mark: "★", kind: "star" },
  { mark: "+", kind: "plus" },
  { mark: "×", kind: "times" },
  { mark: "✦", kind: "spark" },
  { mark: "△", kind: "shape" },
] as const;

export function XpBadge({
  amount,
  celebrate = false,
}: {
  amount: number;
  celebrate?: boolean;
}) {
  if (amount <= 0) return null;

  const view = xpCelebrationView({
    celebrate,
    reducedMotion: false,
    xp: amount,
  });

  return (
    <div
      className={cn(
        "xp-celebrate",
        celebrate && "is-live",
        view.showFlight && "is-flying",
      )}
    >
      <span
        className={cn("xp-reward", celebrate && "xp-reward-pop")}
        aria-label={copy.quest.experience.xpEarned(amount)}
      >
        <SparkIcon className="size-7" aria-hidden />
        <span aria-hidden>{copy.quest.experience.xp(amount)}</span>
      </span>

      {view.showParticles ? (
        <span className="xp-burst" aria-hidden>
          {SPARKS.map((spark, index) => (
            <i
              key={spark.kind}
              className="xp-spark"
              data-k={String(index + 1)}
            >
              {spark.mark}
            </i>
          ))}
          {view.showTrumpet ? (
            <i className="xp-spark xp-spark-trumpet" data-k="6">
              🎺
            </i>
          ) : null}
        </span>
      ) : null}

      {view.showFlight ? (
        <span className="xp-flight" aria-hidden>
          {copy.quest.experience.xp(amount)}
        </span>
      ) : null}
    </div>
  );
}
