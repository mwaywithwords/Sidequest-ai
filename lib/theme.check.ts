/**
 * Theme preference checks.
 *
 * Run with: npx tsx lib/theme.check.ts
 *
 * These do not paint the DOM or call a server. They confirm Light Mode is
 * the default, that only an explicit "dark" value opts in, and that theme
 * writes never share storage with sound or XP.
 */

import {
  SOUND_PREFERENCE_KEY,
  parseSoundPreference,
  serializeSoundPreference,
} from "@/lib/feedback-sound";
import { readHudXpView, resetHudXpView, setHudXpView } from "@/lib/hud-xp-view";
import {
  DEFAULT_THEME,
  THEME_BOOTSTRAP_SCRIPT,
  THEME_PREFERENCE_KEY,
  nextTheme,
  parseThemePreference,
  serializeThemePreference,
} from "@/lib/theme";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

check("default theme is light", DEFAULT_THEME === "light");
check("no saved preference → light", parseThemePreference(null) === "light");
check("undefined stored value → light", parseThemePreference(undefined) === "light");
check("saved light → light", parseThemePreference("light") === "light");
check("saved dark → dark", parseThemePreference("dark") === "dark");
check("empty stored value → light", parseThemePreference("") === "light");
check("invalid stored value → light", parseThemePreference("system") === "light");
check("prefers-color-scheme is not a stored value", parseThemePreference("auto") === "light");

check(
  "preference serializes for localStorage",
  serializeThemePreference("light") === "light" &&
    serializeThemePreference("dark") === "dark",
);

let stored: string | null = null;
function persist(theme: "light" | "dark") {
  stored = serializeThemePreference(theme);
}
function load() {
  return parseThemePreference(stored);
}

check("fresh storage with no write stays light", load() === "light");
persist("dark");
check("toggling to dark persists dark", stored === "dark" && load() === "dark");
persist("light");
check("later choosing light persists light", stored === "light" && load() === "light");
persist(nextTheme(load()));
check("toggle helper persists the opposite value", stored === "dark" && load() === "dark");

check(
  "theme key is not the sound key",
  THEME_PREFERENCE_KEY === "sidequest.theme" &&
    (THEME_PREFERENCE_KEY as string) !== (SOUND_PREFERENCE_KEY as string),
);

const soundBefore = parseSoundPreference("off");
persist("dark");
const soundAfter = parseSoundPreference("off");
check(
  "theme change does not affect sound preference parsing",
  soundBefore === false &&
    soundAfter === false &&
    serializeSoundPreference(false) === "off" &&
    stored === "dark",
);

setHudXpView({ amount: 12, celebrate: true });
persist("light");
const xpAfterTheme = readHudXpView();
check(
  "theme change does not affect XP HUD state",
  xpAfterTheme.amount === 12 && xpAfterTheme.celebrate === true,
);
resetHudXpView();

check(
  "bootstrap applies saved dark only",
  THEME_BOOTSTRAP_SCRIPT.includes('getItem("sidequest.theme")') &&
    THEME_BOOTSTRAP_SCRIPT.includes('if(s==="dark")t="dark"') &&
    THEME_BOOTSTRAP_SCRIPT.includes('data-theme') &&
    !THEME_BOOTSTRAP_SCRIPT.includes("prefers-color-scheme") &&
    !THEME_BOOTSTRAP_SCRIPT.includes("matchMedia"),
);

check(
  "bootstrap defaults to light",
  THEME_BOOTSTRAP_SCRIPT.includes(`var t="${DEFAULT_THEME}"`) &&
    DEFAULT_THEME === "light",
);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log("\nall theme checks passed");
