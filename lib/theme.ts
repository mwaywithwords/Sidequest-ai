/**
 * SIDEQUEST appearance preference.
 *
 * Light Mode is the product default. The operating system, browser, and
 * prefers-color-scheme must never choose the theme. Persistence is device
 * localStorage only — never a profile column or a network write.
 */

export const THEME_PREFERENCE_KEY = "sidequest.theme";
export const DEFAULT_THEME = "light";

export type Theme = "light" | "dark";

export const THEME_COLORS = {
  light: "#efe4c8",
  dark: "#0e0c18",
} as const;

const listeners = new Set<() => void>();
let memory: Theme | null = null;

export function parseThemePreference(raw: string | null | undefined): Theme {
  return raw === "dark" ? "dark" : DEFAULT_THEME;
}

export function serializeThemePreference(theme: Theme): Theme {
  return theme === "dark" ? "dark" : DEFAULT_THEME;
}

export function nextTheme(theme: Theme): Theme {
  return theme === "light" ? "dark" : "light";
}

export function readStoredThemePreference(): Theme {
  if (memory !== null) return memory;
  if (typeof window === "undefined") return DEFAULT_THEME;

  try {
    return parseThemePreference(
      window.localStorage.getItem(THEME_PREFERENCE_KEY),
    );
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyDocumentTheme(theme: Theme): void {
  if (typeof document === "undefined") return;

  const resolved = serializeThemePreference(theme);
  document.documentElement.setAttribute("data-theme", resolved);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", THEME_COLORS[resolved]);
  }
}

export function writeStoredThemePreference(theme: Theme): void {
  const resolved = serializeThemePreference(theme);
  memory = resolved;

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_PREFERENCE_KEY, resolved);
    } catch {
      // Private mode can refuse localStorage. Memory still holds the choice.
    }
  }

  applyDocumentTheme(resolved);

  for (const listener of listeners) listener();
}

export function subscribeThemePreference(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);

  if (typeof window === "undefined") {
    return () => {
      listeners.delete(onStoreChange);
    };
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_PREFERENCE_KEY) return;
    memory = parseThemePreference(event.newValue);
    applyDocumentTheme(memory);
    onStoreChange();
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Blocking bootstrap for the document head. Applies a saved dark preference
 * before first paint. Anything other than the stored value "dark" stays light,
 * including missing, invalid, and unavailable localStorage.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){var t="${DEFAULT_THEME}";try{var s=localStorage.getItem("${THEME_PREFERENCE_KEY}");if(s==="dark")t="dark";}catch(e){}document.documentElement.setAttribute("data-theme",t);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="dark"?"${THEME_COLORS.dark}":"${THEME_COLORS.light}");})();`;
