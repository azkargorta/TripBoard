"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { MapPin, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import PlaceAutocompleteInput from "@/components/PlaceAutocompleteInput";
import { useTripRoutes, type RoutePoint, type SaveRouteInput } from "@/hooks/useTripRoutes";

type UnknownRow = Record<string, unknown>;
type RouteMode = "DRIVING";

type AutocompletePayload = {
  address: string;
  latitude: number | null;
  longitude: number | null;
};

export type TripMapRoute = {
  id: string;
  source?: "trip_routes" | "legacy_routes";
  route_order?: number | null;
  route_day?: string | null;
  route_date?: string | null;
  departure_time?: string | null;
  title?: string | null;
  route_name?: string | null;
  travel_mode?: string | null;
  color?: string | null;
  origin_name?: string | null;
  origin_address?: string | null;
  origin_latitude?: number | null;
  origin_longitude?: number | null;
  stop_name?: string | null;
  stop_address?: string | null;
  stop_latitude?: number | null;
  stop_longitude?: number | null;
  destination_name?: string | null;
  destination_address?: string | null;
  destination_latitude?: number | null;
  destination_longitude?: number | null;
  distance_text?: string | null;
  duration_text?: string | null;
  arrival_time?: string | null;
  route_points?: RoutePoint[] | null;
  path_points?: RoutePoint[] | null;
  notes?: string | null;
};

type PlanPlace = {
  id: string;
  title: string;
  address: string;
  kind?: string | null;
  activityDate?: string | null;
  latitude: number;
  longitude: number;
};

type RouteSources = {
  tripRoutes?: unknown[];
  legacyRoutes?: unknown[];
};

type PlanSources = {
  tripActivities?: unknown[];
  legacyActivities?: unknown[];
};

type Props = {
  tripId: string;
  trip?: { id: string; name: string; destination?: string | null; start_date?: string | null; end_date?: string | null };
  tripDates?: string[];
  planSources?: PlanSources;
  routeSources?: RouteSources;
  // compat vieja (hay una ruta legacy que lo llama así)
  points?: unknown[];
  routes?: unknown[];
  selectedDate?: string;
  availableDates?: string[];
};

const DEFAULT_CENTER: [number, number] = [40.4168, -3.7038];

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

function FitToBounds({ bounds, boundsKey }: { bounds: L.LatLngBounds | null; boundsKey: string }) {
  const map = useMap();
  const lastKeyRef = useRef<string>("");

  useEffect(() => {
    if (!bounds) return;
    if (boundsKey && boundsKey === lastKeyRef.current) return;
    lastKeyRef.current = boundsKey;
    try {
      map.fitBounds(bounds, { padding: [44, 44] });
    } catch {
      // noop
    }
  }, [bounds, boundsKey, map]);

  return null;
}

function rowStr(row: UnknownRow, key: string) {
  const v = row[key];
  return typeof v === "string" ? v : null;
}

function rowNum(row: UnknownRow, key: string) {
  const v = row[key];
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function normalizePlanPlaces(rows: unknown[] | undefined, prefix: string): PlanPlace[] {
  const list: PlanPlace[] = [];
  for (const raw of rows || []) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as UnknownRow;
    const id = rowStr(row, "id");
    const lat = rowNum(row, "latitude");
    const lng = rowNum(row, "longitude");
    if (!id || lat == null || lng == null) continue;
    const title =
      rowStr(row, "title") ||
      rowStr(row, "place_name") ||
      rowStr(row, "location_name") ||
      rowStr(row, "name") ||
      "Lugar";
    const address = rowStr(row, "address") || rowStr(row, "location_name") || title;
    const kind = rowStr(row, "activity_kind") || rowStr(row, "activity_type") || null;
    const activityDate = rowStr(row, "activity_date") || null;
    list.push({
      id: `${prefix}:${id}`,
      title,
      address,
      kind,
      activityDate,
      latitude: lat,
      longitude: lng,
    });
  }
  return list;
}

