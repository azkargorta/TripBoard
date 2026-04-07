import Link from "next/link";
import TripBoardLogo from "@/components/brand/TripBoardLogo";

type Props = {
  tripId: string;
  tripName: string;
};

export default function TripBoardBrandRail({ tripId, tripName }: Props) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/90 bg-slate-950/92 backdrop-blur-md">
      <div className="page-shell flex h-14 max-w-[1200px] items-center justify-between gap-3 py-2 md:h-[3.75rem]">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <TripBoardLogo href="/dashboard" variant="light" size="sm" />
          <span className="hidden h-5 w-px shrink-0 bg-slate-600 sm:block" aria-hidden />
          <Link
            href={`/trip/${tripId}`}
            className="min-w-0 truncate text-sm font-semibold text-white transition hover:text-violet-200 md:text-base"
            title="Ir al resumen del viaje"
          >
            {tripName}
          </Link>
        </div>
        <Link
          href="/dashboard"
          className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white md:text-sm"
        >
          Mis viajes
        </Link>
      </div>
    </header>
  );
}
