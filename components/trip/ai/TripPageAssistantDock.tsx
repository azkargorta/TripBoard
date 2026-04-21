"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { tripAssistantSurfaceFromPathname, tripAssistantSurfaceLabel } from "@/lib/trip-assistant-context";
import { iconSlotFab56, iconSlotFill40 } from "@/components/ui/iconTokens";

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
  const fullscreenHref = useMemo(() => {
    const base = `/trip/${encodeURIComponent(tripId)}/ai-chat`;
    if (surface === "routes") return `${base}?modo=desplazamientos`;
    if (surface === "resources") return `${base}?modo=documentos`;
    if (surface === "expenses") return `${base}?modo=gastos`;
    if (surface === "plan") return `${base}?modo=planificador`;
    return base;
  }, [surface, tripId]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] right-4 z-[1090] inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white shadow-lg ring-2 ring-white/20 transition hover:bg-slate-800 md:bottom-8 md:right-6 ${iconSlotFab56}`}
        aria-label={`Abrir asistente personal (${surfaceLabel})`}
        title={`Asistente personal · ${surfaceLabel}`}
      >
        <MessageCircle aria-hidden />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[1100] flex w-full min-w-0 items-end justify-center overflow-x-hidden px-2 pb-0 pt-0 md:items-center md:justify-end md:p-6 md:px-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            aria-label="Cerrar asistente personal"
            onClick={() => setOpen(false)}
          />
          <div
            className="relative flex max-h-[min(92dvh,880px)] w-full min-w-0 max-w-full flex-col overflow-x-hidden overflow-y-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-[560px] md:max-h-[min(88dvh,820px)] md:rounded-3xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trip-assistant-dock-title"
          >
            <div className="flex min-w-0 flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="min-w-0 pr-1">
                <p id="trip-assistant-dock-title" className="break-words text-sm font-bold text-slate-950">
                  Asistente personal · {surfaceLabel}
                </p>
                <p className="mt-0.5 break-words text-xs leading-snug text-slate-600">
                  Modo alineado con esta pestaña; puedes cambiar el modo manual si lo necesitas.
                </p>
              </div>
              <div className="flex min-w-0 shrink-0 items-stretch justify-end gap-2 sm:items-center">
                <Link
                  href={fullscreenHref}
                  className="inline-flex min-h-10 min-w-0 flex-1 items-center justify-center whitespace-normal rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold leading-snug text-slate-800 shadow-sm transition hover:bg-slate-50 sm:flex-none sm:min-w-[9.5rem]"
                  onClick={() => setOpen(false)}
                >
                  Pantalla completa
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 ${iconSlotFill40}`}
                  aria-label="Cerrar"
                >
                  <X aria-hidden />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden overflow-y-hidden p-3 sm:p-4">
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
