"use client";

import Link from "next/link";
import Image from "next/image";
import TripBoardLogo from "@/components/brand/TripBoardLogo";
import { useTripBoardHeader } from "@/components/layout/TripBoardHeaderContext";

type Props = {
  tripId: string;
  tripName: string;
};

export default function TripBoardBrandRail({ tripId, tripName }: Props) {
  const { header } = useTripBoardHeader();
  const section = header.section?.trim() || "";
  const iconSrc = header.iconSrc?.trim() || "";
  const iconAlt = header.iconAlt?.trim() || header.title?.trim() || header.section?.trim() || "Módulo";

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="page-shell max-w-[1200px] !pb-2 !pt-[max(0.5rem,env(safe-area-inset-top))] md:!py-3">
        <div className="flex min-h-[48px] items-center justify-between gap-2 sm:min-h-[44px]">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {iconSrc ? (
              <Link
                href={`/trip/${tripId}`}
                className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/70 ring-1 ring-slate-200 transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
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
                size="sm"
                className="shrink-0"
                imageClassName="h-6 w-auto max-w-none md:h-5"
              />
            )}
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <Link
                  href={`/trip/${tripId}`}
                  className="min-w-0 truncate text-xs font-bold text-slate-900 transition hover:text-cyan-700 md:text-sm md:font-semibold"
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
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {header.actions ? (
              <div className="flex max-w-[45vw] flex-nowrap justify-end gap-1.5 overflow-x-auto no-scrollbar md:max-w-none">
                {header.actions}
              </div>
            ) : (
              <Link
                href="/dashboard"
                className="inline-flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 md:min-h-0 md:min-w-0 md:px-2.5 md:py-1 md:text-[11px]"
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
