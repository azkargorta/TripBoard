"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { tripAssistantSurfaceFromPathname, tripAssistantSurfaceLabel } from "@/lib/trip-assistant-context";

const TripAiChatView = dynamic(() => import("@/components/trip/ai/TripAiChatView"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[220px] items-center justify-center text-sm text-slate-500">Cargando asistente…</div>
  ),
});

type Props = {
  tripId: string;
  isPremium: boolean;
};

export default function TripPageAssistantDock({ tripId, isPremium }: Props) {
  const pathname = usePathname();
  const surface = useMemo(() => tripAssistantSurfaceFromPathname(pathname), [pathname]);
  const [open, setOpen] = useState(false);

  if (!isPremium || !surface) return null;

  const surfaceLabel = tripAssistantSurfaceLabel(surface);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] right-4 z-[1090] inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white shadow-lg ring-2 ring-white/20 transition hover:bg-slate-800 md:bottom-8 md:right-6"
        aria-label={`Abrir asistente personal (${surfaceLabel})`}
        title={`Asistente personal · ${surfaceLabel}`}
      >
        <MessageCircle className="h-6 w-6" aria-hidden />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[1100] flex items-end justify-center md:items-center md:justify-end md:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            aria-label="Cerrar asistente personal"
            onClick={() => setOpen(false)}
          />
          <div
            className="relative flex max-h-[min(92dvh,880px)] w-full max-w-[560px] flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl md:max-h-[min(88dvh,820px)] md:rounded-3xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trip-assistant-dock-title"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div className="min-w-0">
                <p id="trip-assistant-dock-title" className="truncate text-sm font-bold text-slate-950">
                  Asistente personal · {surfaceLabel}
                </p>
                <p className="truncate text-xs text-slate-600">
                  Modo alineado con esta pestaña; puedes cambiar el modo manual si lo necesitas.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/trip/${encodeURIComponent(tripId)}/ai-chat`}
                  className="inline-flex max-w-[42%] shrink-0 items-center justify-center truncate rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 sm:max-w-none sm:px-3 sm:text-xs"
                  onClick={() => setOpen(false)}
                >
                  Pantalla completa
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4">
              <TripAiChatView
                key={surface}
                tripId={tripId}
                isPremium={isPremium}
                layout="drawer"
                assistantContext={surface}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
