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
  const section = header.section?.trim() || "";

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="page-shell max-w-[1200px]">
        <div className="flex h-10 items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <TripBoardLogo
              href="/dashboard"
              variant="dark"
              size="sm"
              className="shrink-0"
              imageClassName="h-7 w-auto max-w-none"
            />
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Link
                  href={`/trip/${tripId}`}
                  className="min-w-0 truncate text-[11px] font-semibold text-slate-800 transition hover:text-violet-700 sm:text-sm"
                  title="Ir al resumen del viaje"
                >
                  {tripName}
                </Link>
                {section ? (
                  <>
                    <span className="text-xs font-semibold text-slate-300" aria-hidden>
                      /
                    </span>
                    <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {section}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {header.actions ? (
              <div className="flex flex-wrap justify-end gap-1.5">{header.actions}</div>
            ) : (
              <Link
                href="/dashboard"
                className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60"
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
