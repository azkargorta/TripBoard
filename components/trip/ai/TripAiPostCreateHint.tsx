"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Tras crear un viaje (Premium) con `?recien=1`: mensaje de “momento wow” y limpieza de la URL.
 */
export default function TripAiPostCreateHint({ tripId, enabled }: { tripId: string; enabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    const path = `/trip/${encodeURIComponent(tripId)}/ai-chat`;
    router.replace(path, { scroll: false });
  }, [enabled, tripId, router]);

  if (!open) return null;

  return (
    <div className="mb-4 w-full">
      <div className="relative overflow-hidden rounded-2xl border border-emerald-200/90 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 px-4 py-4 shadow-sm md:px-5">
        <div className="absolute inset-y-0 left-0 w-1 rounded-l-2xl bg-emerald-500" aria-hidden />
        <div className="flex flex-col gap-3 pl-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-800">¡Viaje creado!</p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              Pide un itinerario abajo (por ejemplo «4 días en…») o pulsa «Sugerir itinerario» si el plan está vacío.
              Cuando tengas un borrador, usa «Ejecutar plan» para volcar días, actividades y rutas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="shrink-0 self-start rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-50 sm:self-auto"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
