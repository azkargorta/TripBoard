"use client";

import Link from "next/link";
import TripBoardLogo from "@/components/brand/TripBoardLogo";
import { useTripBoardHeader } from "@/components/layout/TripBoardHeaderContext";

type Props = {
  tripId: string;
  tripName: string;
};

export default function TripBoardBrandRail({ tripId, tripName }: Props) {
  const { header } = useTripBoardHeader();
  const title = header.title?.trim() || "";
  const description = header.description?.trim() || "";
  const section = header.section?.trim() || "";

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="page-shell max-w-[1200px] py-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <TripBoardLogo href="/dashboard" variant="dark" size="sm" className="max-w-[140px]" />
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Link
                  href={`/trip/${tripId}`}
                  className="min-w-0 truncate text-xs font-semibold text-slate-800 transition hover:text-violet-700 sm:text-sm"
                  title="Ir al resumen del viaje"
                >
                  {tripName}
                </Link>
                {section ? (
                  <>
                    <span className="text-xs font-semibold text-slate-300" aria-hidden>
                      /
                    </span>
                    <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {section}
                    </span>
                  </>
                ) : null}
              </div>
              {title ? (
                <div className="mt-0.5 hidden truncate text-sm font-extrabold tracking-tight text-slate-950 sm:block sm:text-base">
                  {title}
                </div>
              ) : null}
              {description ? (
                <div className="mt-0.5 hidden line-clamp-1 max-w-[72ch] text-xs text-slate-600 md:block">
                  {description}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {header.actions ? <div className="flex flex-wrap justify-end gap-2">{header.actions}</div> : null}
            <Link
              href="/dashboard"
              className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60"
            >
              Mis viajes
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
