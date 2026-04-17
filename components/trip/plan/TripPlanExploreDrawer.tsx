"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import TripExploreView from "@/components/trip/explore/TripExploreView";

export type ExploreCreatePlanPayload = {
  title: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
};

export default function TripPlanExploreDrawer({
  tripId,
  open,
  onClose,
  onCreatePlan,
}: {
  tripId: string;
  open: boolean;
  onClose: () => void;
  onCreatePlan: (payload: ExploreCreatePlanPayload) => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label="Explorar">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
        aria-label="Cerrar explorar"
        onClick={onClose}
      />

      <div
        className="pointer-events-auto absolute right-0 top-0 flex h-full w-[min(96vw,1100px)] flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl"
        style={{
          paddingTop: "max(env(safe-area-inset-top), 12px)",
          paddingBottom: "max(env(safe-area-inset-bottom), 12px)",
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">Plan</div>
            <div className="mt-1 text-lg font-extrabold tracking-tight text-slate-950">Explorar</div>
            <div className="mt-1 text-xs text-slate-600">
              Busca lugares, visualiza chinchetas por categoría y crea un plan con coordenadas.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <TripExploreView
            tripId={tripId}
            onCreatePlan={(payload) => {
              onCreatePlan(payload);
              onClose();
            }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

