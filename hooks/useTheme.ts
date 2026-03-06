"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  // Respect OS preference if no explicit choice stored
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

/**
 * Hook that manages the light/dark theme.
 * - Reads the initial theme from localStorage (or OS preference).
 * - Applies the `dark` class to `<html>` whenever the theme changes.
 * - Persists the user's choice to localStorage.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  // Initializer runs once on the client — avoids a setState-in-effect lint error.
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // Sync the <html> class whenever theme changes (including after hydration).
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "light" ? "dark" : "light";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
