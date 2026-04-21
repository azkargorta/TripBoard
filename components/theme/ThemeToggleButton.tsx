"use client";

import { Moon, Sun } from "lucide-react";
import { useThemeMode } from "@/components/theme/ThemeProvider";

export default function ThemeToggleButton({ variant = "light" }: { variant?: "light" | "inverse" }) {
  const { theme, toggleTheme } = useThemeMode();
  const isDark = theme === "dark";

  const cls =
    variant === "inverse"
      ? "inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-sm transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      : "inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cls}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={isDark ? "Modo oscuro (activar claro)" : "Modo claro (activar oscuro)"}
    >
      {isDark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
    </button>
  );
}

