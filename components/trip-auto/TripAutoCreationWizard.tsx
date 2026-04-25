"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import type { TripCreationIntent, ExecutableItineraryPayload } from "@/lib/trip-ai/tripCreationTypes";
import { joinTripPlaces } from "@/lib/trip-places";
import TripPlacesFields from "@/components/dashboard/TripPlacesFields";
import { buildTravelCurrencySelectOptions } from "@/lib/travel-currencies";

type Pace = "relajado" | "equilibrado" | "intenso";

function isoOk(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function defaultTripName(destinations: string[], startDate: string, endDate: string) {
  const dest = joinTripPlaces(destinations) || "Viaje";
  return `${dest} (${startDate} → ${endDate})`;
}

export default function TripAutoCreationWizard() {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Básicos
  const [destinations, setDestinations] = useState<string[]>([""]);
  const [forceOrder, setForceOrder] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tripName, setTripName] = useState("");
  const [baseCurrency, setBaseCurrency] = useState("EUR");

  // Estilo
  const [travelersType, setTravelersType] = useState<NonNullable<TripCreationIntent["travelersType"]>>("couple");
  const [travelersCount, setTravelersCount] = useState<number | "">(2);
  const [pace, setPace] = useState<Pace>("equilibrado");
  const [budgetLevel, setBudgetLevel] = useState<NonNullable<TripCreationIntent["budgetLevel"]>>("medium");

  // Preview
  const [itinerary, setItinerary] = useState<ExecutableItineraryPayload | null>(null);

  const destinationLabel = useMemo(() => joinTripPlaces(destinations), [destinations]);
  const currencyOptions = useMemo(() => buildTravelCurrencySelectOptions(destinationLabel), [destinationLabel]);

  const canStep1 = useMemo(() => {
    if (!isoOk(startDate) || !isoOk(endDate)) return false;
    if (endDate <= startDate) return false;
    const list = destinations.map((x) => x.trim()).filter(Boolean);
    return list.length >= 1;
  }, [destinations, startDate, endDate]);

  const canStep2 = useMemo(() => {
    if (!canStep1) return false;
    if (!travelersType) return false;
    if (typeof travelersCount === "number" && travelersCount < 1) return false;
    return true;
  }, [canStep1, travelersCount, travelersType]);

  const intent = useMemo((): TripCreationIntent => {
    const list = destinations.map((x) => x.trim()).filter(Boolean);
    const main = list[0] || null;
    const extra = list.slice(1);
    return {
      destination: main,
      startDate: isoOk(startDate) ? startDate : null,
      endDate: isoOk(endDate) ? endDate : null,
      travelersType,
      travelersCount: typeof travelersCount === "number" ? travelersCount : null,
      budgetLevel,
      wantsRouteOptimization: !forceOrder,
      mustSee: extra.length ? extra : [],
      // traducimos el ritmo a constraints para que el modelo lo use como pista
      constraints: [`Ritmo: ${pace}`],
      suggestedTripName: tripName.trim() || null,
    };
  }, [budgetLevel, destinations, endDate, forceOrder, pace, startDate, travelersCount, travelersType, tripName]);

  async function previewPlan() {
    if (loading) return;
    setLoading(true);
    setError(null);
    setItinerary(null);
    try {
      const res = await fetch("/api/trips/auto-plan/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent, pace, forceOrder }),
      });
      const raw = await res.text().catch(() => "");
      const data = raw ? JSON.parse(raw) : null;
      if (!res.ok) throw new Error(data?.error || "No se pudo generar la previsualización.");
      setItinerary(data?.itinerary || null);
      setStep(3);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo generar la previsualización.";
      setError(msg);
      toast.error("No se pudo generar el plan", msg);
    } finally {
      setLoading(false);
    }
  }

  async function createTripWithPlan() {
    if (loading) return;
    if (!itinerary) return;
    setLoading(true);
    setError(null);
    try {
      const list = destinations.map((x) => x.trim()).filter(Boolean);
      const name = (tripName.trim() || (isoOk(startDate) && isoOk(endDate) ? defaultTripName(list, startDate, endDate) : "")).trim();
      const res = await fetch("/api/trips/auto-plan/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip: {
            name,
            destination: joinTripPlaces(list) || null,
            start_date: isoOk(startDate) ? startDate : null,
            end_date: isoOk(endDate) ? endDate : null,
            base_currency: baseCurrency || "EUR",
          },
          itinerary,
          intent,
        }),
      });
      const raw = await res.text().catch(() => "");
      const data = raw ? JSON.parse(raw) : null;
      if (!res.ok) throw new Error(data?.error || "No se pudo crear el viaje automáticamente.");
      const tripId = String(data?.tripId || "");
      toast.success("Viaje creado", "He creado el viaje y sus planes automáticamente.");
      router.push(`/trip/${encodeURIComponent(tripId)}/plan`);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo crear el viaje automáticamente.";
      setError(msg);
      toast.error("No se pudo crear el viaje", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Crear viaje automático</h1>
        <p className="mt-2 text-slate-600">Dime fechas, destinos y estilo. Genero un plan detallado por día y lo guardo como planes del viaje.</p>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </div>
      ) : null}

      <div className="card-soft p-6">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${step === 1 ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
            1 · Básicos
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${step === 2 ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
            2 · Estilo
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${step === 3 ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
            3 · Plan
          </span>
        </div>

        {step === 1 ? (
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-extrabold text-slate-900">Destinos (en orden)</label>
                <TripPlacesFields places={destinations} onChange={setDestinations} />
                <div className="mt-2 flex items-start gap-2">
                  <input
                    id="forceOrder"
                    type="checkbox"
                    checked={forceOrder}
                    onChange={(e) => setForceOrder(Boolean(e.target.checked))}
                    className="mt-1 h-4 w-4"
                  />
                  <label htmlFor="forceOrder" className="text-sm text-slate-700">
                    Respetar mi orden. Si no, la IA optimizará el mejor recorrido.
                  </label>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-extrabold text-slate-900">Fecha inicio</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    setStartDate(v);
                    if (isoOk(v) && (!endDate || endDate <= v)) setEndDate(v);
                  }}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-extrabold text-slate-900">Fecha fin</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate || undefined}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
                />
                <div className="mt-1 text-xs font-semibold text-slate-500">Debe ser posterior a la fecha de inicio.</div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-extrabold text-slate-900">Nombre del viaje (opcional)</label>
                <input
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  placeholder={isoOk(startDate) && isoOk(endDate) ? defaultTripName(destinations, startDate, endDate) : "Ej. Argentina 2026"}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-extrabold text-slate-900">Moneda base</label>
                <select
                  value={baseCurrency}
                  onChange={(e) => setBaseCurrency(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
                >
                  {currencyOptions.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={!canStep1 || loading}
                onClick={() => setStep(2)}
                className="btn-primary disabled:opacity-50"
              >
                Continuar
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-extrabold text-slate-900">Tipo de viaje</label>
              <select
                value={travelersType}
                onChange={(e) => setTravelersType(e.target.value as any)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              >
                <option value="couple">En pareja</option>
                <option value="friends">Con amigos</option>
                <option value="family">Con familia</option>
                <option value="solo">Solo</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-extrabold text-slate-900">Nº viajeros</label>
              <input
                inputMode="numeric"
                value={travelersCount === "" ? "" : String(travelersCount)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!e.target.value) return setTravelersCount("");
                  setTravelersCount(Number.isFinite(n) ? Math.max(1, Math.min(50, Math.round(n))) : "");
                }}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-extrabold text-slate-900">Ritmo</label>
              <select
                value={pace}
                onChange={(e) => setPace(e.target.value as Pace)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              >
                <option value="relajado">Relajado</option>
                <option value="equilibrado">Equilibrado</option>
                <option value="intenso">Intenso</option>
              </select>
              <div className="mt-1 text-xs font-semibold text-slate-500">La IA ajustará cantidad y duración de actividades por día.</div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-extrabold text-slate-900">Presupuesto</label>
              <select
                value={budgetLevel}
                onChange={(e) => setBudgetLevel(e.target.value as any)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              >
                <option value="low">Bajo</option>
                <option value="medium">Medio</option>
                <option value="high">Alto</option>
              </select>
            </div>

            <div className="mt-2 flex gap-2 md:col-span-2">
              <button type="button" onClick={() => setStep(1)} className="btn-secondary">
                Atrás
              </button>
              <button type="button" disabled={!canStep2 || loading} onClick={previewPlan} className="btn-primary disabled:opacity-50">
                Calcular plan
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-extrabold text-slate-900">Previsualización</div>
                <div className="text-xs font-semibold text-slate-600">
                  {destinationLabel ? destinationLabel : "—"} · {startDate} → {endDate}
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(2)} className="btn-secondary">
                  Ajustar
                </button>
                <button type="button" disabled={loading || !itinerary} onClick={createTripWithPlan} className="btn-primary disabled:opacity-50">
                  Crear viaje
                </button>
              </div>
            </div>

            {!itinerary ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                {loading ? "Generando..." : "Pulsa “Calcular plan” para ver el itinerario."}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-3 text-sm font-extrabold text-slate-900">
                  {itinerary.title || "Itinerario"}
                </div>
                <div className="max-h-[520px] overflow-auto p-4">
                  <div className="space-y-4">
                    {itinerary.days.map((d) => (
                      <div key={String(d.day)} className="rounded-xl border border-slate-200 p-3">
                        <div className="text-sm font-extrabold text-slate-900">
                          Día {d.day} {d.date ? `· ${d.date}` : ""}
                        </div>
                        <div className="mt-2 space-y-2">
                          {(d.items || []).map((it, idx) => (
                            <div key={`${d.day}-${idx}`} className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-900">{it.title}</div>
                                <div className="text-xs text-slate-600">
                                  {(it.place_name || "").trim() ? it.place_name : ""}
                                  {(it.address || "").trim() ? ` · ${it.address}` : ""}
                                </div>
                              </div>
                              <div className="shrink-0 text-xs font-extrabold text-slate-700">
                                {it.start_time ? it.start_time : "—"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

