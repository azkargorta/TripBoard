"use client";

import Link from "next/link";
import Image from "next/image";
import TripBoardLogo from "@/components/brand/TripBoardLogo";
import { useTripBoardHeader } from "@/components/layout/TripBoardHeaderContext";
import TripPageHelp from "@/components/trip/common/TripPageHelp";
import TripBoardMobileMenu from "@/components/layout/TripBoardMobileMenu";

type Props = {
  tripId: string;
  tripName: string;
  dateRangeLabel?: string | null;
};

export default function TripBoardBrandRail({ tripId, tripName, dateRangeLabel }: Props) {
  const { header } = useTripBoardHeader();
  const safeTrim = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const section = safeTrim(header.section);
  const iconSrc = safeTrim(header.iconSrc);
  const iconAlt = safeTrim(header.iconAlt) || safeTrim(header.title) || safeTrim(header.section) || "Módulo";

  return (
    <header className="sticky top-0 z-50">
      {/* Main bar */}
      <div className="border-b border-[var(--border-default)] bg-[var(--surface-card)]/95 backdrop-blur-md shadow-sm shadow-slate-900/[0.04] dark:shadow-none">
        <div className="page-shell max-w-[1200px] !py-0">
          <div className="flex h-[64px] items-center justify-between gap-3">

            {/* Left: Logo + trip identity */}
            <div className="flex min-w-0 flex-1 items-center gap-3">

              {/* Kaviro logo mark — always visible, links to dashboard */}
              <Link
                href="/dashboard"
                className="shrink-0 flex items-center justify-center h-8 w-8 rounded-xl overflow-hidden ring-1 ring-slate-900/10 hover:ring-violet-400 transition-all duration-150"
                title="Mis viajes"
              >
                <Image
                  src="/brand/icon.png"
                  alt="Kaviro"
                  width={32}
                  height={32}
                  className="h-full w-full object-contain"
                  priority
                />
              </Link>

              {/* Divider */}
              <span className="h-4 w-px bg-slate-200 shrink-0" aria-hidden />

              {/* Module icon (if provided) */}
              {iconSrc && (
                <Link
                  href={`/trip/${tripId}/summary`}
                  className="shrink-0 inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200/80 transition hover:ring-violet-300 hover:shadow-sm"
                  title="Ir al resumen"
                >
                  <Image
                    src={iconSrc}
                    alt={iconAlt}
                    width={36}
                    height={36}
                    className="h-full w-full object-contain scale-[1.15]"
                    priority
                  />
                </Link>
              )}

              {/* Trip identity text */}
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0">
                  <Link
                    href={`/trip/${tripId}/summary`}
                    className="shrink-0 text-[13px] font-bold text-[var(--text-primary)] hover:text-[var(--brand)] transition-colors duration-150 truncate"
                    title="Ir al resumen del viaje"
                  >
                    {tripName}
                  </Link>
                  {section && (
                    <>
                      <span className="text-slate-300 text-xs shrink-0" aria-hidden>/</span>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-tertiary)] truncate">
                        {section}
                      </span>
                    </>
                  )}
                </div>
                {dateRangeLabel && (
                  <p className="text-[11px] font-medium text-[var(--text-tertiary)] leading-none mt-0.5 truncate">
                    {dateRangeLabel}
                  </p>
                )}
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex shrink-0 items-center gap-1.5">
              <TripPageHelp />

              {/* Desktop actions slot */}
              {header.actions ? (
                <div className="hidden md:flex max-w-[45vw] flex-nowrap justify-end gap-1.5 overflow-x-auto no-scrollbar items-center">
                  {header.actions}
                </div>
              ) : (
                <Link
                  href="/dashboard"
                  className="hidden md:inline-flex items-center gap-1.5 min-h-[34px] rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] shadow-sm transition hover:border-[var(--brand-border)] hover:text-[var(--brand)]"
                >
                  <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 8l6-6 6 6M3 7.5V14h4v-3h2v3h4V7.5"/></svg>
                  Mis viajes
                </Link>
              )}

              {/* Mobile hamburger */}
              <TripBoardMobileMenu tripId={tripId} />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
