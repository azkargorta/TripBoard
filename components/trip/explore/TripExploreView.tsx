"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import PlaceAutocompleteInput from "@/components/PlaceAutocompleteInput";
import { MapPin, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useTripActivityKinds } from "@/hooks/useTripActivityKinds";

type PlaceRow = {
  id: string;
  trip_id: string;
  folder_id: string | null;
  place_id: string | null;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string | null;
  notes: string | null;
};

type PendingPlace = {
  place_id: string | null;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string | null;
};

type PlanRow = {
  id: string;
  title: string;
  activity_date: string | null;
  activity_time: string | null;
  place_name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  activity_kind: string | null;
};

type CreatePlanPayload = {
  title: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
};

function categoryEmoji(category: string | null | undefined) {
  const c = (category || "").toLowerCase();
  if (c.includes("restaurant") || c.includes("food") || c.includes("cafe")) return "🍽️";
  if (c.includes("museum")) return "🏛️";
  if (c.includes("park") || c.includes("nature")) return "🌿";
  if (c.includes("activity")) return "🎟️";
  if (c.includes("transport")) return "🚆";
  if (c.includes("lodging") || c.includes("hotel")) return "🏨";
  return "📍";
}

function normalizeKind(kind: unknown) {
  return typeof kind === "string" ? kind.trim().toLowerCase() : "";
}

function planKindMeta(
  kind: string | null | undefined,
  custom?: Map<string, { label: string; emoji?: string | null; color?: string | null }>
) {
  const k = normalizeKind(kind) || "visit";
  const fromCustom = custom?.get(k) || null;
  if (fromCustom) {
    const emoji = (fromCustom.emoji || "🏷️").trim() || "🏷️";
    const color = fromCustom.color || "#64748b";
    return {
      label: fromCustom.label || k,
      emoji,
      accent: "bg-violet-50 text-violet-900 border-violet-200",
      pin: { fill: color, stroke: "#0f172a" },
    };
  }
  if (k === "food" || k === "restaurant")
    return {
      label: "Comida",
      emoji: "🍽️",
      accent: "bg-amber-50 text-amber-900 border-amber-200",
      pin: { fill: "#f59e0b", stroke: "#b45309" },
    };
  if (k === "transport")
    return {
      label: "Transporte",
      emoji: "🚆",
      accent: "bg-sky-50 text-sky-900 border-sky-200",
      pin: { fill: "#0ea5e9", stroke: "#075985" },
    };
  if (k === "lodging")
    return {
      label: "Alojamiento",
      emoji: "🏨",
      accent: "bg-indigo-50 text-indigo-900 border-indigo-200",
      pin: { fill: "#6366f1", stroke: "#3730a3" },
    };
  if (k === "shopping")
    return {
      label: "Compras",
      emoji: "🛍️",
      accent: "bg-pink-50 text-pink-900 border-pink-200",
      pin: { fill: "#ec4899", stroke: "#9d174d" },
    };
  if (k === "nightlife")
    return {
      label: "Noche",
      emoji: "🌙",
      accent: "bg-slate-50 text-slate-900 border-slate-200",
      pin: { fill: "#334155", stroke: "#0f172a" },
    };
  return {
    label: "Visita",
    emoji: "📍",
    accent: "bg-emerald-50 text-emerald-900 border-emerald-200",
    pin: { fill: "#10b981", stroke: "#065f46" },
  };
}

function emojiIcon(emoji: string, bg: string) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width: 34px; height: 34px;
      display:flex; align-items:center; justify-content:center;
      border-radius: 999px;
      background:${bg};
      border: 2px solid #ffffff;
      box-shadow: 0 10px 22px rgba(15,23,42,.18);
      font-size: 16px;
      line-height: 1;
    ">${emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -28],
  });
}

