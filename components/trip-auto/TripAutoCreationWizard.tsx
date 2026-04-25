"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import type { TripCreationIntent, ExecutableItineraryPayload } from "@/lib/trip-ai/tripCreationTypes";
import { joinTripPlaces } from "@/lib/trip-places";
import TripPlacesFields from "@/components/dashboard/TripPlacesFields";
import { buildTravelCurrencySelectOptions } from "@/lib/travel-currencies";

type Pace = "relajado" | "equilibrado" | "intenso";
type TravelTheme = "aventura" | "relax" | "gastronómico" | "cultural" | "naturaleza" | "fiesta" | "shopping" | "romántico";
const THEME_OPTIONS: Array<{ id: TravelTheme; label: string }> = [
  { id: "aventura", label: "Aventura" },
  { id: "relax", label: "Relax" },
  { id: "gastronómico", label: "Gastronómico" },
  { id: "cultural", label: "Cultural" },
  { id: "naturaleza", label: "Naturaleza" },
  { id: "fiesta", label: "Fiesta" },
  { id: "shopping", label: "Shopping" },
  { id: "romántico", label: "Romántico" },
];

function isoOk(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function readJsonResponse<T = any>(res: Response): Promise<{ data: T | null; raw: string }> {
  const raw = await res.text().catch(() => "");
  const trimmed = raw.trim();
  if (!trimmed) return { data: null, raw };
  try {
    return { data: JSON.parse(trimmed) as T, raw };
  } catch {
    if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") || trimmed.includes("<body")) {
      throw new Error("La respuesta del servidor no es JSON (posible sesión caducada o error HTML).");
    }
    throw new Error(`La respuesta del servidor no es JSON. Inicio: "${trimmed.replace(/\s+/g, " ").slice(0, 140)}"`);
  }
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
  const [routeCities, setRouteCities] = useState<string[]>([""]);
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
  const [themes, setThemes] = useState<TravelTheme[]>(["cultural"]);
  const [notes, setNotes] = useState("");

  // Visitas propuestas (chips)
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [mustSee, setMustSee] = useState<string[]>([]);

  // Preview
  const [itinerary, setItinerary] = useState<ExecutableItineraryPayload | null>(null);

  const destinationLabel = useMemo(() => joinTripPlaces(routeCities), [routeCities]);
  const currencyOptions = useMemo(() => buildTravelCurrencySelectOptions(destinationLabel), [destinationLabel]);

  const canStep1 = useMemo(() => {
    if (!isoOk(startDate) || !isoOk(endDate)) return false;
    if (endDate < startDate) return false; // se permite 1 día
    const list = routeCities.map((x) => x.trim()).filter(Boolean);
    return list.length >= 1;
  }, [routeCities, startDate, endDate]);

  const canStep2 = useMemo(() => {
    if (!canStep1) return false;
    if (!travelersType) return false;
    if (typeof travelersCount === "number" && travelersCount < 1) return false;
    return true;
  }, [canStep1, travelersCount, travelersType]);

  const intent = useMemo((): TripCreationIntent => {
    const cities = routeCities.map((x) => x.trim()).filter(Boolean);
    const main = cities[0] || null;
    const middleCities = cities.length >= 3 ? cities.slice(1, -1) : cities.length === 2 ? [] : [];
    const startCity = cities.length >= 2 ? cities[0]! : null;
    const endCity = cities.length >= 2 ? cities[cities.length - 1]! : null;
    const mustSeeMerged = [...middleCities, ...mustSee.map((x) => x.trim()).filter(Boolean)];
    return {
      destination: joinTripPlaces(cities) || main,
      startDate: isoOk(startDate) ? startDate : null,
      endDate: isoOk(endDate) ? endDate : null,
      startLocation: startCity,
      endLocation: endCity,
      travelersType,
      travelersCount: typeof travelersCount === "number" ? travelersCount : null,
      budgetLevel,
      wantsRouteOptimization: !forceOrder,
      mustSee: mustSeeMerged.length ? mustSeeMerged.slice(0, 18) : [],
      // traducimos el ritmo/tema/notas a constraints para que el modelo lo use como pista
      constraints: [
        `Ritmo: ${pace}`,
        themes.length ? `Temas: ${themes.join(", ")}` : "",
        notes.trim() ? `Notas del usuario: ${notes.trim()}` : "",
      ].filter(Boolean),
      suggestedTripName: tripName.trim() || null,
    };
  }, [budgetLevel, routeCities, endDate, forceOrder, pace, startDate, travelersCount, travelersType, tripName, themes, notes, mustSee]);

  function addMustSee(label: string) {
    const t = String(label || "").trim();
    if (!t) return;
    setMustSee((prev) => {
      const list = prev.map((x) => x.trim()).filter(Boolean);
      if (list.some((x) => x.toLowerCase() === t.toLowerCase())) return list;
      return [...list, t].slice(0, 24);
    });
  }

  function removeMustSee(label: string) {
    const t = String(label || "").trim().toLowerCase();
    setMustSee((prev) => prev.filter((x) => x.trim().toLowerCase() !== t));
  }

  async function loadSuggestions() {
    const main = routeCities.map((x) => x.trim()).filter(Boolean)[0] || "";
    if (!main) return;
    setSuggestionsLoading(true);
    setSuggestionsError(null);
    try {
      const res = await fetch("/api/trips/auto-plan/suggest-visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination: main, limit: 42 }),
      });
      const { data } = await readJsonResponse<any>(res);
      if (!res.ok) throw new Error(data?.error || "No se pudieron cargar sugerencias.");
      const list = Array.isArray(data?.suggestions) ? data.suggestions.map((x: any) => String(x || "").trim()).filter(Boolean) : [];
      setSuggestions(list.slice(0, 42));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudieron cargar sugerencias.";
      setSuggestionsError(msg);
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }

  // Autocarga de sugerencias en el paso 2 cuando hay destino.
  useEffect(() => {
    if (step !== 2) return;
    if (suggestionsLoading) return;
    const main = routeCities.map((x) => x.trim()).filter(Boolean)[0] || "";
    if (!main) return;
    if (suggestions.length) return;
    void loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, destinationLabel]);

  function toggleTheme(t: TravelTheme) {
    setThemes((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const has = list.includes(t);
      const next = has ? list.filter((x) => x !== t) : [...list, t];
      // Evitamos quedarse con 0 para no perder señal; si el usuario quita todo, volvemos a cultural.
      return next.length ? next : ["cultural"];
    });
  }

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
      const { data } = await readJsonResponse<any>(res);
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
      const list = routeCities.map((x) => x.trim()).filter(Boolean);
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
      const { data } = await readJsonResponse<any>(res);
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
                <TripPlacesFields places={routeCities} onChange={setRouteCities} />
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
                    if (isoOk(v) && (!endDate || endDate < v)) setEndDate(v);
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
                <div className="mt-1 text-xs font-semibold text-slate-500">Puede ser el mismo día (viaje de 1 día) o posterior.</div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-extrabold text-slate-900">Nombre del viaje (opcional)</label>
                <input
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  placeholder={isoOk(startDate) && isoOk(endDate) ? defaultTripName(routeCities, startDate, endDate) : "Ej. Argentina 2026"}
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
          <div className="grid gap-4">
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

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-extrabold text-slate-900">Estilo del viaje</label>
              <div className="flex flex-wrap gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3">
                {THEME_OPTIONS.map((opt) => {
                  const active = themes.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleTheme(opt.id)}
                      className={`rounded-full border px-3 py-1 text-xs font-extrabold transition ${
                        active
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
                      }`}
                      aria-pressed={active}
                      title={active ? "Quitar" : "Añadir"}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-500">Puedes elegir varios. Se usará para priorizar actividades y tono del plan.</div>
            </div>

            <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-extrabold text-slate-900">Visitas propuestas</div>
                <button
                  type="button"
                  onClick={loadSuggestions}
                  disabled={suggestionsLoading || loading || !routeCities.map((x) => x.trim()).filter(Boolean)[0]}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-extrabold text-slate-800 hover:bg-slate-100 disabled:opacity-60"
                >
                  {suggestionsLoading ? "Cargando..." : "Actualizar"}
                </button>
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-600">
                Sugerencias típicas (ciudades/regiones) para añadir como imprescindibles.
              </div>

              {suggestionsError ? (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                  {suggestionsError}
                </div>
              ) : null}

              <div className="mt-3 max-h-[260px] overflow-auto pr-1">
                <div className="flex flex-wrap gap-2">
                  {(suggestionsLoading ? [] : suggestions).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addMustSee(s)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-extrabold text-slate-800 hover:bg-slate-50"
                      title="Añadir como imprescindible"
                    >
                      {s}
                    </button>
                  ))}
                  {!suggestionsLoading && !suggestions.length ? (
                    <div className="text-xs font-semibold text-slate-500">Cargando sugerencias…</div>
                  ) : null}
                </div>
              </div>

              {mustSee.length ? (
                <div className="mt-4">
                  <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Imprescindibles</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {mustSee.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => removeMustSee(m)}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-extrabold text-slate-800 hover:bg-slate-100"
                        title="Quitar"
                      >
                        {m} ×
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-extrabold text-slate-900">Comentarios (chat)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. Me encanta el vino; evitar madrugar; quiero 1 día de relax en spa; me gustaría ver fútbol..."
                rows={4}
                className="w-full resize-y rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
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

