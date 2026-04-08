import Link from "next/link";
import { Home, LayoutDashboard } from "lucide-react";

type Props = {
  tripId: string;
  variant?: "default" | "inverse";
};

export default function TripTabActions({ tripId, variant = "default" }: Props) {
  const className =
    variant === "inverse"
      ? "inline-flex items-center justify-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      : "inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60";

  return (
    <div className="flex flex-wrap gap-2">
      <Link href={`/trip/${tripId}`} className={className}>
        <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
        Pantalla de resumen
      </Link>
      <Link href="/dashboard" className={className}>
        <Home className="h-3.5 w-3.5" aria-hidden />
        Pantalla de inicio
      </Link>
    </div>
  );
}
