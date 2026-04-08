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
      <div className="page-shell max-w-[1200px] py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <TripBoardLogo href="/dashboard" variant="dark" size="sm" className="mt-1" />
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Link
                  href={`/trip/${tripId}`}
                  className="min-w-0 truncate text-sm font-semibold text-slate-900 transition hover:text-violet-700"
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
              {title ? <div className="mt-1 truncate text-base font-black tracking-tight text-slate-950">{title}</div> : null}
              {description ? (
                <div className="mt-0.5 line-clamp-1 max-w-[72ch] text-sm text-slate-600">{description}</div>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-start">
            {header.actions ? <div className="flex flex-wrap justify-end gap-2">{header.actions}</div> : null}
            <Link
              href="/dashboard"
              className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 md:text-sm"
            >
              Mis viajes
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
