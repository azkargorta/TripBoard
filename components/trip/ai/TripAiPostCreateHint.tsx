"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Tras crear un viaje (Premium) con `?recien=1`: guía (A) o aviso de borrador automático (C conservadora).
 */
export default function TripAiPostCreateHint({
  tripId,
  enabled,
  autoBootstrap = false,
}: {
  tripId: string;
  enabled: boolean;
  /** Si true, el chat disparará solo un borrador (destino o fechas ya informadas). */
  autoBootstrap?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    const path = `/trip/${encodeURIComponent(tripId)}/ai-chat?recien=1&modo=planificador`;
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
              {autoBootstrap ? (
                <>
                  Ya había <span className="font-semibold">destino o fechas</span> en el viaje: vamos a lanzar{" "}
                  <span className="font-semibold">un borrador de itinerario</span> en el chat. Luego podrás revisarlo y
                  usar «Ejecutar plan» cuando encaje contigo.
                </>
              ) : (
                <>
                  Pide un itinerario abajo (por ejemplo «4 días en…») o pulsa «Sugerir itinerario» si el plan está
                  vacío. Cuando tengas un borrador, usa «Ejecutar plan» para volcar días, actividades y rutas.
                </>
              )}
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
