/**
 * Tokens de marca usando CSS variables.
 * Light: Indigo #4F46E5 · Dark: Coral #F87171
 */

export const surfaceCard =
  "rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]";

export const surfaceAccentCyan =
  "rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-light)] shadow-[var(--shadow-card)]";

export const btnPrimary =
  "group inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-[var(--brand-hover)] hover:shadow-md active:translate-y-[0.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-border)] disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base";

export const btnSecondary =
  "group inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-light)] px-4 py-2.5 text-sm font-extrabold text-[var(--brand-text)] shadow-sm transition hover:border-[var(--brand)] hover:shadow-md active:translate-y-[0.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-border)] disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base";

export const btnNeutral =
  "group inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] shadow-sm transition hover:border-[var(--border-default)] hover:shadow-md active:translate-y-[0.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-border)] disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-2xl sm:px-5 sm:py-3";

export const chipGroup =
  "flex gap-2 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-page)] p-1.5";

export const chipItemBase =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-4 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-border)]";

export const chipItemActive = "bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm";
export const chipItemInactive = "text-[var(--text-secondary)] hover:text-[var(--text-primary)]";
