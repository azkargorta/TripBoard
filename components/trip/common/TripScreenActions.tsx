import Link from "next/link";

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
      ? "inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
      : "inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50";

  return (
    <div className="flex flex-wrap gap-2">
      {showSummary ? (
        <Link href={`/trip/${tripId}`} className={btn}>
          {summaryLabel}
        </Link>
      ) : null}

      <Link href="/dashboard" className={btn}>
        {homeLabel}
      </Link>
    </div>
  );
}
