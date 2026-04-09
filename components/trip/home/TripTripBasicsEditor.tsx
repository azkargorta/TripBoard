"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PlaceAutocompleteInput from "@/components/PlaceAutocompleteInput";
import { Pencil, Save, X } from "lucide-react";

type Props = {
  tripId: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  baseCurrency: string | null;
  canEdit: boolean;
};

function asIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

export default function TripTripBasicsEditor({
  tripId,
  destination,
  startDate,
  endDate,
  baseCurrency,
  canEdit,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nextDestination, setNextDestination] = useState(destination ?? "");
  const [nextStart, setNextStart] = useState(startDate ?? "");
  const [nextEnd, setNextEnd] = useState(endDate ?? "");
  const [nextCurrency, setNextCurrency] = useState((baseCurrency || "EUR").toUpperCase());

  const endMin = useMemo(() => (nextStart ? asIsoDate(nextStart) : ""), [nextStart]);

  async function submit() {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${encodeURIComponent(tripId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: nextDestination.trim() || null,
          start_date: nextStart ? asIsoDate(nextStart) : null,
          end_date: nextEnd ? asIsoDate(nextEnd) : null,
          base_currency: nextCurrency.trim().toUpperCase() || null,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || "No se pudo guardar.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setNextDestination(destination ?? "");
          setNextStart(startDate ?? "");
          setNextEnd(endDate ?? "");
          setNextCurrency((baseCurrency || "EUR").toUpperCase());
          setError(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        title="Editar viaje"
      >
        <Pencil className="h-4 w-4" aria-hidden />
        Editar
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 p-3 sm:items-center">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">
                  Datos principales
                </div>
                <div className="mt-1 text-xl font-bold text-slate-950">Editar viaje</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50"
                aria-label="Cerrar"
                title="Cerrar"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <div className="mt-4 grid gap-4">
              <PlaceAutocompleteInput
                value={nextDestination}
                onChange={setNextDestination}
                label="Lugar / destino"
                placeholder="Ciudad, región o país"
                onPlaceSelect={(p) => setNextDestination(p.address)}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Fecha inicio</span>
                  <input
                    type="date"
                    value={nextStart}
                    onChange={(e) => {
                      const v = e.target.value;
                      setNextStart(v);
                      if (nextEnd && v && nextEnd < v) setNextEnd(v);
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Fecha fin</span>
                  <input
                    type="date"
                    value={nextEnd}
                    min={endMin || undefined}
                    onChange={(e) => setNextEnd(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Moneda base</span>
                <input
                  value={nextCurrency}
                  onChange={(e) => setNextCurrency(e.target.value)}
                  placeholder="EUR"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 uppercase outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
                <div className="text-xs text-slate-500">Código ISO (ej. EUR, USD, ARS).</div>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void submit()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                <Save className="h-4 w-4" aria-hidden />
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

