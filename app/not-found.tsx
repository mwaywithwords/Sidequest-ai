import { ButtonLink } from "@/components/ui/button";
import { copy } from "@/lib/copy";

export default function NotFound() {
  return (
    <div className="flex min-h-[48vh] flex-col items-center justify-center text-center">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-cream">
        {copy.notFound.heading}
      </h1>
      <p className="mt-3 max-w-xs text-sm text-muted">{copy.notFound.body}</p>
      <ButtonLink href="/setup" size="lg" className="mt-8 w-full">
        {copy.landing.start}
      </ButtonLink>
    </div>
  );
}
