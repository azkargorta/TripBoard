/**
 * Tokens de marca (lila primary, violeta secondary) para superficies y botones.
 * Objetivo: color solo en lo importante, el resto neutro.
 */

export const surfaceCard =
  "rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/[0.03]";

export const surfaceAccentCyan =
  "rounded-2xl border border-violet-200/70 bg-gradient-to-br from-white via-violet-50/50 to-fuchsia-50/30 shadow-sm ring-1 ring-violet-900/[0.06]";

export const btnPrimary =
  "group inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-violet-600 via-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm ring-1 ring-white/10 transition hover:brightness-[0.98] hover:shadow-md active:translate-y-[0.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:cursor-not-allowed disabled:bg-violet-200/70 disabled:text-white/80 disabled:shadow-none disabled:ring-0 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base";

export const btnSecondary =
  "group inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-violet-200 bg-gradient-to-b from-violet-50 via-white to-violet-50/60 px-4 py-2.5 text-sm font-extrabold text-violet-950 shadow-sm ring-1 ring-slate-900/[0.02] transition hover:border-violet-300 hover:shadow-md active:translate-y-[0.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base";

export const btnNeutral =
  "group inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-gradient-to-b from-white via-white to-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-900/[0.02] transition hover:border-slate-300 hover:shadow-md active:translate-y-[0.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-2xl sm:px-5 sm:py-3";

export const chipGroup =
  "flex gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-1.5";

export const chipItemBase =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-4 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200";

export const chipItemActive = "bg-white text-slate-950 shadow-sm";
export const chipItemInactive = "text-slate-600 hover:text-slate-900";

