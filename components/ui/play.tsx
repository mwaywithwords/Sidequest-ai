import { cn } from "@/lib/cn";
import { BoltIcon, CameraIcon, SearchIcon, SparkIcon } from "@/components/ui/icons";

export function ViewfinderCorners({
  scanning = false,
  accent,
}: {
  scanning?: boolean;
  accent?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("vf-corners", scanning && "is-scanning")}
      style={accent ? { color: accent } : undefined}
    >
      <i className="tl" />
      <i className="tr" />
      <i className="bl" />
      <i className="br" />
    </span>
  );
}

const TOKEN_MARKS = ["▰", "◇", "△", "●"] as const;

export function CollectibleToken({
  label,
  value,
  accent,
  mark = "▰",
}: {
  label: string;
  value: string;
  accent: string;
  mark?: (typeof TOKEN_MARKS)[number] | string;
}) {
  return (
    <span className="token" style={{ color: accent }}>
      <span aria-hidden className="text-base leading-none">
        {mark}
      </span>
      <span className="sr-only">{label}: </span>
      <span>{value}</span>
    </span>
  );
}

export { TOKEN_MARKS };

export function XpBadge({ amount }: { amount: number }) {
  return (
    <span className="xp-badge animate-xp-pop">
      <SparkIcon className="size-4" />
      +{amount} XP
    </span>
  );
}

export function SparkField({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      <span className="absolute top-3 left-4 text-lime/80">✦</span>
      <span className="absolute top-8 right-6 text-amber/70">·</span>
      <span className="absolute bottom-6 left-8 text-aqua/70">+</span>
      <span className="absolute right-10 bottom-10 text-blossom/70">△</span>
    </div>
  );
}

const TRAIL_ICONS = [CameraIcon, SearchIcon, BoltIcon] as const;

export function MissionTrail({
  steps,
}: {
  steps: readonly { title: string; body: string }[];
}) {
  return (
    <ol className="mission-path">
      {steps.map((step, index) => {
        const Icon = TRAIL_ICONS[index] ?? CameraIcon;
        const last = index === steps.length - 1;

        return (
          <li key={step.title} className="mission-path-step">
            <div className="mission-path-rail" aria-hidden>
              <span className="mission-path-node">
                <Icon className="size-5" />
              </span>
              {last ? null : <span className="mission-path-line" />}
            </div>
            <div className="mission-path-copy">
              <p className="mission-path-kicker">
                {String(index + 1).padStart(2, "0")}
              </p>
              <p className="mission-path-title">{step.title}</p>
              <p className="mission-path-body">{step.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function RevealArrow({ accent }: { accent?: string }) {
  return (
    <span
      aria-hidden
      className="font-display text-2xl leading-none"
      style={{ color: accent ?? "#c8ff4d" }}
    >
      ↓
    </span>
  );
}

export function RevealLink({
  fromLabel,
  fromValue,
  toLabel,
  accent,
}: {
  fromLabel: string;
  fromValue: string;
  toLabel: string;
  accent: string;
}) {
  return (
    <div className="reveal-stack">
      <div className="reveal-chip" style={{ color: accent }}>
        <span className="text-[0.7rem] font-semibold tracking-wide text-muted uppercase">
          {fromLabel}
        </span>
        <span className="mt-1 font-display text-2xl font-extrabold tracking-tight text-cream">
          {fromValue}
        </span>
      </div>
      <RevealArrow accent={accent} />
      <div className="reveal-chip" style={{ color: accent }}>
        <span
          className="font-display text-3xl font-extrabold tracking-tight"
          style={{ color: accent }}
        >
          {toLabel}
        </span>
      </div>
    </div>
  );
}

export function CameraMission() {
  return (
    <div className="relative mx-auto w-full max-w-[18.25rem]">
      <SparkField />
      <div className="photo-frame relative aspect-square">
        <ViewfinderCorners />
        <div className="flex h-full items-center justify-center">
          <div
            aria-hidden
            className="relative flex size-36 items-center justify-center rounded-[1.6rem] border-2 border-[#3a3458] border-b-[6px] bg-raised"
          >
            <span className="absolute -top-2 right-5 size-3 rounded-full bg-coral" />
            <span className="absolute top-4 right-3 size-3 rounded-full bg-lime" />
            <span className="grid size-24 place-items-center rounded-full border-4 border-lime bg-void">
              <span className="grid size-12 place-items-center rounded-full bg-aqua/30">
                <CameraIcon className="size-6 text-cream" />
              </span>
            </span>
          </div>
        </div>
        <span
          aria-hidden
          className="absolute top-10 left-6 animate-float-a font-display text-3xl font-extrabold text-addition"
        >
          +
        </span>
        <span
          aria-hidden
          className="absolute top-12 right-7 animate-float-b font-display text-3xl font-extrabold text-division"
        >
          ÷
        </span>
        <span
          aria-hidden
          className="absolute bottom-20 left-8 animate-float-b font-display text-2xl font-extrabold text-geometry"
        >
          △
        </span>
        <span
          aria-hidden
          className="absolute right-8 bottom-16 animate-float-a font-display text-2xl font-extrabold text-fractions"
        >
          ½
        </span>
      </div>
      <p className="mt-3 font-display text-lg font-extrabold tracking-tight text-cream">
        Point. Snap. Discover.
      </p>
    </div>
  );
}


