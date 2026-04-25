"use client";

import type { WizardFormData } from "../TripWizardNew";

export default function Step4Preview({
  data,
  onBack,
  onComplete,
  onUpdate,
  onError,
}: {
  data: WizardFormData;
  onBack: () => void;
  onComplete?: (tripId: string) => void;
  onUpdate: (updates: Partial<WizardFormData>) => void;
  onError: (error: string | null) => void;
}) {
  void onUpdate;
  void onError;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Previsualización</h2>
        <p className="text-slate-600">
          Revisa el resumen. (Este wizard nuevo aún no está conectado a la generación real.)
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
        <div className="grid gap-2">
          <div className="flex items-start justify-between gap-3">
            <span className="text-slate-500">Destino</span>
            <span className="font-semibold text-right">{data.destination || "—"}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-slate-500">Fechas</span>
            <span className="font-semibold text-right">
              {data.startDate && data.endDate ? `${data.startDate} → ${data.endDate}` : "—"}
            </span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-slate-500">Duración</span>
            <span className="font-semibold text-right">{data.durationDays ? `${data.durationDays} días` : "—"}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-6 border-t">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-3 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition"
        >
          ← Atrás
        </button>
        <button
          type="button"
          onClick={() => onComplete?.("demo-trip-id")}
          className="px-6 py-3 bg-slate-950 hover:bg-slate-800 text-white font-semibold rounded-lg transition shadow-md"
        >
          Crear viaje
        </button>
      </div>
    </div>
  );
}

