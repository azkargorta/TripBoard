import Link from "next/link";
import Image from "next/image";
import { Home, LayoutDashboard } from "lucide-react";
import { iconInline16 } from "@/components/ui/iconTokens";
import { TRIP_TAB_SUMMARY_SRC } from "@/lib/trip-tab-assets";

type Props = {
  tripId: string;
  variant?: "default" | "inverse";
};

export default function TripTabActions({ tripId, variant = "default" }: Props) {
  const desktopIconTile =
    "inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]";

  const className =
    variant === "inverse"
      ? "inline-flex items-center justify-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-semibold text-white shadow-sm transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      : "inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60";

  return (
    <div className="flex min-w-0 max-w-full flex-wrap gap-2">
      <Link
        href={`/trip/${tripId}/summary`}
        className={className}
        aria-label="Resumen"
        title="Resumen"
      >
        <span className={desktopIconTile} aria-hidden>
          <Image src={TRIP_TAB_SUMMARY_SRC} alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" />
        </span>
        <span className="hidden sm:inline">Resumen</span>
      </Link>
      <Link href="/dashboard" className={className} aria-label="Mis viajes" title="Mis viajes">
        <span className={desktopIconTile} aria-hidden>
          <Image src="/brand/icon.png" alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" />
        </span>
        <span className="hidden sm:inline">Mis viajes</span>
      </Link>
    </div>
  );
}