function normalizeRoutes(rows: unknown[] | undefined, source: "trip_routes" | "legacy_routes"): TripMapRoute[] {
  const list: TripMapRoute[] = [];
  for (const raw of rows || []) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as UnknownRow;
    const id = rowStr(row, "id");
    if (!id) continue;
    list.push({
      id,
      source,
      route_order: typeof (row as any).route_order === "number" ? (row as any).route_order : null,
      route_day: rowStr(row, "route_day") || rowStr(row, "route_date") || null,
      route_date: rowStr(row, "route_date") || rowStr(row, "route_day") || null,
      departure_time: rowStr(row, "departure_time") || null,
      title: rowStr(row, "title") || null,
      route_name: rowStr(row, "route_name") || null,
      travel_mode: rowStr(row, "travel_mode") || null,
      color: rowStr(row, "color") || null,
      origin_name: rowStr(row, "origin_name") || null,
      origin_address: rowStr(row, "origin_address") || null,
      origin_latitude: rowNum(row, "origin_latitude"),
      origin_longitude: rowNum(row, "origin_longitude"),
      stop_name: rowStr(row, "stop_name") || null,
      stop_address: rowStr(row, "stop_address") || null,
      stop_latitude: rowNum(row, "stop_latitude"),
      stop_longitude: rowNum(row, "stop_longitude"),
      destination_name: rowStr(row, "destination_name") || null,
      destination_address: rowStr(row, "destination_address") || null,
      destination_latitude: rowNum(row, "destination_latitude"),
      destination_longitude: rowNum(row, "destination_longitude"),
      distance_text: rowStr(row, "distance_text") || null,
      duration_text: rowStr(row, "duration_text") || null,
      arrival_time: rowStr(row, "arrival_time") || null,
      route_points: Array.isArray((row as any).route_points) ? ((row as any).route_points as RoutePoint[]) : null,
      path_points: Array.isArray((row as any).path_points) ? ((row as any).path_points as RoutePoint[]) : null,
      notes: rowStr(row, "notes") || null,
    });
  }
  return list;
}

function formatKm(meters: number) {
  const km = meters / 1000;
  return km >= 10 ? `${km.toFixed(0)} km` : `${km.toFixed(1)} km`;
}

