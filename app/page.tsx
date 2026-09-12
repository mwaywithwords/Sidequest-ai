import { HeroSample } from "@/components/landing/hero-sample";
import { ButtonLink } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Pill } from "@/components/ui/chip";
import { ArrowRightIcon, SparkIcon } from "@/components/ui/icons";
import { copy } from "@/lib/copy";
import { SKILLS } from "@/lib/skills";

export default function LandingPage() {
  return (
    <div className="flex flex-col gap-20 sm:gap-28">
      <section className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
        <div className="animate-rise">
          <Pill accent="#c8ff4d">
            <SparkIcon className="size-3.5" />
            {copy.landing.eyebrow}
          </Pill>

          <h1 className="mt-6 font-display text-[2.6rem] font-extrabold leading-[0.98] tracking-tight text-cream sm:text-6xl lg:text-[4.1rem]">
            {copy.landing.heroLineOne}
            <br />
            {copy.landing.heroLineTwo}
            <br />
            <span className="text-lime">{copy.landing.heroAccent}</span>
          </h1>

          <p className="mt-6 max-w-md text-base leading-relaxed text-muted sm:text-lg">
            {copy.landing.heroBody}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <ButtonLink href="/setup" size="lg" className="w-full sm:w-auto">
              Start a sidequest
              <ArrowRightIcon className="size-5" />
            </ButtonLink>
            <ButtonLink
              href="/progress"
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto"
            >
              See my progress
            </ButtonLink>
          </div>
        </div>

        <div className="animate-rise lg:pl-4">
          <HeroSample />
        </div>
      </section>

      <section>
        <SectionLabel>{copy.landing.howItWorksLabel}</SectionLabel>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {copy.landing.howItWorks.map((step, index) => (
            <Card key={step.title} className="p-5 sm:p-6">
              <span className="font-mono text-xs tracking-[0.18em] text-lime">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h2 className="mt-3 font-display text-xl font-bold tracking-tight text-cream">
                {step.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {step.body}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>{copy.landing.skillsLabel}</SectionLabel>
        <div className="mt-6 flex flex-wrap gap-2.5">
          {SKILLS.map((skill) => (
            <Pill key={skill.id} className="px-4 py-2.5 text-sm">
              <span
                aria-hidden
                className="font-mono text-base"
                style={{ color: skill.accent }}
              >
                {skill.symbol}
              </span>
              <span className="text-cream">{skill.label}</span>
            </Pill>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-card bg-raised/60 px-6 py-12 text-center ring-1 ring-hair sm:px-12 sm:py-16">
        <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-cream sm:text-4xl">
          {copy.landing.closingLineOne}
          <br className="hidden sm:block" /> {copy.landing.closingLineTwo}
        </h2>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted sm:text-base">
          {copy.landing.closingBody}
        </p>
        <ButtonLink href="/setup" size="lg" className="mt-8">
          Pick your mission
          <ArrowRightIcon className="size-5" />
        </ButtonLink>
      </section>
    </div>
  );
}
