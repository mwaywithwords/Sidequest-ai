import type { ReactNode } from "react";
import { CompassIcon } from "@/components/ui/icons";
import { Wordmark } from "@/components/brand/wordmark";
import { copy } from "@/lib/copy";
import Link from "next/link";

/**
 * Frames every route: ambient light, the top bar, and a centred column that
 * stays comfortable from a phone up to an iPad in landscape.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-[100dvh] flex-col">
      <div
        aria-hidden
        className="ambient-glow pointer-events-none fixed inset-0 -z-10"
      />
      <div
        aria-hidden
        className="dot-grid pointer-events-none fixed inset-0 -z-10"
      />

      <header className="sticky top-0 z-20 border-b border-hair bg-ink/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5 sm:px-8">
          <Wordmark />
          <Link
            href="/progress"
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-muted transition hover:bg-raised hover:text-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
          >
            <CompassIcon className="size-4" />
            <span>Progress</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-20 pt-8 sm:px-8 sm:pt-12">
        {children}
      </main>

      <footer className="border-t border-hair px-5 py-8 sm:px-8">
        <p className="mx-auto max-w-5xl text-xs text-faint">
          {copy.brand.footer}
        </p>
      </footer>
    </div>
  );
}
