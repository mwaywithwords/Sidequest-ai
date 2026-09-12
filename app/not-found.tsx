import { ButtonLink } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { copy } from "@/lib/copy";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <SectionLabel>{copy.notFound.eyebrow}</SectionLabel>
      <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-cream sm:text-4xl">
        {copy.notFound.heading}
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
        {copy.notFound.body}
      </p>
      <ButtonLink href="/setup" size="lg" className="mt-8">
        Start a sidequest
      </ButtonLink>
    </div>
  );
}
