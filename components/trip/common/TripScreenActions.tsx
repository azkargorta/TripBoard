import Link from "next/link";
import { Compass, Home, LayoutDashboard } from "lucide-react";
import TripShareButton from "@/components/trip/common/TripShareButton";

type Props = {
  tripId: string;
  showSummary?: boolean;
  summaryLabel?: string;
  homeLabel?: string;
  /** Botones claros para cabeceras con gradiente oscuro. */
  variant?: "default" | "inverse";
  /** En móvil, mostrar texto junto al icono. */
  showLabels?: boolean;
};

export default function TripScreenActions({
  tripId,
  showSummary = true,
  summaryLabel = "Pantalla de resumen",
  homeLabel = "Pantalla de inicio",
  variant = "default",
  showLabels = false,
}: Props) {
  const btn =
    variant === "inverse"
      ? "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2 py-2 text-[10px] font-semibold text-white shadow-sm transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 sm:min-h-0 sm:min-w-0 sm:px-2 sm:py-1"
      : "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-2 text-[10px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 sm:min-h-0 sm:min-w-0 sm:px-2 sm:py-1";

  return (
    <div className="flex flex-wrap gap-2">
      <TripShareButton tripId={tripId} showLabels={showLabels} />
      {showSummary ? (
        <Link
          href={`/trip/${tripId}/summary`}
          className={btn}
          aria-label={summaryLabel}
          title={summaryLabel}
        >
          <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
          <span className={showLabels ? "inline" : "hidden sm:inline"}>{summaryLabel}</span>
        </Link>
      ) : null}

      <Link href="/dashboard" className={btn} aria-label={homeLabel} title={homeLabel}>
        <Home className="h-3.5 w-3.5" aria-hidden />
        <span className={showLabels ? "inline" : "hidden sm:inline"}>{homeLabel}</span>
      </Link>
    </div>
  );
}
