"use client";

import { useEffect, useState } from "react";
import type { WizardFormData } from "../TripWizardNew";

export default function Step3Generating({
  data,
  onNext,
  onBack,
  onError,
}: {
  data: WizardFormData;
  onNext: (data: Partial<WizardFormData>) => void;
  onBack: () => void;
  onError: (error: string | null) => void;
}) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        setLoading(true);
        onError(null);

        // Placeholder: este wizard nuevo todavía no está conectado al backend.
        // Para no romper el build, simulamos “generación” y pasamos al preview.
        await new Promise((r) => setTimeout(r, 650));

        if (cancelled) return;
        onNext({
          generatedItinerary: data.generatedItinerary ?? null,
          generatedAccommodations: data.generatedAccommodations ?? [],
          generatedRoutes: data.generatedRoutes ?? [],
        });
      } catch (e) {
        if (cancelled) return;
        onError(e instanceof Error ? e.message : "No se pudo generar el viaje.");
        setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Generando</h2>
        <p className="text-slate-600">Estamos preparando tu planning…</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-violet-500" />
        </div>
        <div className="mt-3 text-sm font-semibold text-slate-700">
          {loading ? "Generando con IA…" : "Listo."}
        </div>
      </div>

      <div className="flex justify-between pt-6">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-3 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition"
        >
          ← Atrás
        </button>
        <button
          type="button"
          disabled
          className="px-6 py-3 bg-violet-200 text-violet-700 font-semibold rounded-lg transition shadow-md"
          title="Se avanza automáticamente al terminar"
        >
          Continuar →
        </button>
      </div>
    </div>
  );
}

