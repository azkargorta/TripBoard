"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import TripPlacesFields from "@/components/dashboard/TripPlacesFields";
import { joinTripPlaces, splitTripPlaces } from "@/lib/trip-places";

export type TripEditFields = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  base_currency: string | null;
};

function buildCurrencyOptions() {
  const values: string[] =
    typeof Intl !== "undefined" && typeof (Intl as any).supportedValuesOf === "function"
      ? ((Intl as any).supportedValuesOf("currency") as string[])
      : ["EUR", "USD", "GBP", "JPY", "CHF"];

  const dn =
    typeof Intl !== "undefined" && typeof (Intl as any).DisplayNames === "function"
      ? new (Intl as any).DisplayNames(["es-ES"], { type: "currency" })
      : null;

  return values
    .filter((c) => typeof c === "string" && /^[A-Z]{3}$/.test(c))
    .sort()
    .map((code) => ({
      code,
      label: dn ? `${code} · ${dn.of(code)}` : code,
    }));
}

export default function TripDashboardEditDialog({
  trip,
  open,
  onClose,
  onSaved,
}: {
  trip: TripEditFields | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const currencyOptions = useMemo(() => buildCurrencyOptions(), []);
  const [places, setPlaces] = useState<string[]>([""]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [baseCurrency, setBaseCurrency] = useState("EUR");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!trip || !open) return;
    setPlaces(splitTripPlaces(trip.destination));
    setStartDate(trip.start_date ?? "");
    setEndDate(trip.end_date ?? "");
    const cur = (trip.base_currency || "EUR").toUpperCase();
    setBaseCurrency(/^[A-Z]{3}$/.test(cur) ? cur : "EUR");
    setError(null);
  }, [trip, open]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!trip) return;
    if (startDate && endDate && startDate > endDate) {
      setError("La fecha de inicio no puede ser posterior a la fecha de fin.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${encodeURIComponent(trip.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          destination: joinTripPlaces(places) || null,
          start_date: startDate || null,
          end_date: endDate || null,
          base_currency: baseCurrency || "EUR",
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || `Error ${res.status}`);
      toast.success("Viaje actualizado", "Destino, fechas y moneda guardados.");
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo guardar.";
      setError(msg);
      toast.error("No se pudo guardar", msg);
    } finally {
      setSaving(false);
    }
  }

  if (!mounted || !open || !trip) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/40 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trip-dash-edit-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Editar viaje</p>
            <h2 id="trip-dash-edit-title" className="mt-1 truncate text-lg font-bold text-slate-950">
              {trip.name}
            </h2>
            <p className="mt-1 text-xs text-slate-500">Moneda, destino y fechas (requiere permiso de gestión del viaje).</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSave(e)} className="space-y-4 px-5 py-5">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
          ) : null}

          <TripPlacesFields places={places} onChange={setPlaces} />

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Moneda base del viaje</label>
            <select
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
            >
              {currencyOptions.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Fecha inicio</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Fecha fin</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
