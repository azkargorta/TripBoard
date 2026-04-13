"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Route, Save } from "lucide-react";

type PlanItem = {
  id: string;
  title: string | null;
  place_name?: string | null;
  address?: string | null;
  activity_date?: string | null;
};

type RouteRow = {
  id: string;
  title?: string | null;
  route_name?: string | null;
  name?: string | null;
  route_day?: string | null;
  route_date?: string | null;
  departure_time?: string | null;
  travel_mode?: string | null;
  duration_text?: string | null;
  arrival_time?: string | null;
  origin_name?: string | null;
  origin_address?: string | null;
  destination_name?: string | null;
  destination_address?: string | null;
  stop_name?: string | null;
  stop_address?: string | null;
};

function displayPlanLabel(p: PlanItem) {
  const title = String(p.title || "").trim();
  const where = String(p.place_name || p.address || "").trim();
  return [title || "Plan", where].filter(Boolean).join(" · ");
}

export default function TripRoutesFreeView({ tripId }: { tripId: string }) {
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [form, setForm] = useState({
    routeName: "",
    departureTime: "",
    travelMode: "DRIVING",
    durationText: "",
    originPlanId: "",
    destinationPlanId: "",
    originText: "",
    destinationText: "",
  });

  const selectedOrigin = useMemo(
    () => plans.find((p) => String(p.id) === String(form.originPlanId)) || null,
    [plans, form.originPlanId]
  );
  const selectedDestination = useMemo(
    () => plans.find((p) => String(p.id) === String(form.destinationPlanId)) || null,
    [plans, form.destinationPlanId]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [pRes, rRes] = await Promise.all([
          fetch(`/api/trip-activities?tripId=${encodeURIComponent(tripId)}`, { cache: "no-store" }),
          fetch(`/api/trip-routes?tripId=${encodeURIComponent(tripId)}`, { cache: "no-store" }),
        ]);
        const [pPayload, rPayload] = await Promise.all([
          pRes.json().catch(() => null),
          rRes.json().catch(() => null),
        ]);

        const nextPlans = Array.isArray(pPayload?.activities) ? (pPayload.activities as any[]) : [];
        const nextRoutes = Array.isArray(rPayload?.routes) ? (rPayload.routes as any[]) : [];
        if (cancelled) return;

        setPlans(
          nextPlans
            .filter((x) => x && x.id)
            .map((x) => ({
              id: String(x.id),
              title: typeof x.title === "string" ? x.title : null,
              place_name: typeof x.place_name === "string" ? x.place_name : null,
              address: typeof x.address === "string" ? x.address : null,
              activity_date: typeof x.activity_date === "string" ? x.activity_date : null,
            }))
        );
        setRoutes(
          nextRoutes
            .filter((x) => x && x.id)
            .map((x) => ({
              id: String(x.id),
              title: typeof x.title === "string" ? x.title : null,
              route_name: typeof x.route_name === "string" ? x.route_name : null,
              name: typeof x.name === "string" ? x.name : null,
              route_day: typeof x.route_day === "string" ? x.route_day : null,
              route_date: typeof x.route_date === "string" ? x.route_date : null,
              departure_time: typeof x.departure_time === "string" ? x.departure_time : null,
              travel_mode: typeof x.travel_mode === "string" ? x.travel_mode : null,
              duration_text: typeof x.duration_text === "string" ? x.duration_text : null,
              arrival_time: typeof x.arrival_time === "string" ? x.arrival_time : null,
              origin_name: typeof x.origin_name === "string" ? x.origin_name : null,
              origin_address: typeof x.origin_address === "string" ? x.origin_address : null,
              destination_name: typeof x.destination_name === "string" ? x.destination_name : null,
              destination_address: typeof x.destination_address === "string" ? x.destination_address : null,
              stop_name: typeof x.stop_name === "string" ? x.stop_name : null,
              stop_address: typeof x.stop_address === "string" ? x.stop_address : null,
            }))
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "No se pudieron cargar rutas/planes.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  async function createRoute() {
    setError(null);
    setInfo(null);

    const routeName = form.routeName.trim() || "Ruta";
    const origin =
      (selectedOrigin?.place_name || selectedOrigin?.address || "").trim() || form.originText.trim();
    const destination =
      (selectedDestination?.place_name || selectedDestination?.address || "").trim() ||
      form.destinationText.trim();

    if (!origin || !destination) {
      setError("Indica un origen y un destino (por texto o eligiendo un plan).");
      return;
    }

    setSaving(true);
    try {
      const resp = await fetch("/api/trip-routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          route_name: routeName,
          title: routeName,
          name: routeName,
          departure_time: form.departureTime || null,
          travel_mode: form.travelMode || "driving",
          duration_text: form.durationText || null,
          origin_name: origin,
          origin_address: origin,
          destination_name: destination,
          destination_address: destination,
        }),
      });
      const payload = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(payload?.error || "No se pudo guardar la ruta.");

      setInfo("Ruta creada.");
      setForm((f) => ({
        ...f,
        routeName: "",
        departureTime: "",
        durationText: "",
        originPlanId: "",
        destinationPlanId: "",
        originText: "",
        destinationText: "",
      }));

      // recargar rutas
      const rRes = await fetch(`/api/trip-routes?tripId=${encodeURIComponent(tripId)}`, { cache: "no-store" });
      const rPayload = await rRes.json().catch(() => null);
      const nextRoutes = Array.isArray(rPayload?.routes) ? (rPayload.routes as any[]) : [];
      setRoutes(
        nextRoutes
          .filter((x) => x && x.id)
          .map((x) => ({
            id: String(x.id),
            title: typeof x.title === "string" ? x.title : null,
            route_name: typeof x.route_name === "string" ? x.route_name : null,
            name: typeof x.name === "string" ? x.name : null,
            route_day: typeof x.route_day === "string" ? x.route_day : null,
            route_date: typeof x.route_date === "string" ? x.route_date : null,
            departure_time: typeof x.departure_time === "string" ? x.departure_time : null,
            travel_mode: typeof x.travel_mode === "string" ? x.travel_mode : null,
            duration_text: typeof x.duration_text === "string" ? x.duration_text : null,
            arrival_time: typeof x.arrival_time === "string" ? x.arrival_time : null,
            origin_name: typeof x.origin_name === "string" ? x.origin_name : null,
            origin_address: typeof x.origin_address === "string" ? x.origin_address : null,
            destination_name: typeof x.destination_name === "string" ? x.destination_name : null,
            destination_address: typeof x.destination_address === "string" ? x.destination_address : null,
            stop_name: typeof x.stop_name === "string" ? x.stop_name : null,
            stop_address: typeof x.stop_address === "string" ? x.stop_address : null,
          }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la ruta.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="card-soft p-6">
        <div className="text-sm font-semibold text-slate-900">Cargando rutas…</div>
        <div className="mt-1 text-xs text-slate-600">Preparando la vista de versión gratuita.</div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-amber-200 px-2 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-950">
            Aviso
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-amber-950">
              Mapa y rutas interactivas solo en la versión premium.
            </div>
            <div className="mt-1 text-sm text-amber-900/80">
              En la versión gratuita puedes crear rutas “manuales” escribiendo lugares (sin autocompletar ni coordenadas)
              o eligiendo un plan ya creado.
            </div>
          </div>
        </div>
      </section>

      <section className="card-soft p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950">
              <Route className="h-4 w-4 text-violet-700" aria-hidden />
              Rutas (modo gratuito)
            </div>
            <div className="text-xs text-slate-600">
              Crea rutas por nombre. Puedes indicar hora de salida, transporte y duración estimada.
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Nueva ruta
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}
        {info ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {info}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Nombre de ruta</span>
            <input
              value={form.routeName}
              onChange={(e) => setForm((f) => ({ ...f, routeName: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              placeholder="Ruta del día 1"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-800">Hora de salida</span>
              <input
                value={form.departureTime}
                onChange={(e) => setForm((f) => ({ ...f, departureTime: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                placeholder="10:00"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-800">Transporte</span>
              <select
                value={form.travelMode}
                onChange={(e) => setForm((f) => ({ ...f, travelMode: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              >
                <option value="DRIVING">Coche</option>
                <option value="WALKING">Andando</option>
                <option value="BICYCLING">Bici</option>
                <option value="TRANSIT">Transporte público</option>
              </select>
            </label>
          </div>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-slate-800">Duración estimada</span>
            <input
              value={form.durationText}
              onChange={(e) => setForm((f) => ({ ...f, durationText: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              placeholder="1h 20min"
            />
          </label>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">Origen</div>
            <div className="mt-3 space-y-3">
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Elegir plan</span>
                <select
                  value={form.originPlanId}
                  onChange={(e) => setForm((f) => ({ ...f, originPlanId: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                >
                  <option value="">— Ninguno —</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {displayPlanLabel(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">O escribir lugar</span>
                <input
                  value={form.originText}
                  onChange={(e) => setForm((f) => ({ ...f, originText: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                  placeholder="Museo del Prado"
                />
              </label>
              {selectedOrigin ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  Usando plan: <span className="font-semibold">{displayPlanLabel(selectedOrigin)}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">Destino</div>
            <div className="mt-3 space-y-3">
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Elegir plan</span>
                <select
                  value={form.destinationPlanId}
                  onChange={(e) => setForm((f) => ({ ...f, destinationPlanId: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                >
                  <option value="">— Ninguno —</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {displayPlanLabel(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">O escribir lugar</span>
                <input
                  value={form.destinationText}
                  onChange={(e) => setForm((f) => ({ ...f, destinationText: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                  placeholder="Parque del Retiro"
                />
              </label>
              {selectedDestination ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  Usando plan: <span className="font-semibold">{displayPlanLabel(selectedDestination)}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={createRoute}
            disabled={saving}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden />
            {saving ? "Guardando…" : "Guardar ruta"}
          </button>
        </div>
      </section>

      <section className="card-soft p-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-950">Rutas guardadas</div>
            <div className="mt-1 text-xs text-slate-600">
              En versión gratuita no se muestran polilíneas ni coordenadas, pero puedes organizar tus rutas.
            </div>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {routes.length} ruta{routes.length === 1 ? "" : "s"}
          </div>
        </div>

        {routes.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {routes.map((r) => (
              <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-950">
                      {String(r.title || r.route_name || r.name || "Ruta")}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {(r.departure_time ? `Salida ${r.departure_time}` : "Sin hora") +
                        (r.travel_mode ? ` · ${r.travel_mode}` : "") +
                        (r.duration_text ? ` · ${r.duration_text}` : "")}
                    </div>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">
                    {(r.route_day || r.route_date || "Sin día").toString()}
                  </div>
                </div>
                <div className="mt-3 text-sm text-slate-700">
                  <div className="font-semibold">Origen:</div>
                  <div className="text-slate-600">{r.origin_address || r.origin_name || "—"}</div>
                  <div className="mt-2 font-semibold">Destino:</div>
                  <div className="text-slate-600">{r.destination_address || r.destination_name || "—"}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-600">
            Todavía no hay rutas creadas.
          </div>
        )}
      </section>
    </div>
  );
}

