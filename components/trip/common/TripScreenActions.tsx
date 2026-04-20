import Link from "next/link";
import Image from "next/image";
import { Home, LayoutDashboard } from "lucide-react";
import TripShareButton from "@/components/trip/common/TripShareButton";
import { mobileMenuRowBase, mobileMenuRowIconWrap } from "@/components/ui/mobileMenuStyles";
import { iconInline16 } from "@/components/ui/iconTokens";
import { TRIP_TAB_SUMMARY_SRC } from "@/lib/trip-tab-assets";

type Props = {
  tripId: string;
  showSummary?: boolean;
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
  showSummary = true,
  summaryLabel = "Resumen",
  homeLabel = "Mis viajes",
  variant = "default",
  showLabels = false,
  menuStack = false,
}: Props) {
  const desktopIconTile =
    "inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]";

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
        {showSummary ? (
          <Link
            href={`/trip/${tripId}/summary`}
            className={row}
            aria-label={summaryLabel}
            title={summaryLabel}
          >
            <span className={iconWrap}>
              <LayoutDashboard className="text-violet-700" aria-hidden />
            </span>
            {summaryLabel}
          </Link>
        ) : null}
        <Link href="/dashboard" className={row} aria-label={homeLabel} title={homeLabel}>
          <span className={iconWrap}>
            <Home className="text-cyan-700" aria-hidden />
          </span>
          {homeLabel}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 max-w-full flex-wrap gap-2">
      <TripShareButton tripId={tripId} showLabels={showLabels} />
      {showSummary ? (
        <Link
          href={`/trip/${tripId}/summary`}
          className={btn}
          aria-label={summaryLabel}
          title={summaryLabel}
        >
          <span className={desktopIconTile} aria-hidden>
            <Image src={TRIP_TAB_SUMMARY_SRC} alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" />
          </span>
          <span className={showLabels ? "inline" : "hidden sm:inline"}>{summaryLabel}</span>
        </Link>
      ) : null}

      <Link href="/dashboard" className={btn} aria-label={homeLabel} title={homeLabel}>
        <span className={desktopIconTile} aria-hidden>
          <Image src="/brand/icon.png" alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" />
        </span>
        <span className={showLabels ? "inline" : "hidden sm:inline"}>{homeLabel}</span>
      </Link>
    </div>
  );
}