function formatDuration(seconds: number) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}min` : `${h}h`;
}

async function fetchOsrmRoute(params: { origin: RoutePoint; destination: RoutePoint; stop?: RoutePoint | null }) {
  const resp = await fetch("/api/osrm/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const payload = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(payload?.error || `Error ${resp.status}`);
  return payload as {
    points: RoutePoint[];
    distanceMeters: number | null;
    durationSeconds: number | null;
  };
}

function placeEmoji(kind?: string | null) {
  const k = String(kind || "").toLowerCase();
  if (k.includes("food") || k.includes("restaurant")) return "🍽️";
  if (k.includes("museum")) return "🏛️";
  if (k.includes("lodging") || k.includes("hotel")) return "🏨";
  if (k.includes("transport")) return "🚆";
  if (k.includes("activity")) return "🎟️";
  return "📍";
}

function normalizeKind(kind: unknown) {
  return typeof kind === "string" ? kind.trim().toLowerCase() : "";
}

function kindLabel(kindRaw: string) {
  const k = normalizeKind(kindRaw);
  if (k === "visit") return "Visita";
  if (k === "museum") return "Museo";
  if (k === "restaurant") return "Restaurante";
  if (k === "transport") return "Transporte";
  if (k === "activity") return "Actividad";
  if (k === "lodging") return "Alojamiento";
  return kindRaw.trim().slice(0, 1).toUpperCase() + kindRaw.trim().slice(1);
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function TripMapView({ tripId, tripDates = [], planSources, routeSources, points, routes }: Props) {
  const allPlanPlaces = useMemo(() => {
    const fromSources =
      planSources && (planSources.tripActivities || planSources.legacyActivities)
        ? [
            ...normalizePlanPlaces(planSources.tripActivities, "trip"),
            ...normalizePlanPlaces(planSources.legacyActivities, "legacy"),
          ]
        : normalizePlanPlaces(points as any[], "legacy-page");
    const byId = new Map<string, PlanPlace>();
    for (const p of fromSources) byId.set(p.id, p);
    return Array.from(byId.values());
  }, [planSources, points]);

  const allRoutes = useMemo(() => {
    const fromSources =
      routeSources && (routeSources.tripRoutes || routeSources.legacyRoutes)
        ? [
            ...normalizeRoutes(routeSources.tripRoutes, "trip_routes"),
            ...normalizeRoutes(routeSources.legacyRoutes, "legacy_routes"),
          ]
        : normalizeRoutes(routes as any[], "trip_routes");

    const byKey = new Map<string, TripMapRoute>();
    for (const r of fromSources) byKey.set(`${r.source || "trip_routes"}:${r.id}`, r);
    return Array.from(byKey.values());
  }, [routeSources, routes]);

  const dateOptions = useMemo(() => {
    const base = (Array.isArray(tripDates) && tripDates.length ? tripDates : []).slice();
    const extra = new Set<string>();
    for (const r of allRoutes) {
      const d = (r.route_day || r.route_date || "").trim();
      if (d) extra.add(d);
    }
    return Array.from(new Set(["all", ...base, ...Array.from(extra)])).filter(Boolean);
  }, [allRoutes, tripDates]);

  const [selectedDate, setSelectedDate] = useState<string>("all");
  const [focusedRouteKey, setFocusedRouteKey] = useState<string | null>(null);
  const [showPlanMarkers, setShowPlanMarkers] = useState(true);
  const [planKindFilter, setPlanKindFilter] = useState<Set<string>>(new Set());

  // Formulario crear ruta
  const [routeName, setRouteName] = useState("");
  const [routeDate, setRouteDate] = useState<string>(todayISO());
  const [departureTime, setDepartureTime] = useState("");
  const [mode] = useState<RouteMode>("DRIVING");

  const [origin, setOrigin] = useState<{ address: string; latitude: number | null; longitude: number | null }>({
    address: "",
    latitude: null,
    longitude: null,
  });
  const [stop, setStop] = useState<{ address: string; latitude: number | null; longitude: number | null }>({
    address: "",
    latitude: null,
    longitude: null,
  });
  const [destination, setDestination] = useState<{ address: string; latitude: number | null; longitude: number | null }>({
    address: "",
    latitude: null,
    longitude: null,
  });

  const [originPlanId, setOriginPlanId] = useState("");
  const [stopPlanId, setStopPlanId] = useState("");
  const [destinationPlanId, setDestinationPlanId] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reloadRoutes = useCallback(async () => {
    try {
      await fetch(`/api/trip-routes?tripId=${encodeURIComponent(tripId)}`, { cache: "no-store" });
    } catch {
      // noop
    }
  }, [tripId]);

  const { saveRoute, deleteRoute, savingRoute, routeError } = useTripRoutes(tripId, reloadRoutes);

  useEffect(() => {
    if (routeError) setError(routeError);
  }, [routeError]);

  const planOptions = useMemo(() => {
    const list = allPlanPlaces.slice();
    list.sort((a, b) => (a.activityDate || "").localeCompare(b.activityDate || "") || a.title.localeCompare(b.title));
    return list;
  }, [allPlanPlaces]);

  const availablePlanKinds = useMemo(() => {
    const s = new Set<string>();
    for (const p of allPlanPlaces) {
      const k = normalizeKind(p.kind) || "visit";
      s.add(k);
    }
    return Array.from(s.values()).sort((a, b) => a.localeCompare(b));
  }, [allPlanPlaces]);

  const applyPlan = useCallback((planId: string) => planOptions.find((p) => p.id === planId) || null, [planOptions]);

  useEffect(() => {
    const p = originPlanId ? applyPlan(originPlanId) : null;
    if (!p) return;
    setOrigin({ address: p.address || p.title, latitude: p.latitude, longitude: p.longitude });
  }, [applyPlan, originPlanId]);
  useEffect(() => {
    const p = stopPlanId ? applyPlan(stopPlanId) : null;
    if (!p) return;
    setStop({ address: p.address || p.title, latitude: p.latitude, longitude: p.longitude });
  }, [applyPlan, stopPlanId]);
  useEffect(() => {
    const p = destinationPlanId ? applyPlan(destinationPlanId) : null;
    if (!p) return;
    setDestination({ address: p.address || p.title, latitude: p.latitude, longitude: p.longitude });
  }, [applyPlan, destinationPlanId]);

  const visibleRoutes = useMemo(() => {
    const base = selectedDate === "all" ? allRoutes : allRoutes.filter((r) => (r.route_day || r.route_date) === selectedDate);
    if (!focusedRouteKey) return base;
    return base.filter((r) => `${r.source || "trip_routes"}:${r.id}` === focusedRouteKey);
  }, [allRoutes, focusedRouteKey, selectedDate]);

  const mapEntities = useMemo(() => {
    const markers: Array<{ key: string; lat: number; lng: number; title: string; emoji: string; bg: string; subtitle?: string }> =
      [];
    if (showPlanMarkers) {
      for (const p of allPlanPlaces) {
        const k = normalizeKind(p.kind) || "visit";
        if (planKindFilter.size && !planKindFilter.has(k)) continue;
        markers.push({
          key: `plan:${p.id}`,
          lat: p.latitude,
          lng: p.longitude,
          title: p.title,
          subtitle: p.address,
          emoji: placeEmoji(p.kind),
          bg: "#0f172a",
        });
      }
    }

    const lines: Array<{ key: string; points: RoutePoint[]; color: string; label: string }> = [];
    for (const r of visibleRoutes) {
      const key = `${r.source || "trip_routes"}:${r.id}`;
      const pts = (Array.isArray(r.path_points) && r.path_points.length ? r.path_points : r.route_points) || [];
      const normalized = Array.isArray(pts)
        ? pts.filter((x) => x && typeof x.lat === "number" && typeof x.lng === "number" && Number.isFinite(x.lat) && Number.isFinite(x.lng))
        : [];
      const color = (r.color && String(r.color).trim()) || "#6366f1";

      if (normalized.length >= 2) {
        lines.push({ key, points: normalized, color, label: String(r.title || r.route_name || "Ruta") });
        continue;
      }
      if (
        typeof r.origin_latitude === "number" &&
        typeof r.origin_longitude === "number" &&
        typeof r.destination_latitude === "number" &&
        typeof r.destination_longitude === "number"
      ) {
        lines.push({
          key,
          points: [
            { lat: r.origin_latitude, lng: r.origin_longitude },
            { lat: r.destination_latitude, lng: r.destination_longitude },
          ],
          color,
          label: String(r.title || r.route_name || "Ruta"),
        });
      }
    }

    return { markers, lines };
  }, [allPlanPlaces, planKindFilter, showPlanMarkers, visibleRoutes]);

  const bounds = useMemo(() => {
    const latlngs: Array<[number, number]> = [];
    for (const m of mapEntities.markers) latlngs.push([m.lat, m.lng]);
    for (const l of mapEntities.lines) for (const p of l.points) latlngs.push([p.lat, p.lng]);
    if (!latlngs.length) return null;
    const b = L.latLngBounds(latlngs);
    return b.isValid() ? b : null;
  }, [mapEntities.lines, mapEntities.markers]);

  const boundsKey = useMemo(() => {
    return [
      `d:${selectedDate}`,
      `m:${showPlanMarkers ? 1 : 0}`,
      `r:${visibleRoutes.map((r) => `${r.source || "trip_routes"}:${r.id}`).join(",")}`,
    ].join("|");
  }, [selectedDate, showPlanMarkers, visibleRoutes]);

  const onSelectPlace = useCallback(
    (setState: (v: { address: string; latitude: number | null; longitude: number | null }) => void, payload: AutocompletePayload) => {
      setState({ address: payload.address, latitude: payload.latitude, longitude: payload.longitude });
    },
    []
  );

  async function createRoute() {
    setError(null);
    setInfo(null);

    const name = routeName.trim() || "Ruta";
    if (!routeDate) {
      setError("Selecciona un día.");
      return;
    }

    if (
      typeof origin.latitude !== "number" ||
      typeof origin.longitude !== "number" ||
      typeof destination.latitude !== "number" ||
      typeof destination.longitude !== "number"
    ) {
      setError("Origen y destino deben tener coordenadas (elige un plan con coords o usa el buscador).");
      return;
    }

    setSaving(true);
    try {
      const originPt: RoutePoint = { lat: origin.latitude, lng: origin.longitude };
      const destPt: RoutePoint = { lat: destination.latitude, lng: destination.longitude };
      const stopPt =
        typeof stop.latitude === "number" && typeof stop.longitude === "number" ? ({ lat: stop.latitude, lng: stop.longitude } satisfies RoutePoint) : null;

      let routePoints: RoutePoint[] = [originPt, ...(stopPt ? [stopPt] : []), destPt];
      let distanceText: string | null = null;
      let durationText: string | null = null;

      try {
        const osrm = await fetchOsrmRoute({ origin: originPt, destination: destPt, stop: stopPt });
        if (Array.isArray(osrm.points) && osrm.points.length >= 2) {
          routePoints = osrm.points;
          if (typeof osrm.distanceMeters === "number" && Number.isFinite(osrm.distanceMeters)) distanceText = formatKm(osrm.distanceMeters);
          if (typeof osrm.durationSeconds === "number" && Number.isFinite(osrm.durationSeconds)) durationText = formatDuration(osrm.durationSeconds);
        }
      } catch {
        // best-effort: si OSRM falla, guardamos línea simple
      }

      const input: SaveRouteInput = {
        routeDate,
        routeName: name,
        departureTime,
        mode,
        originName: origin.address || "Origen",
        originAddress: origin.address || "Origen",
        originLatitude: origin.latitude,
        originLongitude: origin.longitude,
        stopName: stop.address || "",
        stopAddress: stop.address || "",
        stopLatitude: stop.latitude,
        stopLongitude: stop.longitude,
        destinationName: destination.address || "Destino",
        destinationAddress: destination.address || "Destino",
        destinationLatitude: destination.latitude,
        destinationLongitude: destination.longitude,
        distanceText,
        durationText,
        routePoints,
        pathPoints: routePoints,
      };

      await saveRoute(input);
      setInfo("Ruta guardada.");
      setRouteName("");
      setDepartureTime("");
      setOrigin({ address: "", latitude: null, longitude: null });
      setStop({ address: "", latitude: null, longitude: null });
      setDestination({ address: "", latitude: null, longitude: null });
      setOriginPlanId("");
      setStopPlanId("");
      setDestinationPlanId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la ruta.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRoute(route: TripMapRoute) {
    if (route.source !== "trip_routes") {
      setError("No se puede borrar una ruta legacy.");
      return;
    }
    setError(null);
    try {
      await deleteRoute(route.id);
      setInfo("Ruta eliminada.");
      if (focusedRouteKey === `trip_routes:${route.id}`) setFocusedRouteKey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar la ruta.");
    }
  }

  const routesForList = useMemo(() => {
    const base = selectedDate === "all" ? allRoutes : allRoutes.filter((r) => (r.route_day || r.route_date) === selectedDate);
    return base.slice().sort((a, b) => {
      const oa = a.route_order ?? Number.POSITIVE_INFINITY;
      const ob = b.route_order ?? Number.POSITIVE_INFINITY;
      if (oa !== ob) return oa - ob;
      return String(a.departure_time || "").localeCompare(String(b.departure_time || ""));
    });
  }, [allRoutes, selectedDate]);

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <aside className="space-y-4">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
        ) : null}
        {info ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{info}</div>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-extrabold text-slate-950">Mapa (gratis)</div>
              <div className="mt-1 text-xs text-slate-600">OpenStreetMap + Leaflet. Sin peajes ni gasolineras.</div>
            </div>
            <button
              type="button"
              onClick={() => setShowPlanMarkers((v) => !v)}
              className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              title="Mostrar/ocultar marcadores del plan"
            >
              <MapPin className="h-4 w-4" aria-hidden />
              {showPlanMarkers ? "Marcadores: ON" : "Marcadores: OFF"}
            </button>
          </div>

          <div className="mt-3 grid gap-3">
            <label className="text-xs font-semibold text-slate-700">
              Día
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="mt-2 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
              >
                {dateOptions.map((d) => (
                  <option key={d} value={d}>
                    {d === "all" ? "Todos" : d}
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-600">Tipos de plan</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPlanKindFilter(new Set())}
                  className={`inline-flex min-h-[34px] items-center rounded-full border px-3 text-xs font-extrabold transition ${
                    planKindFilter.size === 0
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  title="Mostrar todos los tipos"
                >
                  Todos
                </button>
                {availablePlanKinds.map((k) => {
                  const active = planKindFilter.has(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setPlanKindFilter((prev) => {
                          const next = new Set(prev);
                          if (next.has(k)) next.delete(k);
                          else next.add(k);
                          return next;
                        });
                      }}
                      className={`inline-flex min-h-[34px] items-center rounded-full border px-3 text-xs font-extrabold transition ${
                        active
                          ? "border-violet-300 bg-violet-50 text-violet-900"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                      title={`Mostrar/ocultar: ${kindLabel(k)}`}
                    >
                      {kindLabel(k)}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Consejo: si no seleccionas ninguno, se muestran todos.
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-600">Nueva ruta</div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Gratis
                </div>
              </div>

              <div className="mt-3 grid gap-3">
                <label className="text-xs font-semibold text-slate-700">
                  Nombre
                  <input
                    value={routeName}
                    onChange={(e) => setRouteName(e.target.value)}
                    className="mt-2 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
                    placeholder="Ruta día 1"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-semibold text-slate-700">
                    Día
                    <input
                      type="date"
                      value={routeDate}
                      onChange={(e) => setRouteDate(e.target.value)}
                      className="mt-2 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-700">
                    Hora
                    <input
                      type="time"
                      value={departureTime}
                      onChange={(e) => setDepartureTime(e.target.value)}
                      className="mt-2 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
                    />
                  </label>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-xs font-extrabold text-slate-900">Origen</div>
                  <select
                    value={originPlanId}
                    onChange={(e) => setOriginPlanId(e.target.value)}
                    className="mt-2 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="">Elegir plan…</option>
                    {planOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {(p.activityDate ? `${p.activityDate} · ` : "") + p.title}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2">
                    <PlaceAutocompleteInput
                      value={origin.address}
                      onChange={(v) => setOrigin((s) => ({ ...s, address: v }))}
                      onPlaceSelect={(payload) => onSelectPlace((v) => setOrigin(v), payload)}
                      placeholder="Buscar origen…"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-xs font-extrabold text-slate-900">Parada (opcional)</div>
                  <select
                    value={stopPlanId}
                    onChange={(e) => setStopPlanId(e.target.value)}
                    className="mt-2 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="">Elegir plan…</option>
                    {planOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {(p.activityDate ? `${p.activityDate} · ` : "") + p.title}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2">
                    <PlaceAutocompleteInput
                      value={stop.address}
                      onChange={(v) => setStop((s) => ({ ...s, address: v }))}
                      onPlaceSelect={(payload) => onSelectPlace((v) => setStop(v), payload)}
                      placeholder="Buscar parada…"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-xs font-extrabold text-slate-900">Destino</div>
                  <select
                    value={destinationPlanId}
                    onChange={(e) => setDestinationPlanId(e.target.value)}
                    className="mt-2 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="">Elegir plan…</option>
                    {planOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {(p.activityDate ? `${p.activityDate} · ` : "") + p.title}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2">
                    <PlaceAutocompleteInput
                      value={destination.address}
                      onChange={(v) => setDestination((s) => ({ ...s, address: v }))}
                      onPlaceSelect={(payload) => onSelectPlace((v) => setDestination(v), payload)}
                      placeholder="Buscar destino…"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={saving || savingRoute}
                  onClick={() => void createRoute()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <Save className="h-4 w-4" aria-hidden />
                  {saving || savingRoute ? "Guardando…" : "Guardar ruta"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-extrabold text-slate-950">Rutas guardadas</div>
            <button
              type="button"
              onClick={() => setFocusedRouteKey(null)}
              className="inline-flex min-h-[34px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              title="Mostrar todas"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Todas
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {routesForList.map((r) => {
              const key = `${r.source || "trip_routes"}:${r.id}`;
              const active = focusedRouteKey === key;
              const title = String(r.title || r.route_name || "Ruta");
              const subtitle = [r.departure_time ? `Salida ${r.departure_time}` : "", r.distance_text || "", r.duration_text || ""]
                .filter(Boolean)
                .join(" · ");
              return (
                <div
                  key={key}
                  className={`rounded-2xl border p-3 ${active ? "border-violet-300 bg-violet-50" : "border-slate-200 bg-white"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setFocusedRouteKey((prev) => (prev === key ? null : key))}
                      className="min-w-0 text-left"
                      title="Enfocar/mostrar en el mapa"
                    >
                      <div className="text-sm font-semibold text-slate-950 line-clamp-1">{title}</div>
                      {subtitle ? <div className="mt-1 text-xs text-slate-600 line-clamp-2">{subtitle}</div> : null}
                    </button>
                    {r.source === "trip_routes" ? (
                      <button
                        type="button"
                        onClick={() => void removeRoute(r)}
                        className="inline-flex min-h-[34px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                        title="Eliminar ruta"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </aside>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="h-[640px] w-full">
          <MapContainer center={DEFAULT_CENTER} zoom={4} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitToBounds bounds={bounds} boundsKey={boundsKey} />

            {mapEntities.lines.map((l) => (
              <Polyline
                key={l.key}
                positions={l.points.map((p) => [p.lat, p.lng] as [number, number])}
                pathOptions={{ color: l.color, weight: 5, opacity: 0.85 }}
              >
                <Popup>{l.label}</Popup>
              </Polyline>
            ))}

            {mapEntities.markers.map((m) => (
              <Marker key={m.key} position={[m.lat, m.lng]} icon={emojiIcon(m.emoji, m.bg)}>
                <Popup>
                  <div className="text-sm font-semibold text-slate-900">{m.title}</div>
                  {m.subtitle ? <div className="mt-1 text-xs text-slate-600">{m.subtitle}</div> : null}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </section>
    </div>
  );
}

