"use client";

import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "@/components/ui/icons";
import { copy } from "@/lib/copy";
import {
  applyDocumentTheme,
  nextTheme,
  readStoredThemePreference,
  subscribeThemePreference,
  writeStoredThemePreference,
} from "@/lib/theme";

function serverTheme() {
  return "light" as const;
}

export function useThemePreference() {
  const theme = useSyncExternalStore(
    subscribeThemePreference,
    readStoredThemePreference,
    serverTheme,
  );

  const setTheme = useCallback((next: "light" | "dark") => {
    writeStoredThemePreference(next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(nextTheme(readStoredThemePreference()));
  }, [setTheme]);

  return { theme, setTheme, toggle };
}

export function ThemeToggle() {
  const { theme, toggle } = useThemePreference();
  const dark = theme === "dark";

  useLayoutEffect(() => {
    applyDocumentTheme(readStoredThemePreference());
  }, []);

  return (
    <button
      type="button"
      className="game-profile"
      data-theme-toggle=""
      aria-pressed={dark}
      aria-label={dark ? copy.hud.themeToLight : copy.hud.themeToDark}
      suppressHydrationWarning
      onClick={toggle}
    >
      <SunIcon className="theme-icon-light size-5" />
      <MoonIcon className="theme-icon-dark size-5" />
    </button>
  );
}
