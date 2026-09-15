import { CameraMission, MissionTrail } from "@/components/ui/play";
import { ButtonLink } from "@/components/ui/button";
import { copy } from "@/lib/copy";

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center text-center">
      <section className="flex w-full flex-col items-center animate-rise">
        <h1 className="font-display text-[2.7rem] leading-[0.86] font-extrabold tracking-tight sm:text-6xl">
          <span className="block text-cream">SIDE</span>
          <span className="block text-lime-ink">QUEST</span>
        </h1>
        <p className="mt-3 max-w-[15.5rem] text-base font-medium text-cream sm:max-w-xs sm:text-lg">
          {copy.landing.tagline}
        </p>

        <div className="mt-4 w-full">
          <CameraMission />
        </div>

        <div className="game-actions mt-5">
          <ButtonLink href="/setup" size="lg" className="w-full">
            {copy.landing.start}
          </ButtonLink>
          <ButtonLink href="/progress" variant="ghost" size="md" className="w-full">
            {copy.landing.progress}
          </ButtonLink>
        </div>
      </section>

      <section className="mt-7 w-full text-left">
        <MissionTrail steps={copy.landing.trail} />
      </section>
    </div>
  );
}
