import Link from "next/link";
import { Home, LayoutDashboard } from "lucide-react";

type Props = {
  tripId: string;
  showSummary?: boolean;
  summaryLabel?: string;
  homeLabel?: string;
  /** Botones claros para cabeceras con gradiente oscuro. */
  variant?: "default" | "inverse";
};

export default function TripScreenActions({
  tripId,
  showSummary = true,
  summaryLabel = "Pantalla de resumen",
  homeLabel = "Pantalla de inicio",
  variant = "default",
}: Props) {
  const btn =
    variant === "inverse"
      ? "inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      : "inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60";

  return (
    <div className="flex flex-wrap gap-2">
      {showSummary ? (
        <Link href={`/trip/${tripId}`} className={btn}>
          <LayoutDashboard className="h-4 w-4" aria-hidden />
          {summaryLabel}
        </Link>
      ) : null}

      <Link href="/dashboard" className={btn}>
        <Home className="h-4 w-4" aria-hidden />
        {homeLabel}
      </Link>
    </div>
  );
}
