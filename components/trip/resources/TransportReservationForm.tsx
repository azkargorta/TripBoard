"use client";

import { useEffect, useState } from "react";
import type { DetectedDocumentData } from "@/lib/document-analyzer";

export type TransportReservationFormData = {
  providerName: string;
  reservationName: string;
  reservationCode: string;
  transportType: string;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  origin: string;
  destination: string;
  passengers: string;
  seat: string;
  terminal: string;
  gate: string;
  totalAmount: string;
  currency: string;
  paymentStatus: "paid" | "pending";
  notes: string;
};

type Props = {
  saving?: boolean;
  detectedData?: DetectedDocumentData | null;
  onSubmit: (data: TransportReservationFormData) => Promise<void>;
};

const EMPTY_FORM: TransportReservationFormData = {
  providerName: "",
  reservationName: "",
  reservationCode: "",
  transportType: "flight",
  departureDate: "",
  departureTime: "",
  arrivalDate: "",
  arrivalTime: "",
  origin: "",
  destination: "",
  passengers: "",
  seat: "",
  terminal: "",
  gate: "",
  totalAmount: "",
  currency: "EUR",
  paymentStatus: "pending",
  notes: "",
};


function normalizePaymentStatus(value: unknown): "paid" | "pending" {
  return value === "paid" ? "paid" : "pending";
}

export default function TransportReservationForm({ saving = false, detectedData, onSubmit }: Props) {
  const [form, setForm] = useState<TransportReservationFormData>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!detectedData) return;

    const docType = detectedData.documentType;
    const suggestedType =
      docType === "flight_ticket" || docType === "boarding_pass"
        ? "flight"
        : docType === "train_ticket"
        ? "train"
        : docType === "rental_car"
        ? "car"
        : "flight";

    const meta = (detectedData.detectedData || {}) as Record<string, unknown>;

    setForm((current) => ({
      ...current,
      providerName: detectedData.providerName || current.providerName,
      reservationName: detectedData.reservationName || detectedData.title || current.reservationName,
      reservationCode: detectedData.reservationCode || current.reservationCode,
      transportType: suggestedType,
      departureDate: detectedData.checkInDate || current.departureDate,
      departureTime: detectedData.checkInTime || current.departureTime,
      arrivalDate: detectedData.checkOutDate || current.arrivalDate,
      arrivalTime: detectedData.checkOutTime || current.arrivalTime,
      origin: typeof meta.origin === "string" ? meta.origin : current.origin,
      destination: typeof meta.destination === "string" ? meta.destination : current.destination,
      passengers: typeof detectedData.guests === "number" ? String(detectedData.guests) : current.passengers,
      seat: typeof meta.seat === "string" ? meta.seat : current.seat,
      terminal: typeof meta.terminal === "string" ? meta.terminal : current.terminal,
      gate: typeof meta.gate === "string" ? meta.gate : current.gate,
      totalAmount: typeof detectedData.totalAmount === "number" ? String(detectedData.totalAmount) : current.totalAmount,
      currency: detectedData.currency || current.currency,
      paymentStatus: normalizePaymentStatus(detectedData.paymentStatus || current.paymentStatus),
      notes: detectedData.extractionWarning || current.notes,
    }));
  }, [detectedData]);

  function update<K extends keyof TransportReservationFormData>(key: K, value: TransportReservationFormData[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.reservationName.trim()) {
      setError("Introduce el nombre de la reserva de transporte.");
      return;
    }

    await onSubmit(form);
    setForm(EMPTY_FORM);
  }

  return (
    <div className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
            <span>✈️</span>
            <span>Transporte</span>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-slate-900">Plantilla · Transporte</h3>
          <p className="mt-1 text-sm text-slate-500">Para vuelos, trenes, ferry, bus o coche.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Proveedor</span>
            <input value={form.providerName} onChange={(e) => update("providerName", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Nombre</span>
            <input value={form.reservationName} onChange={(e) => update("reservationName", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Tipo</span>
            <select value={form.transportType} onChange={(e) => update("transportType", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3">
              <option value="flight">Vuelo</option>
              <option value="train">Tren</option>
              <option value="car">Coche</option>
              <option value="bus">Bus</option>
              <option value="ferry">Ferry</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Código</span>
            <input value={form.reservationCode} onChange={(e) => update("reservationCode", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Pasajeros</span>
            <input value={form.passengers} onChange={(e) => update("passengers", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Origen</span>
            <input value={form.origin} onChange={(e) => update("origin", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Destino</span>
            <input value={form.destination} onChange={(e) => update("destination", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Salida</span>
            <input type="date" value={form.departureDate} onChange={(e) => update("departureDate", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Hora salida</span>
            <input type="time" value={form.departureTime} onChange={(e) => update("departureTime", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Llegada</span>
            <input type="date" value={form.arrivalDate} onChange={(e) => update("arrivalDate", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Hora llegada</span>
            <input type="time" value={form.arrivalTime} onChange={(e) => update("arrivalTime", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Asiento</span>
            <input value={form.seat} onChange={(e) => update("seat", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Terminal</span>
            <input value={form.terminal} onChange={(e) => update("terminal", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Puerta</span>
            <input value={form.gate} onChange={(e) => update("gate", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
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

        <button type="submit" disabled={saving} className={`rounded-xl px-4 py-3 text-sm font-semibold ${saving ? "bg-slate-200 text-slate-500" : "bg-sky-600 text-white"}`}>
          {saving ? "Guardando..." : "Guardar transporte"}
        </button>
      </form>
    </div>
  );
}
