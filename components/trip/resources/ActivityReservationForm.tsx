"use client";

import { useEffect, useState } from "react";
import type { DetectedDocumentData } from "@/lib/document-analyzer";

export type ActivityReservationFormData = {
  providerName: string;
  reservationName: string;
  reservationCode: string;
  activityDate: string;
  activityTime: string;
  location: string;
  participants: string;
  duration: string;
  meetingPoint: string;
  language: string;
  totalAmount: string;
  currency: string;
  paymentStatus: "paid" | "pending";
  notes: string;
};

type Props = {
  saving?: boolean;
  detectedData?: DetectedDocumentData | null;
  onSubmit: (data: ActivityReservationFormData) => Promise<void>;
};

const EMPTY_FORM: ActivityReservationFormData = {
  providerName: "",
  reservationName: "",
  reservationCode: "",
  activityDate: "",
  activityTime: "",
  location: "",
  participants: "",
  duration: "",
  meetingPoint: "",
  language: "",
  totalAmount: "",
  currency: "EUR",
  paymentStatus: "pending",
  notes: "",
};


function normalizePaymentStatus(value: unknown): "paid" | "pending" {
  return value === "paid" ? "paid" : "pending";
}

export default function ActivityReservationForm({ saving = false, detectedData, onSubmit }: Props) {
  const [form, setForm] = useState<ActivityReservationFormData>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!detectedData) return;

    const meta = (detectedData.detectedData || {}) as Record<string, unknown>;

    setForm((current) => ({
      ...current,
      providerName: detectedData.providerName || current.providerName,
      reservationName: detectedData.reservationName || detectedData.title || current.reservationName,
      reservationCode: detectedData.reservationCode || current.reservationCode,
      activityDate: detectedData.checkInDate || current.activityDate,
      activityTime: detectedData.checkInTime || current.activityTime,
      location: detectedData.address || current.location,
      participants: typeof detectedData.guests === "number" ? String(detectedData.guests) : current.participants,
      duration: typeof meta.duration === "string" ? meta.duration : current.duration,
      meetingPoint: typeof meta.meetingPoint === "string" ? meta.meetingPoint : current.meetingPoint,
      language: typeof meta.language === "string" ? meta.language : current.language,
      totalAmount: typeof detectedData.totalAmount === "number" ? String(detectedData.totalAmount) : current.totalAmount,
      currency: detectedData.currency || current.currency,
      paymentStatus: normalizePaymentStatus(detectedData.paymentStatus || current.paymentStatus),
      notes: detectedData.extractionWarning || current.notes,
    }));
  }, [detectedData]);

  function update<K extends keyof ActivityReservationFormData>(key: K, value: ActivityReservationFormData[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.reservationName.trim()) {
      setError("Introduce el nombre de la actividad.");
      return;
    }

    await onSubmit(form);
    setForm(EMPTY_FORM);
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            <span>🎟️</span>
            <span>Actividad</span>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-slate-900">Plantilla · Actividad</h3>
          <p className="mt-1 text-sm text-slate-500">Para tours, entradas, visitas y experiencias.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Proveedor</span>
            <input value={form.providerName} onChange={(e) => update("providerName", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Actividad</span>
            <input value={form.reservationName} onChange={(e) => update("reservationName", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Código</span>
            <input value={form.reservationCode} onChange={(e) => update("reservationCode", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Fecha</span>
            <input type="date" value={form.activityDate} onChange={(e) => update("activityDate", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Hora</span>
            <input type="time" value={form.activityTime} onChange={(e) => update("activityTime", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Participantes</span>
            <input value={form.participants} onChange={(e) => update("participants", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
        </div>

        <label className="space-y-2 block">
          <span className="text-sm font-semibold text-slate-800">Ubicación</span>
          <input value={form.location} onChange={(e) => update("location", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
        </label>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Duración</span>
            <input value={form.duration} onChange={(e) => update("duration", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Punto de encuentro</span>
            <input value={form.meetingPoint} onChange={(e) => update("meetingPoint", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Idioma</span>
            <input value={form.language} onChange={(e) => update("language", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Importe</span>
            <input value={form.totalAmount} onChange={(e) => update("totalAmount", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Moneda</span>
            <input value={form.currency} onChange={(e) => update("currency", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Pago</span>
            <select value={form.paymentStatus} onChange={(e) => update("paymentStatus", e.target.value as "paid" | "pending")} className="w-full rounded-xl border border-slate-300 px-4 py-3">
              <option value="pending">Pendiente</option>
              <option value="paid">Pagado</option>
            </select>
          </label>
        </div>

        <label className="space-y-2 block">
          <span className="text-sm font-semibold text-slate-800">Notas</span>
          <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={4} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
        </label>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        <button type="submit" disabled={saving} className={`rounded-xl px-4 py-3 text-sm font-semibold ${saving ? "bg-slate-200 text-slate-500" : "bg-emerald-600 text-white"}`}>
          {saving ? "Guardando..." : "Guardar actividad"}
        </button>
      </form>
    </div>
  );
}
