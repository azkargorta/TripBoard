/**
 * Tokens de marca (cian primary, violeta secondary) para superficies y botones.
 * Objetivo: color solo en lo importante, el resto neutro.
 */

export const surfaceCard =
  "rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/[0.03]";

export const surfaceAccentCyan =
  "rounded-2xl border border-cyan-200/70 bg-gradient-to-br from-white via-cyan-50/50 to-sky-50/40 shadow-sm ring-1 ring-cyan-900/[0.06]";

export const btnPrimary =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:bg-cyan-200/70 disabled:text-white/80 disabled:shadow-none sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base";

export const btnSecondary =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-extrabold text-violet-950 shadow-sm transition hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base";

export const btnNeutral =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-2xl sm:px-5 sm:py-3";

export const chipGroup =
  "flex gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-1.5";

export const chipItemBase =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-4 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200";

export const chipItemActive = "bg-white text-slate-950 shadow-sm";
export const chipItemInactive = "text-slate-600 hover:text-slate-900";

