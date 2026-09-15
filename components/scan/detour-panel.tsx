import { Button, ButtonLink } from "@/components/ui/button";
import { CompassIcon } from "@/components/ui/icons";
import type { DetourPresentation } from "@/lib/detour";

type DetourAction = {
  label: string;
  href?: string;
  onClick?: () => void;
};

/**
 * The student-facing face of a quest that did not become a challenge.
 *
 * Takes presentation data only — title, message, suggestions, actions — so
 * it cannot leak a reason code or a moderation category even if a caller
 * has one. The compass keeps it in the same visual family as the rest of
 * the product, not in the family of error pages.
 */
export function DetourPanel({
  presentation,
  primary,
  secondary,
  accent,
}: {
  presentation: DetourPresentation;
  primary: DetourAction;
  secondary?: DetourAction;
  accent?: string;
}) {
  const tone = accent ?? "#c8ff4d";

  return (
    <div className="animate-rise text-center">
      <div className="flex items-center justify-center gap-2">
        <CompassIcon className="size-5" style={{ color: tone }} />
        <p
          className="game-moment accent-ink"
          style={{ ["--accent" as string]: tone }}
        >
          {presentation.title}
        </p>
      </div>

      <h1 className="game-title mt-3">{presentation.heading}</h1>

      <p className="mx-auto mt-3 game-support">{presentation.message}</p>

      {presentation.suggestions.length > 0 ? (
        <div className="mx-auto mt-5 max-w-sm text-left">
          <p className="text-sm font-extrabold text-cream">{presentation.lead}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {presentation.suggestions.map((suggestion) => (
              <li
                key={suggestion}
                className="flex items-start gap-3 text-sm leading-relaxed text-muted"
              >
                <span
                  aria-hidden
                  className="mt-1.5 size-1.5 shrink-0 rounded-full"
                  style={{ background: tone }}
                />
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="game-actions mt-6">
        <ActionButton action={primary} variant="primary" />
        {secondary ? (
          <ActionButton action={secondary} variant="secondary" />
        ) : null}
      </div>
    </div>
  );
}

function ActionButton({
  action,
  variant,
}: {
  action: DetourAction;
  variant: "primary" | "secondary";
}) {
  if (action.href) {
    return (
      <ButtonLink
        href={action.href}
        variant={variant}
        size="lg"
        className="w-full"
        onClick={action.onClick}
      >
        {action.label}
      </ButtonLink>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      size="lg"
      onClick={action.onClick}
      className="w-full"
    >
      {action.label}
    </Button>
  );
}
