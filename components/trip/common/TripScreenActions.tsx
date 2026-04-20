import Link from "next/link";
import Image from "next/image";
import { Home } from "lucide-react";
import TripShareButton from "@/components/trip/common/TripShareButton";
import { mobileMenuRowBase, mobileMenuRowIconWrap } from "@/components/ui/mobileMenuStyles";
import { TRIP_TAB_SUMMARY_SRC } from "@/lib/trip-tab-assets";

type Props = {
  tripId: string;
  summaryLabel?: string;
  homeLabel?: string;
  /** Botones claros para cabeceras con gradiente oscuro. */
  variant?: "default" | "inverse";
  /** En móvil, mostrar texto junto al icono. */
  showLabels?: boolean;
  /** Filas apiladas estilo menú hamburguesa (viaje). */
  menuStack?: boolean;
};

export default function TripScreenActions({
  tripId,
  summaryLabel = "Resumen",
  homeLabel = "Mis viajes",
  variant = "default",
  showLabels = false,
  menuStack = false,
}: Props) {
  const desktopIconTile =
    "inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-sm ring-1 ring-slate-900/[0.04]";

  const btn =
    variant === "inverse"
      ? "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2 py-2 text-[10px] font-semibold text-white shadow-sm transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 sm:min-h-0 sm:min-w-0 sm:px-2 sm:py-1"
      : "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-2 text-[10px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 sm:min-h-0 sm:min-w-0 sm:px-2 sm:py-1";

  const row = mobileMenuRowBase;
  const iconWrap = mobileMenuRowIconWrap;

  if (menuStack && variant === "default") {
    return (
      <div className="flex w-full flex-col gap-2">
        <TripShareButton tripId={tripId} showLabels menuRow />
        <Link href="/dashboard" className={row} aria-label={homeLabel} title={homeLabel}>
          <span className={iconWrap}>
            <Home className="text-slate-800" aria-hidden />
          </span>
          {homeLabel}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 max-w-full flex-wrap gap-2">
      <TripShareButton tripId={tripId} showLabels={showLabels} />
      <Link href="/dashboard" className={btn} aria-label={homeLabel} title={homeLabel}>
        <span className={desktopIconTile} aria-hidden>
          <Home className="h-6 w-6 text-slate-900" aria-hidden />
        </span>
        <span className={showLabels ? "inline" : "hidden sm:inline"}>{homeLabel}</span>
      </Link>
    </div>
  );
}
