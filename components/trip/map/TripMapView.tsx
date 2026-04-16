"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { CalendarDays, Clock, Copy, GripVertical, MapPin, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import PlaceAutocompleteInput from "@/components/PlaceAutocompleteInput";
import { useTripRoutes, type RoutePoint, type SaveRouteInput } from "@/hooks/useTripRoutes";
import { useTripActivityKinds } from "@/hooks/useTripActivityKinds";
import DuplicateRouteDialog from "@/components/trip/map/DuplicateRouteDialog";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type UnknownRow = Record<string, unknown>;
type RouteMode = "DRIVING";

type AutocompletePayload = {
  address: string;
  latitude: number | null;
  longitude: number | null;
};

type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

type RouteFormState = {
  editingRouteId: string | null;
  routeDate: string;
  routeName: string;
  departureTime: string;
  color: string;
  autoColor: boolean;
  stopEnabled: boolean;
  restStopsEnabled: boolean;
  restStopsCount: number;
  restStopMinutes: number;
  noteText: string;
  checklist: ChecklistItem[];
};

type RoutePreview = {
  key: string;
  points: RoutePoint[];
  distanceText: string | null;
  durationText: string | null;
  durationSeconds: number | null;
  arrivalTime: string | null;
  color: string;
  label: string;
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
const ROUTE_COLOR_PALETTE = ["#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316", "#eab308", "#10b981", "#14b8a6", "#06b6d4", "#3b82f6"];

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

function addDurationToTime(time: string, durationSeconds: number | null) {
  if (!time || typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds)) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const totalMinutes = hours * 60 + minutes + Math.round(durationSeconds / 60);
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(normalized / 60)).padStart(2, "0");
  const mm = String(normalized % 60).padStart(2, "0");
  return `${hh}:${mm}`;
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

function kindMarkerEmoji(kindRaw: string, custom?: Map<string, { label: string; emoji?: string | null; color?: string | null }>) {
  const k = normalizeKind(kindRaw);
  const meta = custom?.get(k) || null;
  if (meta?.emoji) return meta.emoji;
  return placeEmoji(k);
}

