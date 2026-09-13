"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand/wordmark";
import { CompassIcon } from "@/components/ui/icons";
import { copy } from "@/lib/copy";

type RouteKind = "landing" | "setup" | "scan" | "quest" | "progress" | "page";

function routeKind(pathname: string): RouteKind {
  if (pathname === "/") return "landing";
  if (pathname.startsWith("/setup")) return "setup";
  if (pathname.startsWith("/scan")) return "scan";
  if (pathname.startsWith("/quest")) return "quest";
  if (pathname.startsWith("/progress")) return "progress";
  return "page";
}

/**
 * Shared handheld game chrome. Route kind only changes density, footer,
 * and progress access — never product behavior.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const kind = routeKind(usePathname());
  const showFooter = kind === "landing";
  const onProgress = kind === "progress";

  return (
    <div className="game-app" data-route={kind}>
      <div
        aria-hidden
        className="ambient-glow pointer-events-none fixed inset-0 -z-10"
      />
      <div
        aria-hidden
        className="play-specks pointer-events-none fixed inset-0 -z-10"
      />

      <header className="game-header">
        <div className="game-header-bar">
          <Wordmark />
          {onProgress ? (
            <span className="game-profile is-current" aria-current="page">
              <CompassIcon className="size-5" />
            </span>
          ) : (
            <Link
              href="/progress"
              aria-label="Your progress"
              className="game-profile"
            >
              <CompassIcon className="size-5" />
            </Link>
          )}
        </div>
      </header>

      <main className="game-main">{children}</main>

      {showFooter ? (
        <footer className="game-footer">
          <p className="game-footer-copy">{copy.brand.footer}</p>
        </footer>
      ) : null}
    </div>
  );
}
