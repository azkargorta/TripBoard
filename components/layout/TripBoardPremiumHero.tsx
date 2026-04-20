"use client";

import type { ReactNode } from "react";

type Props = {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

/**
 * Cabecera premium alineada con Participantes / Dashboard (gradiente + card-soft).
 */
export default function TripBoardPremiumHero({
  eyebrow,
  title,
  description,
  actions,
  footer,
  className = "",
}: Props) {
  return (
    <section className={`card-soft overflow-hidden ${className}`.trim()}>
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-900 px-6 py-8 text-white md:px-8 md:py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/80">
              <span className="text-white/40" aria-hidden>
                ·
              </span>
              <span className="truncate">{eyebrow}</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{title}</h1>
            {description ? (
              <p className="max-w-2xl text-sm leading-relaxed text-white/75 md:text-base">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2 md:justify-end">{actions}</div> : null}
        </div>
        {footer ? <div className="mt-8">{footer}</div> : null}
      </div>
    </section>
  );
}
