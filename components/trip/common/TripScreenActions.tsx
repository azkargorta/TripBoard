import Link from "next/link";

type Props = {
  tripId: string;
  showSummary?: boolean;
  summaryLabel?: string;
  homeLabel?: string;
};

export default function TripScreenActions({
  tripId,
  showSummary = true,
  summaryLabel = "Pantalla de resumen",
  homeLabel = "Pantalla de inicio",
}: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {showSummary ? (
        <Link
          href={`/trip/${tripId}`}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
        >
          {summaryLabel}
        </Link>
      ) : null}

      <Link
        href="/dashboard"
        className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
      >
        {homeLabel}
      </Link>
    </div>
  );
}
