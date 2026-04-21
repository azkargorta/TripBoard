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
  /** Rango de fechas del viaje (ej. desde layout del servidor). */
  dateRangeLabel?: string | null;
};

export default function TripBoardBrandRail({ tripId, tripName, dateRangeLabel }: Props) {
  const { header } = useTripBoardHeader();
  const safeTrim = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const section = safeTrim(header.section);
  const iconSrc = safeTrim(header.iconSrc);
  const iconAlt = safeTrim(header.iconAlt) || safeTrim(header.title) || safeTrim(header.section) || "Módulo";

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="page-shell max-w-[1200px] !pb-2 !pt-[max(0.5rem,env(safe-area-inset-top))] md:!py-3">
        <div className="flex min-h-[80px] items-center justify-between gap-2 sm:min-h-[72px]">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {iconSrc ? (
              <Link
                href={`/trip/${tripId}/summary`}
                className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/70 ring-1 ring-slate-200 transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60"
                style={{ width: 42, height: 42 }}
                title="Ir al resumen del viaje"
              >
                <Image
                  src={iconSrc}
                  alt={iconAlt}
                  width={42}
                  height={42}
                  className="h-full w-full object-contain object-center scale-[1.18]"
                  priority
                />
              </Link>
            ) : (
              <TripBoardLogo
                href="/dashboard"
                variant="dark"
                size="md"
                withWordmark={false}
                className="shrink-0 scale-[2] origin-left"
              />
            )}
            <div className="min-w-0">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <Link
                    href={`/trip/${tripId}/summary`}
                    className="min-w-0 truncate text-xs font-bold text-slate-900 transition hover:text-violet-700 md:text-sm md:font-semibold"
                    title="Ir al resumen del viaje"
                  >
                    {tripName}
                  </Link>
                  {section ? (
                    <>
                      <span className="text-[10px] font-semibold text-slate-300 md:text-xs" aria-hidden>
                        /
                      </span>
                      <span className="min-w-0 max-w-[min(52vw,14rem)] truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 md:max-w-none md:text-[11px] md:tracking-[0.12em]">
                        {section}
                      </span>
                    </>
                  ) : null}
                </div>
                {dateRangeLabel ? (
                  <p className="truncate text-[10px] font-medium leading-tight text-slate-500 md:text-[11px]">
                    {dateRangeLabel}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <TripPageHelp />
            <TripBoardMobileMenu tripId={tripId} />
            {header.actions ? (
              <div className="hidden max-w-[45vw] flex-nowrap justify-end gap-1.5 overflow-x-auto no-scrollbar md:flex md:max-w-none">
                {header.actions}
              </div>
            ) : (
              <Link
                href="/dashboard"
                className="inline-flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 md:min-h-0 md:min-w-0 md:px-2.5 md:py-1 md:text-[11px]"
              >
                Mis viajes
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