function kindMarkerColor(kindRaw: string, custom?: Map<string, { label: string; emoji?: string | null; color?: string | null }>) {
  const k = normalizeKind(kindRaw);
  const meta = custom?.get(k) || null;
  if (meta?.color) return meta.color;
  return "#0f172a";
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function randomId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function parseRouteNotes(notes: unknown): any | null {
  if (typeof notes !== "string" || !notes.trim()) return null;
  try {
    return JSON.parse(notes);
  } catch {
    // fallback: antiguamente era texto plano
    return { noteText: String(notes) };
  }
}

function buildRouteNotes(form: RouteFormState, previousNotes: string | null) {
  const prev = parseRouteNotes(previousNotes) || {};
  const noteText = String(form.noteText || "").trim();
  const checklist = Array.isArray(form.checklist)
    ? form.checklist
        .filter((x) => x && typeof x.text === "string")
        .map((x) => ({ id: String(x.id || randomId()), text: String(x.text || ""), done: !!x.done }))
    : [];

  const restStops =
    form.restStopsEnabled && form.restStopsCount > 0
      ? { enabled: true, count: Math.max(0, Math.floor(form.restStopsCount || 0)), minutesEach: Math.max(0, Math.floor(form.restStopMinutes || 0)) }
      : { enabled: false, count: 0, minutesEach: 0 };

  return JSON.stringify({
    ...prev,
    noteText,
    checklist,
    restStops,
  });
}

function defaultRouteForm(date: string): RouteFormState {
  return {
    editingRouteId: null,
    routeDate: date || todayISO(),
    routeName: "",
    departureTime: "",
    color: ROUTE_COLOR_PALETTE[0],
    autoColor: true,
    stopEnabled: false,
    restStopsEnabled: false,
    restStopsCount: 1,
    restStopMinutes: 15,
    noteText: "",
    checklist: [],
  };
}

function SortHandle() {
  return (
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600">
      <GripVertical className="h-4 w-4" aria-hidden />
    </span>
  );
}

function StatusChip({
  active = false,
  children,
}: {
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex min-h-[30px] items-center rounded-full border px-3 text-[11px] font-extrabold uppercase tracking-[0.08em] ${
        active ? "border-violet-300 bg-violet-50 text-violet-900" : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      {children}
    </span>
  );
}

function MapSurface({
  visible,
  bounds,
  boundsKey,
  lines,
  markers,
}: {
  visible: boolean;
  bounds: L.LatLngBounds | null;
  boundsKey: string;
  lines: Array<{ key: string; points: RoutePoint[]; color: string; label: string }>;
  markers: Array<{ key: string; lat: number; lng: number; title: string; emoji: string; bg: string; subtitle?: string }>;
}) {
  if (!visible) return null;

  return (
    <section className="lg:sticky lg:top-4 lg:self-start overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4">
        <div>
          <div className="text-sm font-extrabold text-slate-950">Vista del mapa</div>
          <div className="mt-1 text-xs text-slate-600">Recorridos, focos y lugares del plan en tiempo real.</div>
        </div>
        <StatusChip active>{lines.length ? `${lines.length} ruta${lines.length === 1 ? "" : "s"}` : "Sin rutas visibles"}</StatusChip>
      </div>
      <div className="h-[640px] w-full bg-slate-100 lg:h-[calc(100vh-7.5rem)]">
        <MapContainer center={DEFAULT_CENTER} zoom={4} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitToBounds bounds={bounds} boundsKey={boundsKey} />

          {lines.map((l) => (
            <Polyline
              key={l.key}
              positions={l.points.map((p) => [p.lat, p.lng] as [number, number])}
              pathOptions={{ color: l.color, weight: 5, opacity: 0.85 }}
            >
              <Popup>{l.label}</Popup>
            </Polyline>
          ))}

          {markers.map((m) => (
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
  );
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
  const { kinds: customKinds, warning: customKindsWarning } = useTripActivityKinds(tripId);

  const [routesState, setRoutesState] = useState<TripMapRoute[]>(allRoutes);
  const [routeQuery, setRouteQuery] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateRoute, setDuplicateRoute] = useState<TripMapRoute | null>(null);
  const [isRouteFormOpen, setIsRouteFormOpen] = useState(false);
  const [routePreview, setRoutePreview] = useState<RoutePreview | null>(null);
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [isMapVisible, setIsMapVisible] = useState(true);
  const [showRoutesList, setShowRoutesList] = useState(true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Formulario crear/editar ruta
  const [form, setForm] = useState<RouteFormState>(() => defaultRouteForm(todayISO()));
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

  const routeCalcKey = useMemo(() => {
    return JSON.stringify({
      name: form.routeName.trim() || "Ruta",
      date: form.routeDate,
      departureTime: form.departureTime,
      color: form.color,
      autoColor: form.autoColor,
      stopEnabled: form.stopEnabled,
      origin: [origin.address, origin.latitude, origin.longitude],
      stop: form.stopEnabled ? [stop.address, stop.latitude, stop.longitude] : null,
      destination: [destination.address, destination.latitude, destination.longitude],
    });
  }, [destination.address, destination.latitude, destination.longitude, form.autoColor, form.color, form.departureTime, form.routeDate, form.routeName, form.stopEnabled, origin.address, origin.latitude, origin.longitude, stop.address, stop.latitude, stop.longitude]);

  const effectiveRouteColor = useMemo(() => {
    if (!form.autoColor) return form.color || ROUTE_COLOR_PALETTE[0];
    const used = new Set(
      routesState
        .filter((r) => r.source === "trip_routes" && r.id !== form.editingRouteId)
        .map((r) => String(r.color || "").trim().toLowerCase())
        .filter(Boolean)
    );
    return ROUTE_COLOR_PALETTE.find((color) => !used.has(color.toLowerCase())) || ROUTE_COLOR_PALETTE[0];
  }, [form.autoColor, form.color, form.editingRouteId, routesState]);

  const reloadRoutes = useCallback(async () => {
    try {
      const resp = await fetch(`/api/trip-routes?tripId=${encodeURIComponent(tripId)}`, { cache: "no-store" });
      const payload = await resp.json().catch(() => null);
      if (resp.ok && Array.isArray(payload?.routes)) {
        const nextTripRoutes = normalizeRoutes(payload.routes as any[], "trip_routes");
        setRoutesState(nextTripRoutes);
      }
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
    for (const k of customKinds || []) {
      const kk = normalizeKind(k.kind_key);
      if (kk) s.add(kk);
    }
    return Array.from(s.values()).sort((a, b) => a.localeCompare(b));
  }, [allPlanPlaces, customKinds]);

  const customByKey = useMemo(() => {
    const map = new Map<string, { label: string; emoji?: string | null; color?: string | null }>();
    for (const k of customKinds || []) {
      const kk = normalizeKind(k.kind_key);
      if (!kk) continue;
      map.set(kk, { label: k.label, emoji: k.emoji ?? null, color: k.color ?? null });
    }
    return map;
  }, [customKinds]);

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

  useEffect(() => {
    setRoutesState(allRoutes);
  }, [allRoutes]);

  useEffect(() => {
    setRoutePreview((prev) => (prev?.key === routeCalcKey ? prev : null));
  }, [routeCalcKey]);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      if (!historyOpen) return;
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const resp = await fetch(
          `/api/trip-audit?tripId=${encodeURIComponent(tripId)}&entityType=route&limit=40`,
          { cache: "no-store" }
        );
        const payload = await resp.json().catch(() => null);
        if (!resp.ok) throw new Error(payload?.error || "No se pudo cargar el historial.");
        if (!cancelled) setHistory(Array.isArray(payload?.logs) ? payload.logs : []);
      } catch (e) {
        if (!cancelled) setHistoryError(e instanceof Error ? e.message : "No se pudo cargar el historial.");
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [historyOpen, tripId]);

  const visibleRoutes = useMemo(() => {
    const base = selectedDate === "all" ? routesState : routesState.filter((r) => (r.route_day || r.route_date) === selectedDate);
    const q = routeQuery.trim().toLowerCase();
    const filtered = q
      ? base.filter((r) => String(r.title || r.route_name || "").toLowerCase().includes(q))
      : base;
    if (!focusedRouteKey) return filtered;
    return filtered.filter((r) => `${r.source || "trip_routes"}:${r.id}` === focusedRouteKey);
  }, [focusedRouteKey, routeQuery, routesState, selectedDate]);

  const mapEntities = useMemo(() => {
    const markers: Array<{ key: string; lat: number; lng: number; title: string; emoji: string; bg: string; subtitle?: string }> =
      [];
    const hasPreview = isRouteFormOpen && !!routePreview;

    // Cuando una ruta está enfocada o estamos previsualizando una nueva, ocultamos el resto del mapa para destacar solo esa ruta.
    if (showPlanMarkers && !focusedRouteKey && !hasPreview) {
      for (const p of allPlanPlaces) {
        const k = normalizeKind(p.kind) || "visit";
        if (planKindFilter.size && !planKindFilter.has(k)) continue;
        markers.push({
          key: `plan:${p.id}`,
          lat: p.latitude,
          lng: p.longitude,
          title: p.title,
          subtitle: p.address,
          emoji: kindMarkerEmoji(k, customByKey),
          bg: kindMarkerColor(k, customByKey),
        });
      }
    }

    const lines: Array<{ key: string; points: RoutePoint[]; color: string; label: string }> = [];
    if (hasPreview && routePreview) {
      lines.push({
        key: "route-preview",
        points: routePreview.points,
        color: routePreview.color,
        label: routePreview.label,
      });
    } else {
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
    }

    return { markers, lines };
  }, [allPlanPlaces, customByKey, focusedRouteKey, isRouteFormOpen, planKindFilter, routePreview, showPlanMarkers, visibleRoutes]);

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
      `p:${routePreview?.key || ""}`,
    ].join("|");
  }, [routePreview?.key, selectedDate, showPlanMarkers, visibleRoutes]);

  const onSelectPlace = useCallback(
    (setState: (v: { address: string; latitude: number | null; longitude: number | null }) => void, payload: AutocompletePayload) => {
      setState({ address: payload.address, latitude: payload.latitude, longitude: payload.longitude });
    },
    []
  );

  function beginEditRoute(route: TripMapRoute) {
    if (!route) return;
    setIsRouteFormOpen(true);
    setFocusedRouteKey(`${route.source || "trip_routes"}:${route.id}`);
    setRoutePreview(null);
    const notes = parseRouteNotes(route.notes);
    const restStops = notes?.restStops;
    const noteText = typeof notes?.noteText === "string" ? notes.noteText : "";
    const checklist = Array.isArray(notes?.checklist)
      ? (notes.checklist as any[]).map((x) => ({
          id: String(x?.id || randomId()),
          text: typeof x?.text === "string" ? x.text : "",
          done: !!x?.done,
        }))
      : [];

    setForm((prev) => ({
      ...prev,
      editingRouteId: route.source === "trip_routes" ? route.id : null,
      routeDate: (route.route_day || route.route_date || prev.routeDate || todayISO()) as string,
      routeName: String(route.route_name || route.title || "Ruta"),
      departureTime: route.departure_time || "",
      color: route.color || ROUTE_COLOR_PALETTE[0],
      autoColor: !route.color,
      stopEnabled: typeof route.stop_latitude === "number" && typeof route.stop_longitude === "number",
      restStopsEnabled: !!restStops?.enabled,
      restStopsCount: typeof restStops?.count === "number" ? restStops.count : 1,
      restStopMinutes: typeof restStops?.minutesEach === "number" ? restStops.minutesEach : 15,
      noteText,
      checklist,
    }));

    setOrigin({
      address: route.origin_address || route.origin_name || "",
      latitude: route.origin_latitude ?? null,
      longitude: route.origin_longitude ?? null,
    });
    setStop({
      address: route.stop_address || route.stop_name || "",
      latitude: route.stop_latitude ?? null,
      longitude: route.stop_longitude ?? null,
    });
    setDestination({
      address: route.destination_address || route.destination_name || "",
      latitude: route.destination_latitude ?? null,
      longitude: route.destination_longitude ?? null,
    });
  }

  async function calculateRoutePreview() {
    setError(null);
    setInfo(null);

    const name = form.routeName.trim() || "Ruta";
    if (!form.routeDate) {
      setError("Selecciona un día.");
      return null;
    }

    if (
      typeof origin.latitude !== "number" ||
      typeof origin.longitude !== "number" ||
      typeof destination.latitude !== "number" ||
      typeof destination.longitude !== "number"
    ) {
      setError("Origen y destino deben tener coordenadas (elige un plan con coords o usa el buscador).");
      return null;
    }

    setCalculatingRoute(true);
    try {
      const originPt: RoutePoint = { lat: origin.latitude, lng: origin.longitude };
      const destPt: RoutePoint = { lat: destination.latitude, lng: destination.longitude };
      const stopPt =
        form.stopEnabled && typeof stop.latitude === "number" && typeof stop.longitude === "number"
          ? ({ lat: stop.latitude, lng: stop.longitude } satisfies RoutePoint)
          : null;

      let routePoints: RoutePoint[] = [originPt, ...(stopPt ? [stopPt] : []), destPt];
      let distanceText: string | null = null;
      let durationText: string | null = null;
      let durationSeconds: number | null = null;

      try {
        const osrm = await fetchOsrmRoute({ origin: originPt, destination: destPt, stop: stopPt });
        if (Array.isArray(osrm.points) && osrm.points.length >= 2) {
          routePoints = osrm.points;
        }
        if (typeof osrm.distanceMeters === "number" && Number.isFinite(osrm.distanceMeters)) distanceText = formatKm(osrm.distanceMeters);
        if (typeof osrm.durationSeconds === "number" && Number.isFinite(osrm.durationSeconds)) {
          durationSeconds = osrm.durationSeconds;
          durationText = formatDuration(osrm.durationSeconds);
        }
      } catch {
        // Si OSRM falla, enseñamos igualmente la línea directa si hay puntos válidos.
      }

      const preview: RoutePreview = {
        key: routeCalcKey,
        points: routePoints,
        distanceText,
        durationText,
        durationSeconds,
        arrivalTime: addDurationToTime(form.departureTime, durationSeconds),
        color: effectiveRouteColor,
        label: name,
      };
      setFocusedRouteKey(null);
      setRoutePreview(preview);
      setInfo("Ruta calculada. Revisa el trazado y guarda cuando quieras.");
      return preview;
    } catch (e) {
      setRoutePreview(null);
      setError(e instanceof Error ? e.message : "No se pudo calcular la ruta.");
      return null;
    } finally {
      setCalculatingRoute(false);
    }
  }

  async function createOrUpdateRoute() {
    setError(null);
    setInfo(null);

    setSaving(true);
    try {
      const name = form.routeName.trim() || "Ruta";
      const preview = routePreview?.key === routeCalcKey ? routePreview : await calculateRoutePreview();
      if (!preview) return;

      const input: SaveRouteInput = {
        routeDate: form.routeDate,
        routeName: name,
        departureTime: form.departureTime,
        mode,
        color: form.autoColor ? effectiveRouteColor : form.color || ROUTE_COLOR_PALETTE[0],
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
        distanceText: preview.distanceText,
        durationText: preview.durationText,
        arrivalTime: preview.arrivalTime,
        routePoints: preview.points,
        pathPoints: preview.points,
        notes: buildRouteNotes(form, form.editingRouteId ? routesState.find((r) => r.id === form.editingRouteId && r.source === "trip_routes")?.notes ?? null : null),
      };

      await saveRoute(input, form.editingRouteId || undefined);
      setInfo(form.editingRouteId ? "Ruta actualizada." : "Ruta guardada.");
      setForm(defaultRouteForm(form.routeDate));
      setIsRouteFormOpen(false);
      setRoutePreview(null);
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
    setError(null);
    try {
      if (route.source === "trip_routes") {
        await deleteRoute(route.id);
      } else {
        const resp = await fetch(`/api/legacy-routes/${encodeURIComponent(route.id)}`, { method: "DELETE" });
        const payload = await resp.json().catch(() => null);
        if (!resp.ok) throw new Error(payload?.error || "No se pudo eliminar la ruta legacy.");
        await reloadRoutes();
      }
      setInfo(route.source === "trip_routes" ? "Ruta eliminada." : "Ruta legacy eliminada.");
      if (focusedRouteKey === `${route.source || "trip_routes"}:${route.id}`) setFocusedRouteKey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar la ruta.");
    }
  }

  const routesForList = useMemo(() => {
    const base = selectedDate === "all" ? routesState : routesState.filter((r) => (r.route_day || r.route_date) === selectedDate);
    return base.slice().sort((a, b) => {
      const oa = a.route_order ?? Number.POSITIVE_INFINITY;
      const ob = b.route_order ?? Number.POSITIVE_INFINITY;
      if (oa !== ob) return oa - ob;
      return String(a.departure_time || "").localeCompare(String(b.departure_time || ""));
    });
  }, [routesState, selectedDate]);

  const filteredRouteKeys = useMemo(() => routesForList.map((r) => `${r.source || "trip_routes"}:${r.id}`), [routesForList]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (selectedDate === "all") return;
      const { active, over } = event;
      if (!over) return;
      if (active.id === over.id) return;

      const ids = filteredRouteKeys;
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const next = arrayMove(ids, oldIndex, newIndex);

      // Optimista UI
      setRoutesState((prev) => {
        const byKey: Map<string, TripMapRoute> = new Map(
          prev.map((r) => [`${r.source || "trip_routes"}:${r.id}`, r] as [string, TripMapRoute])
        );
        next.forEach((key, index) => {
          const r = byKey.get(key);
          if (r && r.source === "trip_routes") byKey.set(key, { ...r, route_order: index + 1 });
        });
        return Array.from(byKey.values());
      });

      // Persistir solo rutas editables (trip_routes)
      const updates = next
        .map((key, index) => {
          const [source, id] = String(key).split(":");
          return { source, id, order: index + 1 };
        })
        .filter((u) => u.source === "trip_routes" && !!u.id);

      await Promise.all(
        updates.map((u) =>
          fetch(`/api/trip-routes/${encodeURIComponent(u.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ route_order: u.order }),
          })
        )
      );
    },
    [filteredRouteKeys, selectedDate]
  );

  function SortableRouteRow({ route }: { route: TripMapRoute }) {
    const key = `${route.source || "trip_routes"}:${route.id}`;
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: key });
    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.7 : 1,
    };

    const active = focusedRouteKey === key;
    const title = String(route.title || route.route_name || "Ruta");
    const subtitle = [route.departure_time ? `Salida ${route.departure_time}` : "", route.distance_text || "", route.duration_text || ""]
      .filter(Boolean)
      .join(" · ");

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`rounded-3xl border p-3 transition ${active ? "border-violet-300 bg-violet-50/80 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0" {...attributes} {...listeners} title="Arrastrar para reordenar">
            <SortHandle />
          </div>
          <button
            type="button"
            onClick={() => setFocusedRouteKey((prev) => (prev === key ? null : key))}
            className="min-w-0 flex-1 text-left"
            title="Enfocar/mostrar en el mapa"
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: route.color || "#6366f1" }}
              />
              <div className="text-sm font-semibold text-slate-950 line-clamp-1">{title}</div>
            </div>
            {subtitle ? <div className="mt-1 text-xs text-slate-600 line-clamp-2">{subtitle}</div> : null}
          </button>
          <div className="flex shrink-0 items-center gap-2">
            {route.source === "trip_routes" ? (
              <>
                <button
                  type="button"
                  onClick={() => beginEditRoute(route)}
                  className="inline-flex min-h-[34px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  title="Editar ruta"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDuplicateRoute(route);
                    setDuplicateOpen(true);
                  }}
                  className="inline-flex min-h-[34px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  title="Duplicar ruta"
                >
                  <Copy className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => void removeRoute(route)}
                  className="inline-flex min-h-[34px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                  title="Eliminar ruta"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card-soft p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <MapPin className="h-4 w-4 text-violet-700" aria-hidden />
              Mapa y rutas
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Filtra por día, calcula recorridos, enfoca una ruta concreta y organiza todo desde la misma pantalla.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusChip active={!!focusedRouteKey}>{focusedRouteKey ? "Ruta enfocada" : "Vista general"}</StatusChip>
            <StatusChip active={!!routePreview}>{routePreview ? "Preview" : "Sin preview"}</StatusChip>
            <StatusChip active={showPlanMarkers}>{showPlanMarkers ? "Marcadores on" : "Marcadores off"}</StatusChip>
            <button
              type="button"
              onClick={() => setIsMapVisible((v) => !v)}
              className="inline-flex min-h-[34px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {isMapVisible ? "Ocultar mapa" : "Mostrar mapa"}
            </button>
          </div>
        </div>
      </div>

      <div className={`grid gap-6 ${isMapVisible ? "xl:grid-cols-[420px_minmax(0,1fr)]" : "grid-cols-1"}`}>
        <aside className="space-y-4">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
        ) : null}
        {info ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{info}</div>
        ) : null}

        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4">
            <div>
              <div className="text-sm font-extrabold text-slate-950">Filtros y contexto</div>
              <div className="mt-1 text-xs text-slate-600">Controla lo que ves en el mapa y cambia entre vista general y rutas concretas.</div>
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

          <div className="grid gap-3 px-4 py-4">
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
              {customKindsWarning ? (
                <div className="mt-2 text-[11px] text-amber-700">{customKindsWarning}</div>
              ) : null}
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
                  const label = customByKey.get(k)?.label || kindLabel(k);
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
                      {label}
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
                <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-600">{form.editingRouteId ? "Editor de ruta" : "Nueva ruta"}</div>
                <div className="flex items-center gap-2">
                  {isRouteFormOpen ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsRouteFormOpen(false);
                        setForm(defaultRouteForm(form.routeDate || todayISO()));
                        setRoutePreview(null);
                        setOrigin({ address: "", latitude: null, longitude: null });
                        setStop({ address: "", latitude: null, longitude: null });
                        setDestination({ address: "", latitude: null, longitude: null });
                        setOriginPlanId("");
                        setStopPlanId("");
                        setDestinationPlanId("");
                      }}
                      className="inline-flex min-h-[34px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cerrar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsRouteFormOpen(true);
                        setForm(defaultRouteForm(selectedDate !== "all" ? selectedDate : todayISO()));
                        setRoutePreview(null);
                        setOrigin({ address: "", latitude: null, longitude: null });
                        setStop({ address: "", latitude: null, longitude: null });
                        setDestination({ address: "", latitude: null, longitude: null });
                        setOriginPlanId("");
                        setStopPlanId("");
                        setDestinationPlanId("");
                      }}
                      className="inline-flex min-h-[34px] items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                      Nueva ruta
                    </button>
                  )}
                </div>
              </div>

              {isRouteFormOpen ? (
              <div className="mt-4 grid gap-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-600">1. Datos básicos</div>
                  <div className="mt-1 text-[11px] text-slate-500">Nombre, fecha, hora y color con el que se mostrará la ruta.</div>
                </div>
                <label className="text-xs font-semibold text-slate-700">
                  Nombre
                  <input
                    value={form.routeName}
                    onChange={(e) => setForm((prev) => ({ ...prev, routeName: e.target.value }))}
                    className="mt-2 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
                    placeholder="Ruta día 1"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-semibold text-slate-700">
                    Día
                    <input
                      type="date"
                      value={form.routeDate}
                      onChange={(e) => setForm((prev) => ({ ...prev, routeDate: e.target.value }))}
                      className="mt-2 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-700">
                    Hora
                    <input
                      type="time"
                      value={form.departureTime}
                      onChange={(e) => setForm((prev) => ({ ...prev, departureTime: e.target.value }))}
                      className="mt-2 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
                    />
                  </label>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-xs font-extrabold text-slate-900">Color de la ruta</div>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input
                      type="color"
                      value={form.autoColor ? effectiveRouteColor : form.color}
                      onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value, autoColor: false }))}
                      className="h-11 w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-2 sm:w-24"
                      title="Elegir color de la ruta"
                      disabled={form.autoColor}
                      aria-label="Elegir color de la ruta"
                    />
                    <label className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-extrabold text-slate-700">
                      <input
                        type="checkbox"
                        checked={form.autoColor}
                        onChange={(e) => setForm((prev) => ({ ...prev, autoColor: e.target.checked }))}
                      />
                      Color auto
                    </label>
                    <div className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <span className="inline-block h-4 w-4 rounded-full border border-slate-300" style={{ backgroundColor: effectiveRouteColor }} />
                      {form.autoColor ? "Se asignará un color libre automáticamente." : "Color manual seleccionado."}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-600">2. Itinerario</div>
                  <div className="mt-1 text-[11px] text-slate-500">Selecciona origen, parada opcional y destino usando planes o búsqueda.</div>
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
                  <label className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.stopEnabled}
                      onChange={(e) => setForm((prev) => ({ ...prev, stopEnabled: e.target.checked }))}
                    />
                    Activar parada
                  </label>
                  <select
                    value={stopPlanId}
                    onChange={(e) => setStopPlanId(e.target.value)}
                    className="mt-2 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                    disabled={!form.stopEnabled}
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

                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-600">3. Opciones y notas</div>
                  <div className="mt-1 text-[11px] text-slate-500">Añade checklist, comentarios y paradas de descanso informativas.</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-xs font-extrabold text-slate-900">Notas y checklist</div>
                  <textarea
                    value={form.noteText}
                    onChange={(e) => setForm((prev) => ({ ...prev, noteText: e.target.value }))}
                    rows={3}
                    placeholder="Notas para esta ruta…"
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  />

                  <div className="mt-3">
                    <div className="text-xs font-semibold text-slate-700">Checklist</div>
                    {form.checklist.length ? (
                      <div className="mt-2 space-y-2">
                        {form.checklist.map((item) => (
                          <div key={item.id} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={item.done}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  checklist: prev.checklist.map((x) => (x.id === item.id ? { ...x, done: e.target.checked } : x)),
                                }))
                              }
                            />
                            <input
                              value={item.text}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  checklist: prev.checklist.map((x) => (x.id === item.id ? { ...x, text: e.target.value } : x)),
                                }))
                              }
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                              placeholder="Elemento…"
                            />
                            <button
                              type="button"
                              onClick={() => setForm((prev) => ({ ...prev, checklist: prev.checklist.filter((x) => x.id !== item.id) }))}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Quitar
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-slate-500">Aún no hay checklist.</div>
                    )}

                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, checklist: [...prev.checklist, { id: randomId(), text: "", done: false }] }))}
                      className="mt-2 inline-flex min-h-[36px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Añadir item
                    </button>
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={form.restStopsEnabled}
                        onChange={(e) => setForm((prev) => ({ ...prev, restStopsEnabled: e.target.checked }))}
                      />
                      Paradas de descanso (informativo)
                    </label>
                    {form.restStopsEnabled ? (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <label className="text-xs font-semibold text-slate-700">
                          Nº paradas
                          <input
                            type="number"
                            min={0}
                            value={form.restStopsCount}
                            onChange={(e) => setForm((prev) => ({ ...prev, restStopsCount: Number(e.target.value || 0) }))}
                            className="mt-2 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
                          />
                        </label>
                        <label className="text-xs font-semibold text-slate-700">
                          Minutos cada una
                          <input
                            type="number"
                            min={0}
                            value={form.restStopMinutes}
                            onChange={(e) => setForm((prev) => ({ ...prev, restStopMinutes: Number(e.target.value || 0) }))}
                            className="mt-2 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-600">4. Previsualización y guardado</div>
                  <div className="mt-1 text-[11px] text-slate-500">Calcula la ruta, revisa el resultado y guarda solo cuando esté correcta.</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      disabled={calculatingRoute || saving || savingRoute}
                      onClick={() => void calculateRoutePreview()}
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
                    >
                      <RefreshCw className={`h-4 w-4 ${calculatingRoute ? "animate-spin" : ""}`} aria-hidden />
                      {calculatingRoute ? "Calculando ruta…" : "Calcular ruta"}
                    </button>

                    {routePreview ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                        <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-emerald-800">Ruta calculada</div>
                        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div className="rounded-xl bg-white px-3 py-2">
                            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Distancia</div>
                            <div className="mt-1 text-sm font-semibold text-slate-900">{routePreview.distanceText || "No disponible"}</div>
                          </div>
                          <div className="rounded-xl bg-white px-3 py-2">
                            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Duración</div>
                            <div className="mt-1 text-sm font-semibold text-slate-900">{routePreview.durationText || "No disponible"}</div>
                          </div>
                          <div className="rounded-xl bg-white px-3 py-2">
                            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Llegada aprox.</div>
                            <div className="mt-1 text-sm font-semibold text-slate-900">{routePreview.arrivalTime || "No disponible"}</div>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-emerald-900">La previsualización ya está dibujada en el mapa.</div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        Calcula la ruta para ver el trazado en el mapa antes de guardarla.
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={saving || savingRoute || calculatingRoute}
                      onClick={() => void createOrUpdateRoute()}
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" aria-hidden />
                      {saving || savingRoute ? "Guardando…" : form.editingRouteId ? "Guardar cambios" : "Guardar ruta"}
                    </button>
                  </div>
                </div>
              </div>
              ) : (
                <div className="mt-3 text-sm text-slate-600">
                  Pulsa <span className="font-semibold text-slate-900">Nueva ruta</span> para crear una, o usa <span className="font-semibold text-slate-900">Editar</span> en una ruta existente.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4">
            <div>
              <div className="text-sm font-extrabold text-slate-950">Rutas guardadas</div>
              <div className="mt-1 text-xs text-slate-600">Consulta, filtra y ordena tus recorridos del viaje.</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowRoutesList((v) => !v)}
                className="inline-flex min-h-[34px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                title={showRoutesList ? "Ocultar rutas" : "Mostrar rutas"}
              >
                {showRoutesList ? "Ocultar rutas" : "Mostrar rutas"}
              </button>
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
          </div>

          <div className="grid gap-2 px-4 py-4">
            <label className="text-xs font-semibold text-slate-700">
              Buscar ruta
              <input
                value={routeQuery}
                onChange={(e) => setRouteQuery(e.target.value)}
                className="mt-2 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
                placeholder="Filtrar por nombre…"
              />
            </label>
            {selectedDate !== "all" ? <div className="text-[11px] text-slate-500">Puedes reordenar rutas de este día arrastrando.</div> : null}
          </div>

          {showRoutesList ? (
          <div className="space-y-3 px-4 pb-4">
            {selectedDate !== "all" ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={filteredRouteKeys} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {routesForList.map((r) => (
                      <SortableRouteRow key={`${r.source || "trip_routes"}:${r.id}`} route={r} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="space-y-2">
                {routesForList.map((r) => {
                  const key = `${r.source || "trip_routes"}:${r.id}`;
                  const active = focusedRouteKey === key;
                  const title = String(r.title || r.route_name || "Ruta");
                  const subtitle = [r.departure_time ? `Salida ${r.departure_time}` : "", r.distance_text || "", r.duration_text || ""]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div key={key} className={`rounded-2xl border p-3 ${active ? "border-violet-300 bg-violet-50" : "border-slate-200 bg-white"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => setFocusedRouteKey((prev) => (prev === key ? null : key))}
                          className="min-w-0 text-left"
                          title="Enfocar/mostrar en el mapa"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-slate-950 line-clamp-1">{title}</div>
                            {r.source === "legacy_routes" ? (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-amber-800">
                                Legacy
                              </span>
                            ) : null}
                          </div>
                          {subtitle ? <div className="mt-1 text-xs text-slate-600 line-clamp-2">{subtitle}</div> : null}
                        </button>
                        <div className="flex items-center gap-2">
                          {r.source === "trip_routes" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => beginEditRoute(r)}
                                className="inline-flex min-h-[34px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDuplicateRoute(r);
                                  setDuplicateOpen(true);
                                }}
                                className="inline-flex min-h-[34px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                title="Duplicar ruta"
                              >
                                <Copy className="h-4 w-4" aria-hidden />
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void removeRoute(r)}
                            className="inline-flex min-h-[34px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                            title={r.source === "legacy_routes" ? "Eliminar ruta legacy" : "Eliminar ruta"}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          ) : (
            <div className="px-4 py-4 text-sm text-slate-500">La lista de rutas está oculta.</div>
          )}
        </section>
        </aside>

        <MapSurface visible={isMapVisible} bounds={bounds} boundsKey={boundsKey} lines={mapEntities.lines} markers={mapEntities.markers} />
      </div>

      <DuplicateRouteDialog
        open={duplicateOpen}
        route={duplicateRoute as any}
        tripId={tripId}
        tripDates={Array.isArray(tripDates) ? tripDates : []}
        defaultDate={selectedDate !== "all" ? selectedDate : undefined}
        onClose={() => setDuplicateOpen(false)}
        onDuplicated={() => void reloadRoutes()}
      />
    </div>
  );
}