function FitToBounds({ pointsKey, bounds }: { pointsKey: string; bounds: L.LatLngBounds | null }) {
  const map = useMap();
  const lastKeyRef = useRef<string>("");

  useEffect(() => {
    if (!bounds) return;
    if (pointsKey && pointsKey === lastKeyRef.current) return;
    lastKeyRef.current = pointsKey;
    try {
      map.fitBounds(bounds, { padding: [40, 40] });
    } catch {
      // noop
    }
  }, [bounds, map, pointsKey]);

  return null;
}

export default function TripExploreView({
  tripId,
  onCreatePlan,
}: {
  tripId: string;
  onCreatePlan?: (payload: CreatePlanPayload) => void;
}) {

  const [places, setPlaces] = useState<PlaceRow[]>([]);

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [visiblePlanKinds, setVisiblePlanKinds] = useState<Record<string, boolean>>({});
  const [showPlans, setShowPlans] = useState(true);
  const { kinds: customKinds } = useTripActivityKinds(tripId);

  const customByKey = useMemo(() => {
    const map = new Map<string, { label: string; emoji?: string | null; color?: string | null }>();
    for (const k of customKinds || []) {
      const kk = normalizeKind((k as any)?.kind_key);
      if (!kk) continue;
      map.set(kk, {
        label: String((k as any)?.label || kk),
        emoji: (k as any)?.emoji ?? null,
        color: (k as any)?.color ?? null,
      });
    }
    return map;
  }, [customKinds]);

  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<PendingPlace | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setError(null);
    const pRes = await fetch(`/api/trip-places?tripId=${encodeURIComponent(tripId)}`);
    const aRes = await fetch(`/api/trip-activities?tripId=${encodeURIComponent(tripId)}`);
    const pJson = await pRes.json().catch(() => null);
    const aJson = await aRes.json().catch(() => null);
    if (!pRes.ok) throw new Error(pJson?.error || "No se pudieron cargar lugares.");
    if (!aRes.ok) throw new Error(aJson?.error || "No se pudieron cargar los planes.");
    setPlaces(Array.isArray(pJson?.places) ? pJson.places : []);
    const activities = Array.isArray(aJson?.activities) ? (aJson.activities as any[]) : [];
    const normalizedPlans: PlanRow[] = activities.map((a: any) => ({
      id: String(a.id),
      title: typeof a.title === "string" ? a.title : "",
      activity_date: typeof a.activity_date === "string" ? a.activity_date : null,
      activity_time: typeof a.activity_time === "string" ? a.activity_time : null,
      place_name: typeof a.place_name === "string" ? a.place_name : null,
      address: typeof a.address === "string" ? a.address : null,
      latitude: typeof a.latitude === "number" ? a.latitude : null,
      longitude: typeof a.longitude === "number" ? a.longitude : null,
      activity_kind: typeof a.activity_kind === "string" ? a.activity_kind : null,
    }));
    setPlans(normalizedPlans);
  }

  useEffect(() => {
    void loadAll().catch((e) => setError(e instanceof Error ? e.message : "Error cargando explorador."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const visiblePlaces = useMemo(() => places, [places]);

  const planKinds = useMemo(() => {
    // Mezcla: tipos que existen en planes + tipos creados manualmente (para que se vean renombres/catálogos).
    const kinds = new Set<string>();
    for (const p of plans) kinds.add(normalizeKind(p.activity_kind) || "visit");
    for (const k of customByKey.keys()) kinds.add(k);
    const list = Array.from(kinds);
    list.sort((a, b) => {
      const la = customByKey.get(a)?.label || a;
      const lb = customByKey.get(b)?.label || b;
      return la.localeCompare(lb);
    });
    return list;
  }, [customByKey, plans]);

  useEffect(() => {
    // Inicializa el selector de carpetas (kinds) de planes cuando cargan por primera vez.
    setVisiblePlanKinds((prev) => {
      const next: Record<string, boolean> = { ...prev };
      for (const k of planKinds) {
        if (typeof next[k] !== "boolean") next[k] = true;
      }
      // Limpia claves antiguas que ya no existan.
      for (const k of Object.keys(next)) {
        if (!planKinds.includes(k)) delete next[k];
      }
      return next;
    });
  }, [planKinds]);

  const visiblePlans = useMemo(() => {
    if (!showPlans) return [];
    return plans.filter((p) => visiblePlanKinds[(p.activity_kind || "visit").toLowerCase()] !== false);
  }, [plans, showPlans, visiblePlanKinds]);

  const mapPoints = useMemo(() => {
    const out: Array<{ key: string; lat: number; lng: number; title: string; emoji: string; bg: string; subtitle?: string }> =
      [];

    for (const a of visiblePlans) {
      if (typeof a.latitude !== "number" || typeof a.longitude !== "number") continue;
      const meta = planKindMeta(a.activity_kind, customByKey);
      out.push({
        key: `plan:${a.id}`,
        lat: a.latitude,
        lng: a.longitude,
        title: a.title || a.place_name || "Plan",
        emoji: meta.emoji,
        bg: meta.pin.fill,
        subtitle: a.address || undefined,
      });
    }

    for (const p of visiblePlaces) {
      if (typeof p.latitude !== "number" || typeof p.longitude !== "number") continue;
      out.push({
        key: `place:${p.id}`,
        lat: p.latitude,
        lng: p.longitude,
        title: p.name || "Lugar",
        emoji: categoryEmoji(p.category),
        bg: "#0f172a",
        subtitle: p.address || undefined,
      });
    }

    if (pending && typeof pending.latitude === "number" && typeof pending.longitude === "number") {
      out.push({
        key: "pending",
        lat: pending.latitude,
        lng: pending.longitude,
        title: pending.name || pending.address || "Selección",
        emoji: "✨",
        bg: "#a855f7",
        subtitle: pending.address || undefined,
      });
    }

    return out;
  }, [customByKey, pending, visiblePlaces, visiblePlans]);

  const bounds = useMemo(() => {
    if (!mapPoints.length) return null;
    const b = L.latLngBounds(mapPoints.map((p) => [p.lat, p.lng] as [number, number]));
    return b.isValid() ? b : null;
  }, [mapPoints]);

  const pointsKey = useMemo(() => mapPoints.map((p) => p.key).join("|"), [mapPoints]);

  return (
    <div className="grid min-w-0 max-w-full gap-6 overflow-x-hidden lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-4">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0 text-sm font-extrabold text-slate-950">Planes</div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPlans((v) => !v)}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  showPlans
                    ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    : "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                }`}
                title={showPlans ? "Ocultar planes (lista + chinchetas)" : "Mostrar planes (lista + chinchetas)"}
              >
                <MapPin className="h-4 w-4" aria-hidden />
                {showPlans ? "Ocultar" : "Mostrar"}
              </button>
              <button
                type="button"
                onClick={() => void loadAll().catch((e) => setError(e instanceof Error ? e.message : "Error"))}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCcw className="h-4 w-4" aria-hidden />
                Recargar
              </button>
            </div>
          </div>

          {showPlans ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {planKinds.map((k) => {
                const meta = planKindMeta(k, customByKey);
                const active = visiblePlanKinds[k] !== false;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setVisiblePlanKinds((prev) => ({ ...prev, [k]: !(prev[k] !== false) }))}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      active ? meta.accent : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                    aria-pressed={active}
                    title={`Mostrar/ocultar: ${meta.label}`}
                  >
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    <span className="tabular-nums">{meta.emoji}</span>
                    {meta.label}
                  </button>
                );
              })}
              {planKinds.length ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setVisiblePlanKinds(() => Object.fromEntries(planKinds.map((k) => [k, true])) as Record<string, boolean>)
                    }
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setVisiblePlanKinds(() => Object.fromEntries(planKinds.map((k) => [k, false])) as Record<string, boolean>)
                    }
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Ninguna
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {showPlans ? (
            <div className="mt-3 space-y-2">
              {visiblePlans.filter((p) => typeof p.latitude === "number" && typeof p.longitude === "number").length ? (
                visiblePlans
                  .filter((p) => typeof p.latitude === "number" && typeof p.longitude === "number")
                  .slice(0, 24)
                  .map((p) => {
                    const meta = planKindMeta(p.activity_kind, customByKey);
                    return (
                      <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-extrabold text-slate-900 line-clamp-1">
                              {meta.emoji} {p.title || p.place_name || "Plan"}
                            </div>
                            {p.address ? (
                              <div className="mt-1 text-[11px] text-slate-600 line-clamp-2">{p.address}</div>
                            ) : null}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                {meta.label}
                              </span>
                              {p.activity_date ? (
                                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                  {p.activity_date}
                                  {p.activity_time ? ` · ${p.activity_time}` : ""}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (typeof p.latitude !== "number" || typeof p.longitude !== "number") return;
                              // El mapa se ajusta automáticamente con fitBounds.
                            }}
                            className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            title="Centrar en el mapa"
                          >
                            <MapPin className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </div>
                    );
                  })
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  No hay planes con coordenadas (lat/lng) para mostrar en el mapa todavía.
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-extrabold text-slate-950">Buscar</div>
          <div className="mt-3">
            <PlaceAutocompleteInput
              value={query}
              onChange={setQuery}
              label="Buscar lugar"
              placeholder="Restaurante, museo, actividad…"
              onPlaceSelect={(payload) => {
                setPending({
                  place_id: null,
                  name: payload.address,
                  address: payload.address,
                  latitude: payload.latitude,
                  longitude: payload.longitude,
                  category: null,
                });
              }}
            />
          </div>

          {pending ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Selección</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900 line-clamp-2">{pending.name}</div>
                  {pending.address ? <div className="mt-1 text-xs text-slate-600 line-clamp-2">{pending.address}</div> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPending(null)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cerrar
                  </button>
                </div>
              </div>

              <div className="mt-3 grid gap-3">
                {onCreatePlan ? (
                  <button
                    type="button"
                    onClick={() => {
                      const title = String(pending.name || pending.address || "Nuevo plan").trim() || "Nuevo plan";
                      const address = String(pending.address || pending.name || "").trim();
                      onCreatePlan({
                        title,
                        address,
                        latitude: pending.latitude ?? null,
                        longitude: pending.longitude ?? null,
                      });
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                    title="Crear un plan con este lugar (se abrirá el formulario)"
                  >
                    Crear plan con este lugar
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-extrabold text-slate-950">Guardados</div>
          <div className="mt-3 space-y-2">
            {visiblePlaces.length ? (
              visiblePlaces.slice(0, 30).map((p) => (
                <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-slate-900 line-clamp-1">
                        {categoryEmoji(p.category)} {p.name}
                      </div>
                      {p.address ? <div className="mt-1 text-[11px] text-slate-600 line-clamp-2">{p.address}</div> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof p.latitude !== "number" || typeof p.longitude !== "number") return;
                        // El mapa se ajusta automáticamente con fitBounds.
                      }}
                      className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <MapPin className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Todavía no hay lugares guardados.
              </div>
            )}
          </div>
        </div>
      </aside>

      <section className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="h-[520px] w-full min-w-0">
          <MapContainer center={[40.4168, -3.7038]} zoom={4} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitToBounds pointsKey={pointsKey} bounds={bounds} />
            {mapPoints.map((p) => (
              <Marker key={p.key} position={[p.lat, p.lng]} icon={emojiIcon(p.emoji, p.bg)}>
                <Popup>
                  <div className="text-sm font-semibold text-slate-900">{p.title}</div>
                  {p.subtitle ? <div className="mt-1 text-xs text-slate-600">{p.subtitle}</div> : null}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </section>
    </div>
  );
}

