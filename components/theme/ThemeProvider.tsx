"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark";

type Ctx = {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<Ctx | null>(null);

function readStoredTheme(): ThemeMode | null {
  try {
    const v = window.localStorage.getItem("theme_mode");
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

function applyThemeClass(theme: ThemeMode) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("light");

  useEffect(() => {
    const stored = readStoredTheme();
    const prefersDark =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
        : false;
    const initial = stored ?? (prefersDark ? "dark" : "light");
    setThemeState(initial);
    applyThemeClass(initial);
  }, []);

  const setTheme = useCallback((t: ThemeMode) => {
    setThemeState(t);
    applyThemeClass(t);
    try {
      window.localStorage.setItem("theme_mode", t);
    } catch {
      // ignore
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeMode = prev === "dark" ? "light" : "dark";
      applyThemeClass(next);
      try {
        window.localStorage.setItem("theme_mode", next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const value = useMemo<Ctx>(() => ({ theme, setTheme, toggleTheme }), [setTheme, theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode() {
  const ctx = useContext(ThemeContext);
  // Igual que con el header: evitamos excepciones intermitentes en navegación.
  return (
    ctx ?? {
      theme: "light" as ThemeMode,
      setTheme: () => {},
      toggleTheme: () => {},
    }
  );
}

