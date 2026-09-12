import { Button, ButtonLink } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
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
 * has one. The compass and lime accent keep it in the same visual family
 * as the rest of the product, not in the family of error pages.
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
  return (
    <Card accent={accent ?? "#c8ff4d"} className="animate-rise p-5 sm:p-8">
      <div className="flex items-center gap-2">
        <CompassIcon
          className="size-4"
          style={{ color: accent ?? "#c8ff4d" }}
        />
        <SectionLabel accent={accent ?? "#c8ff4d"}>
          {presentation.title}
        </SectionLabel>
      </div>

      <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-cream sm:text-4xl">
        {presentation.heading}
      </h1>

      <p className="mt-4 max-w-lg text-base leading-relaxed text-cream/90 sm:text-lg">
        {presentation.message}
      </p>

      {presentation.suggestions.length > 0 ? (
        <div className="mt-6">
          <p className="text-sm font-medium text-cream">{presentation.lead}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {presentation.suggestions.map((suggestion) => (
              <li
                key={suggestion}
                className="flex items-start gap-3 text-sm leading-relaxed text-muted sm:text-base"
              >
                <span
                  aria-hidden
                  className="mt-2 size-1.5 shrink-0 rounded-full"
                  style={{ background: accent ?? "#c8ff4d" }}
                />
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ActionButton action={primary} variant="primary" />
        {secondary ? (
          <ActionButton action={secondary} variant="secondary" />
        ) : null}
      </div>
    </Card>
  );
}

function ActionButton({
  action,
  variant,
}: {
  action: DetourAction;
  variant: "primary" | "secondary";
}) {
  const className = "w-full sm:flex-1";

  if (action.href) {
    return (
      <ButtonLink
        href={action.href}
        variant={variant}
        size="lg"
        className={className}
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
      className={className}
    >
      {action.label}
    </Button>
  );
}
