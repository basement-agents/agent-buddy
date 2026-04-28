import { useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark" | "system";

const VALID_THEMES: Theme[] = ["light", "dark", "system"];
const STORAGE_KEY = "agent-buddy-theme";

function getSystemTheme(): "light" | "dark" {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch (err) {
    console.warn("Failed to detect system theme", err);
    return "light";
  }
}

function applyTheme(resolved: "light" | "dark") {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (VALID_THEMES as readonly string[]).includes(stored)) return stored as Theme;
    return "system";
  } catch (err) {
    console.warn("Failed to read stored theme", err);
    return "system";
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  const resolvedTheme: "light" | "dark" = theme === "system" ? getSystemTheme() : theme;

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme(getSystemTheme());
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch (err) { console.warn("Failed to persist theme", err); }
  }, []);

  return { theme, resolvedTheme, setTheme };
}
