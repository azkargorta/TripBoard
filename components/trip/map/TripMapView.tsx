"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  GoogleMap,
  MarkerF,
  PolylineF,
  InfoWindowF,
  useJsApiLoader,
} from "@react-google-maps/api";
import PlaceAutocompleteInput from "@/components/PlaceAutocompleteInput";

type TripSummary = {
  id: string;
  name: string;
  destination?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

type Props = {
  tripId: string;
  trip: TripSummary;
  tripDates: string[];
  planSources: {
    tripActivities: any[];
    legacyActivities: any[];
  };
  routeSources: {
    tripRoutes: any[];
    legacyRoutes: any[];
  };
};

type PlanOption = {
  id: string;
  source: "trip_activities" | "activities";
  title: string;
  subtitle: string;
  date: string | null;
  time: string | null;
  type: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
};

type RouteStop = {
  id: string;
  planId: string | null;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
};

type RouteRecord = {
  id: string;
  sourceTable: "trip_routes" | "routes";
  editable: boolean;
  routeDate: string | null;
  routeName: string;
  departureTime: string;
  mode: string;
  notes: string;
  color: string;
  routeOrder: number | null;
  origin: RouteStop;
  destination: RouteStop;
  waypoints: RouteStop[];
  distanceText: string | null;
  durationText: string | null;
  arrivalTime: string | null;
  pathPoints: Array<{ lat: number; lng: number }>;
};

type FormState = {
  routeDate: string;
  routeName: string;
  departureTime: string;
  mode: string;
  notes: string;
  origin: RouteStop;
  destination: RouteStop;
  waypoints: RouteStop[];
  pathPoints: Array<{ lat: number; lng: number }>;
  distanceText: string | null;
  durationText: string | null;
  arrivalTime: string | null;
};

type FieldKey = "origin" | "destination";

type ManualFieldProps = {
  label: string;
  selectLabel: string;
  planOptions: PlanOption[];
  value: RouteStop;
  onPickPlan: (planId: string) => void;
  onPlaceSelected: (payload: { address: string; latitude: number | null; longitude: number | null }) => void;
  onTextChange: (value: string) => void;
};

const MAP_LIBRARIES: ("places")[] = ["places"];
const DEFAULT_CENTER = { lat: 40.4168, lng: -3.7038 };
const COLOR_PALETTE = ["#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c", "#0891b2", "#d97706"];

function asFiniteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseJsonMaybe<T>(value: unknown): T | null {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  if (value && typeof value === "object") {
    return value as T;
  }
  return null;
}

function normalizePlanType(input?: string | null) {
  const value = (input || "").toLowerCase();
  if (value.includes("hotel") || value.includes("lodging") || value.includes("aloj")) return "Alojamiento";
  if (value.includes("rest") || value.includes("food") || value.includes("comida")) return "Restaurante";
  if (value.includes("museum") || value.includes("muse")) return "Museo";
  if (value.includes("transport") || value.includes("train") || value.includes("vuelo")) return "Transporte";
  if (value.includes("visit") || value.includes("view") || value.includes("mirador")) return "Visita";
  return "Actividad";
}


function buildTripDateRange(startDate?: string | null, endDate?: string | null) {
  if (!startDate || !endDate) return [];
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() > end.getTime()) return [];
  const result: string[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const yyyy = cursor.getFullYear();
    const mm = String(cursor.getMonth() + 1).padStart(2, "0");
    const dd = String(cursor.getDate()).padStart(2, "0");
    result.push(`${yyyy}-${mm}-${dd}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function buildPlanOptions(tripActivities: any[], legacyActivities: any[]) {
  const items: PlanOption[] = [];
  const seen = new Set<string>();

  for (const row of tripActivities || []) {
    const latitude = asFiniteNumber(row.latitude);
    const longitude = asFiniteNumber(row.longitude);
    if (latitude == null || longitude == null) continue;

    const title = String(row.title || row.place_name || row.location_name || "Lugar del plan");
    const address = String(row.address || row.place_name || row.location_name || title);
    const date = row.activity_date ? String(row.activity_date) : null;
    const time = row.activity_time ? String(row.activity_time).slice(0, 5) : null;
    const type = normalizePlanType(row.activity_kind || row.activity_type);
    const key = `trip_activities:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      id: String(row.id),
      source: "trip_activities",
      title,
      subtitle: `${type}${date ? ` · ${date}` : ""}${time ? ` ${time}` : ""}`,
      date,
      time,
      type,
      address,
      latitude,
      longitude,
    });
  }

  for (const row of legacyActivities || []) {
    const latitude = asFiniteNumber(row.lat ?? row.latitude);
    const longitude = asFiniteNumber(row.lng ?? row.longitude);
    if (latitude == null || longitude == null) continue;

    const title = String(row.title || row.place || "Lugar del plan");
    const address = String(row.address || row.place || title);
    const date = row.activity_date ? String(row.activity_date) : null;
    const time = row.activity_time ? String(row.activity_time).slice(0, 5) : null;
    const type = normalizePlanType(row.place_type || row.category);
    const key = `activities:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      id: String(row.id),
      source: "activities",
      title,
      subtitle: `${type}${date ? ` · ${date}` : ""}${time ? ` ${time}` : ""}`,
      date,
      time,
      type,
      address,
      latitude,
      longitude,
    });
  }

  return items.sort((a, b) => {
    const dateCompare = (a.date || "").localeCompare(b.date || "");
    if (dateCompare !== 0) return dateCompare;
    const timeCompare = (a.time || "").localeCompare(b.time || "");
    if (timeCompare !== 0) return timeCompare;
    return a.title.localeCompare(b.title);
  });
}

function buildStop(partial?: Partial<RouteStop> | null, fallbackName = ""): RouteStop {
  return {
    id: partial?.id || crypto.randomUUID(),
    planId: partial?.planId ?? null,
    name: partial?.name || fallbackName,
    address: partial?.address || partial?.name || fallbackName,
    latitude: partial?.latitude ?? null,
    longitude: partial?.longitude ?? null,
  };
}

function normalizeWaypointList(value: unknown): RouteStop[] {
  const parsed = parseJsonMaybe<any[]>(value);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const latitude = asFiniteNumber(item.latitude ?? item.lat);
      const longitude = asFiniteNumber(item.longitude ?? item.lng);
      return buildStop({
        id: item.id || `wp-${index}`,
        planId: typeof item.planId === "string" ? item.planId : null,
        name: String(item.name || item.title || item.address || `Parada ${index + 1}`),
        address: String(item.address || item.name || item.title || `Parada ${index + 1}`),
        latitude,
        longitude,
      });
    })
    .filter(Boolean) as RouteStop[];
}

function normalizePathPoints(row: any): Array<{ lat: number; lng: number }> {
  const sources = [row.path_points, row.route_points, row.pathPoints];
  for (const source of sources) {
    const parsed = parseJsonMaybe<any[]>(source);
    if (!Array.isArray(parsed)) continue;
    const points = parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const lat = asFiniteNumber(item.lat ?? item.latitude);
        const lng = asFiniteNumber(item.lng ?? item.longitude);
        return lat != null && lng != null ? { lat, lng } : null;
      })
      .filter(Boolean) as Array<{ lat: number; lng: number }>;
    if (points.length >= 2) return points;
  }
  return [];
}

function normalizeRoutes(tripRoutes: any[], legacyRoutes: any[]): RouteRecord[] {
  const normalized: RouteRecord[] = [];

  const pushRoute = (row: any, sourceTable: "trip_routes" | "routes") => {
    const routeDate = row.route_day || row.route_date || row.day_date || null;
    const origin = buildStop({
      id: `${sourceTable}-${row.id}-origin`,
      name: row.origin_name || row.origin_address || "Origen",
      address: row.origin_address || row.origin_name || "Origen",
      latitude: asFiniteNumber(row.origin_latitude),
      longitude: asFiniteNumber(row.origin_longitude),
    });
    const destination = buildStop({
      id: `${sourceTable}-${row.id}-destination`,
      name: row.destination_name || row.destination_address || "Destino",
      address: row.destination_address || row.destination_name || "Destino",
      latitude: asFiniteNumber(row.destination_latitude),
      longitude: asFiniteNumber(row.destination_longitude),
    });

    let waypoints = normalizeWaypointList(row.waypoints);
    if (!waypoints.length && (asFiniteNumber(row.stop_latitude) != null || asFiniteNumber(row.stop_longitude) != null || row.stop_name)) {
      waypoints = [
        buildStop({
          id: `${sourceTable}-${row.id}-stop-0`,
          name: row.stop_name || row.stop_address || "Parada",
          address: row.stop_address || row.stop_name || "Parada",
          latitude: asFiniteNumber(row.stop_latitude),
          longitude: asFiniteNumber(row.stop_longitude),
        }),
      ];
    }

    normalized.push({
      id: String(row.id),
      sourceTable,
      editable: sourceTable === "trip_routes",
      routeDate: routeDate ? String(routeDate) : null,
      routeName: String(row.route_name || row.title || row.name || "Ruta sin nombre"),
      departureTime: String(row.departure_time || row.route_start_time || row.start_time || ""),
      mode: String(row.travel_mode || row.mode || "driving").toLowerCase(),
      notes: String(row.notes || ""),
      color: String(row.color || COLOR_PALETTE[normalized.length % COLOR_PALETTE.length]),
      routeOrder: asFiniteNumber(row.route_order),
      origin,
      destination,
      waypoints,
      distanceText: row.distance_text ? String(row.distance_text) : null,
      durationText: row.duration_text ? String(row.duration_text) : null,
      arrivalTime: row.arrival_time ? String(row.arrival_time) : null,
      pathPoints: normalizePathPoints(row),
    });
  };

  (tripRoutes || []).forEach((row) => pushRoute(row, "trip_routes"));
  (legacyRoutes || []).forEach((row) => pushRoute(row, "routes"));

  return normalized.sort((a, b) => {
    const dayCompare = (a.routeDate || "").localeCompare(b.routeDate || "");
    if (dayCompare !== 0) return dayCompare;
    const orderCompare = (a.routeOrder ?? 9999) - (b.routeOrder ?? 9999);
    if (orderCompare !== 0) return orderCompare;
    const timeCompare = (a.departureTime || "").localeCompare(b.departureTime || "");
    if (timeCompare !== 0) return timeCompare;
    return a.routeName.localeCompare(b.routeName);
  });
}

function normalizeSingleRoute(row: any, sourceTable: "trip_routes" | "routes") {
  return normalizeRoutes(sourceTable === "trip_routes" ? [row] : [], sourceTable === "routes" ? [row] : [])[0];
}

function emptyForm(selectedDate = ""): FormState {
  return {
    routeDate: selectedDate,
    routeName: "",
    departureTime: "",
    mode: "driving",
    notes: "",
    origin: buildStop({}),
    destination: buildStop({}),
    waypoints: [],
    pathPoints: [],
    distanceText: null,
    durationText: null,
    arrivalTime: null,
  };
}

function routeToForm(route: RouteRecord): FormState {
  return {
    routeDate: route.routeDate || "",
    routeName: route.routeName,
    departureTime: route.departureTime,
    mode: route.mode,
    notes: route.notes,
    origin: { ...route.origin },
    destination: { ...route.destination },
    waypoints: route.waypoints.map((item) => ({ ...item })),
    pathPoints: [...route.pathPoints],
    distanceText: route.distanceText,
    durationText: route.durationText,
    arrivalTime: route.arrivalTime,
  };
}

function timePlusMinutes(time: string, minutes: number) {
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const normalized = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function routeHasValidEndpoints(route: RouteRecord) {
  return (
    route.origin.latitude != null &&
    route.origin.longitude != null &&
    route.destination.latitude != null &&
    route.destination.longitude != null
  );
}

function stopHasCoords(stop: RouteStop) {
  return stop.latitude != null && stop.longitude != null;
}

function formatPlanLabel(item: PlanOption) {
  return `${item.title} — ${item.type}${item.date ? ` — ${item.date}` : ""}${item.time ? ` ${item.time}` : ""}`;
}

function sameDay(a: string | null | undefined, b: string | null | undefined) {
  return (a || "") === (b || "");
}

function mapTravelMode(mode: string) {
  switch (mode) {
    case "walking":
      return google.maps.TravelMode.WALKING;
    case "bicycling":
      return google.maps.TravelMode.BICYCLING;
    case "transit":
      return google.maps.TravelMode.TRANSIT;
    case "driving":
    default:
      return google.maps.TravelMode.DRIVING;
  }
}

function normalizeRouteState(items: RouteRecord[]) {
  return [...items].sort((a, b) => {
    const dayCompare = (a.routeDate || "").localeCompare(b.routeDate || "");
    if (dayCompare !== 0) return dayCompare;
    const orderCompare = (a.routeOrder ?? 9999) - (b.routeOrder ?? 9999);
    if (orderCompare !== 0) return orderCompare;
    const timeCompare = (a.departureTime || "").localeCompare(b.departureTime || "");
    if (timeCompare !== 0) return timeCompare;
    return a.routeName.localeCompare(b.routeName);
  });
}


function cleanPathPoints(points: Array<{ lat: number; lng: number }> | undefined | null) {
  return (points || []).filter((point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function ManualField({
  label,
  selectLabel,
  planOptions,
  value,
  onPickPlan,
  onPlaceSelected,
  onTextChange,
}: ManualFieldProps) {
  return (
    <div className="rounded-2xl border border-slate-200 p-5">
      <label className="block text-sm font-semibold text-slate-900">{label}</label>
      <select
        value=""
        onChange={(event) => {
          if (!event.target.value) return;
          onPickPlan(event.target.value);
        }}
        className="mt-4 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none"
      >
        <option value="">{selectLabel}</option>
        {planOptions.map((item) => (
          <option key={`${item.source}-${item.id}`} value={`${item.source}:${item.id}`}>
            {formatPlanLabel(item)}
          </option>
        ))}
      </select>

      <p className="mt-5 text-sm font-semibold text-slate-900">O escribir una dirección o lugar de {label.toLowerCase()}</p>
      <div className="mt-3">
        <PlaceAutocompleteInput
          value={value.address}
          onChange={onTextChange}
          onPlaceSelect={onPlaceSelected}
          placeholder="Busca una dirección o lugar"
        />
      </div>

      {value.latitude != null && value.longitude != null ? (
        <p className="mt-3 text-xs text-slate-500">
          Coordenadas: {value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}
        </p>
      ) : null}
    </div>
  );
}

export default function TripMapView({ tripId, trip, tripDates, planSources, routeSources }: Props) {
  const safeRouteSources = useMemo(
    () => ({
      tripRoutes: Array.isArray(routeSources?.tripRoutes) ? routeSources.tripRoutes : [],
      legacyRoutes: Array.isArray(routeSources?.legacyRoutes) ? routeSources.legacyRoutes : [],
    }),
    [routeSources]
  );

  const { isLoaded, loadError } = useJsApiLoader({
    id: "tripboard-map-rebuild",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: ["places"],
  });

  const realTripDates = useMemo(() => {
    if (Array.isArray(tripDates) && tripDates.length > 0) return tripDates;
    return buildTripDateRange(trip?.start_date, trip?.end_date);
  }, [tripDates, trip?.start_date, trip?.end_date]);

  const [routes, setRoutes] = useState<RouteRecord[]>(() =>
    normalizeRoutes(safeRouteSources.tripRoutes, safeRouteSources.legacyRoutes)
  );
  const [selectedDay, setSelectedDay] = useState<string>("all");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(tripDates[0] || ""));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activeInfoId, setActiveInfoId] = useState<string | null>(null);
  const [draggingRouteId, setDraggingRouteId] = useState<string | null>(null);
  const [routeOverlays, setRouteOverlays] = useState<Record<string, Array<{ lat: number; lng: number }>>>({});
  const mapRef = useRef<google.maps.Map | null>(null);

  useEffect(() => {
    setRoutes(normalizeRoutes(safeRouteSources.tripRoutes, safeRouteSources.legacyRoutes));
  }, [safeRouteSources]);

  const planOptions = useMemo(
    () => buildPlanOptions(planSources.tripActivities, planSources.legacyActivities),
    [planSources.legacyActivities, planSources.tripActivities]
  );

  const daysWithRoutes = useMemo(() => {
    const days = Array.from(new Set(routes.map((item) => item.routeDate).filter(Boolean) as string[])).sort();
    return days;
  }, [routes]);

  const selectedDayRoutes = useMemo(() => {
    const base = selectedDay === "all" ? routes : routes.filter((item) => sameDay(item.routeDate, selectedDay));
    return [...base].sort((a, b) => {
      const orderCompare = (a.routeOrder ?? 9999) - (b.routeOrder ?? 9999);
      if (orderCompare !== 0) return orderCompare;
      const timeCompare = (a.departureTime || "").localeCompare(b.departureTime || "");
      if (timeCompare !== 0) return timeCompare;
      return a.routeName.localeCompare(b.routeName);
    });
  }, [routes, selectedDay]);

  const visiblePlanMarkers = useMemo(() => {
    return planOptions.filter((item) => {
      if (item.latitude == null || item.longitude == null) return false;
      if (selectedDay === "all") return true;
      return sameDay(item.date, selectedDay);
    });
  }, [planOptions, selectedDay]);

  const editableRoutesByDay = useMemo(() => {
    return selectedDayRoutes.filter((item) => item.editable);
  }, [selectedDayRoutes]);

  useEffect(() => {
    if (editingRouteId) {
      const route = routes.find((item) => item.id === editingRouteId);
      if (route) {
        setForm(routeToForm(route));
      }
      return;
    }
    setForm(emptyForm(selectedDay !== "all" ? selectedDay : realTripDates[0] || ""));
  }, [editingRouteId, selectedDay, realTripDates, routes]);

  useEffect(() => {
    if (!isLoaded || typeof window === "undefined" || !window.google?.maps?.DirectionsService) return;
    let cancelled = false;

    async function buildMissingOverlays() {
      const service = new window.google.maps.DirectionsService();
      const next: Record<string, Array<{ lat: number; lng: number }>> = {};

      for (const route of selectedDayRoutes) {
        if (route.pathPoints.length >= 2) {
          next[route.id] = route.pathPoints;
          continue;
        }
        if (!routeHasValidEndpoints(route)) continue;

        try {
          const result = await service.route({
            origin: { lat: route.origin.latitude!, lng: route.origin.longitude! },
            destination: { lat: route.destination.latitude!, lng: route.destination.longitude! },
            waypoints: route.waypoints.filter(stopHasCoords).map((stop) => ({
              location: { lat: stop.latitude!, lng: stop.longitude! },
              stopover: true,
            })),
            travelMode: mapTravelMode(route.mode),
          });

          next[route.id] =
            result.routes?.[0]?.overview_path?.map((point) => ({ lat: point.lat(), lng: point.lng() })) || [];
        } catch {
          next[route.id] = [];
        }
      }

      if (!cancelled) {
        setRouteOverlays(next);
      }
    }

    void buildMissingOverlays();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, selectedDayRoutes]);

  useEffect(() => {
    if (!isLoaded || !mapRef.current || !window.google?.maps) return;

    const bounds = new window.google.maps.LatLngBounds();
    let hasBounds = false;

    const routesForBounds = selectedRouteId
      ? selectedDayRoutes.filter((item) => item.id === selectedRouteId)
      : selectedDayRoutes;

    for (const route of routesForBounds) {
      const overlay = routeOverlays[route.id] || route.pathPoints;
      if (overlay.length >= 2) {
        overlay.forEach((point) => {
          bounds.extend(point);
          hasBounds = true;
        });
      } else {
        [route.origin, ...route.waypoints, route.destination].forEach((stop) => {
          if (stopHasCoords(stop)) {
            bounds.extend({ lat: stop.latitude!, lng: stop.longitude! });
            hasBounds = true;
          }
        });
      }
    }

    if (!routesForBounds.length) {
      visiblePlanMarkers.forEach((item) => {
        bounds.extend({ lat: item.latitude!, lng: item.longitude! });
        hasBounds = true;
      });
    }

    if (hasBounds) {
      mapRef.current.fitBounds(bounds, 80);
    }
  }, [isLoaded, routeOverlays, selectedDayRoutes, selectedRouteId, visiblePlanMarkers]);

  const center = useMemo(() => {
    const firstMarker = visiblePlanMarkers[0];
    if (firstMarker?.latitude != null && firstMarker?.longitude != null) {
      return { lat: firstMarker.latitude, lng: firstMarker.longitude };
    }
    const firstRoute = selectedDayRoutes.find(routeHasValidEndpoints);
    if (firstRoute?.origin.latitude != null && firstRoute.origin.longitude != null) {
      return { lat: firstRoute.origin.latitude, lng: firstRoute.origin.longitude };
    }
    return DEFAULT_CENTER;
  }, [selectedDayRoutes, visiblePlanMarkers]);

  function getPlanByCompositeId(value: string) {
    return planOptions.find((item) => `${item.source}:${item.id}` === value) || null;
  }

  function applyPlanToStop(target: "origin" | "destination" | { waypointId: string }, compositeId: string) {
    const plan = getPlanByCompositeId(compositeId);
    if (!plan) return;

    const nextStop = buildStop({
      planId: compositeId,
      name: plan.title,
      address: plan.address,
      latitude: plan.latitude,
      longitude: plan.longitude,
    });

    setForm((current) => {
      if (target === "origin") {
        return { ...current, origin: { ...current.origin, ...nextStop } };
      }
      if (target === "destination") {
        return { ...current, destination: { ...current.destination, ...nextStop } };
      }
      return {
        ...current,
        waypoints: current.waypoints.map((item) =>
          item.id === target.waypointId ? { ...item, ...nextStop } : item
        ),
      };
    });
  }

  function updateStop(target: "origin" | "destination" | { waypointId: string }, patch: Partial<RouteStop>) {
    setForm((current) => {
      if (target === "origin") {
        return { ...current, origin: { ...current.origin, ...patch } };
      }
      if (target === "destination") {
        return { ...current, destination: { ...current.destination, ...patch } };
      }
      return {
        ...current,
        waypoints: current.waypoints.map((item) =>
          item.id === target.waypointId ? { ...item, ...patch } : item
        ),
      };
    });
  }

  function addWaypoint() {
    setForm((current) => ({
      ...current,
      waypoints: [...current.waypoints, buildStop({}, `Parada ${current.waypoints.length + 1}`)],
    }));
  }

  function removeWaypoint(waypointId: string) {
    setForm((current) => ({
      ...current,
      waypoints: current.waypoints.filter((item) => item.id !== waypointId),
    }));
  }

  async function calculateRoute(shouldOptimize = false) {
    setMessage(null);

    if (!window.google?.maps?.DirectionsService) {
      throw new Error("Google Maps todavía no está cargado.");
    }
    if (!form.routeDate) {
      throw new Error("Selecciona un día para la ruta.");
    }
    if (!stopHasCoords(form.origin) || !stopHasCoords(form.destination)) {
      throw new Error("Origen y destino deben tener coordenadas válidas.");
    }

    const validWaypoints = form.waypoints.filter(stopHasCoords);
    const service = new window.google.maps.DirectionsService();
    const result = await service.route({
      origin: { lat: form.origin.latitude!, lng: form.origin.longitude! },
      destination: { lat: form.destination.latitude!, lng: form.destination.longitude! },
      waypoints: validWaypoints.map((item) => ({
        location: { lat: item.latitude!, lng: item.longitude! },
        stopover: true,
      })),
      optimizeWaypoints: shouldOptimize && validWaypoints.length > 1,
      travelMode: mapTravelMode(form.mode),
    });

    const route = result.routes?.[0];
    const legs = route?.legs || [];
    const overviewPath = route?.overview_path?.map((point) => ({ lat: point.lat(), lng: point.lng() })) || [];
    const totalDistance = legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0);
    const totalDuration = legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0);

    const waypointOrder = route?.waypoint_order || [];
    const optimizedWaypoints =
      shouldOptimize && waypointOrder.length === validWaypoints.length
        ? waypointOrder.map((index) => validWaypoints[index])
        : form.waypoints;

    setForm((current) => ({
      ...current,
      waypoints: optimizedWaypoints.map((item) => ({ ...item })),
      pathPoints: overviewPath,
      distanceText: totalDistance ? `${(totalDistance / 1000).toFixed(1)} km` : null,
      durationText: totalDuration
        ? `${Math.floor(totalDuration / 3600) > 0 ? `${Math.floor(totalDuration / 3600)} h ` : ""}${Math.round((totalDuration % 3600) / 60)} min`
        : null,
      arrivalTime: totalDuration ? timePlusMinutes(current.departureTime, Math.round(totalDuration / 60)) : null,
    }));
  }

  function serializeWaypoint(item: RouteStop) {
    return {
      id: item.id,
      planId: item.planId,
      name: item.name,
      address: item.address,
      latitude: item.latitude,
      longitude: item.longitude,
      lat: item.latitude,
      lng: item.longitude,
    };
  }

  async function saveRoute() {
    setMessage(null);
    if (!form.routeDate) {
      setMessage("Selecciona el día de la ruta.");
      return;
    }
    if (!form.routeName.trim()) {
      setMessage("Ponle un nombre a la ruta.");
      return;
    }
    if (!stopHasCoords(form.origin) || !stopHasCoords(form.destination)) {
      setMessage("Origen y destino deben salir del Plan o del autocompletar con coordenadas.");
      return;
    }

    setBusy(true);
    try {
      if (!form.pathPoints.length) {
        await calculateRoute(false);
      }

      const payload = {
        tripId,
        route_day: form.routeDate,
        route_date: form.routeDate,
        day_date: form.routeDate,
        title: form.routeName,
        route_name: form.routeName,
        name: form.routeName,
        departure_time: form.departureTime || null,
        start_time: form.departureTime || null,
        travel_mode: form.mode,
        mode: form.mode,
        notes: form.notes || null,
        origin_name: form.origin.name || form.origin.address,
        origin_address: form.origin.address || form.origin.name,
        origin_latitude: form.origin.latitude,
        origin_longitude: form.origin.longitude,
        stop_name: form.waypoints[0]?.name || null,
        stop_address: form.waypoints[0]?.address || null,
        stop_latitude: form.waypoints[0]?.latitude ?? null,
        stop_longitude: form.waypoints[0]?.longitude ?? null,
        destination_name: form.destination.name || form.destination.address,
        destination_address: form.destination.address || form.destination.name,
        destination_latitude: form.destination.latitude,
        destination_longitude: form.destination.longitude,
        waypoints: form.waypoints.map(serializeWaypoint),
        path_points: form.pathPoints,
        route_points: [
          { lat: form.origin.latitude, lng: form.origin.longitude },
          ...form.waypoints.filter(stopHasCoords).map((item) => ({ lat: item.latitude, lng: item.longitude })),
          { lat: form.destination.latitude, lng: form.destination.longitude },
        ],
        distance_text: form.distanceText,
        duration_text: form.durationText,
        arrival_time: form.arrivalTime,
        route_order:
          editingRouteId
            ? routes.find((item) => item.id === editingRouteId)?.routeOrder ?? 0
            : routes.filter((item) => sameDay(item.routeDate, form.routeDate)).length,
      };

      const response = await fetch(
        editingRouteId ? `/api/trip-routes/${editingRouteId}` : "/api/trip-routes",
        {
          method: editingRouteId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "No se pudo guardar la ruta.");
      }

      const freshRoute = normalizeSingleRoute(data.route, "trip_routes");
      setRoutes((current) => {
        if (editingRouteId) {
          return normalizeRouteState(current.map((item) => (item.id === editingRouteId ? freshRoute : item)));
        }
        return normalizeRouteState([...current, freshRoute]);
      });

      setEditingRouteId(null);
      setSelectedRouteId(data.route.id);
      setForm(emptyForm(form.routeDate));
      setMessage("Ruta guardada correctamente.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la ruta.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRoute(routeId: string) {
    const confirmed = window.confirm("¿Seguro que quieres borrar esta ruta?");
    if (!confirmed) return;

    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/trip-routes/${routeId}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "No se pudo eliminar la ruta.");
      setRoutes((current) => current.filter((item) => item.id !== routeId));
      if (selectedRouteId === routeId) setSelectedRouteId(null);
      if (editingRouteId === routeId) setEditingRouteId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo eliminar la ruta.");
    } finally {
      setBusy(false);
    }
  }

  async function persistOrder(day: string, orderedRoutes: RouteRecord[]) {
    const editable = orderedRoutes.filter((item) => item.editable && sameDay(item.routeDate, day));
    for (let index = 0; index < editable.length; index += 1) {
      await fetch(`/api/trip-routes/${editable[index].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ route_order: index }),
      });
    }
  }

  async function handleDropRoute(targetRouteId: string) {
    if (!draggingRouteId || draggingRouteId === targetRouteId || selectedDay === "all") return;

    const dayRoutes = selectedDayRoutes.filter((item) => sameDay(item.routeDate, selectedDay));
    const fromIndex = dayRoutes.findIndex((item) => item.id === draggingRouteId);
    const toIndex = dayRoutes.findIndex((item) => item.id === targetRouteId);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...dayRoutes];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    const reorderedWithOrder = reordered.map((item, index) => ({ ...item, routeOrder: index }));
    setRoutes((current) => {
      const others = current.filter((item) => !sameDay(item.routeDate, selectedDay));
      return normalizeRouteState([...reorderedWithOrder, ...others]);
    });

    setDraggingRouteId(null);
    try {
      await persistOrder(selectedDay, reorderedWithOrder);
    } catch {
      setMessage("No se pudo guardar el nuevo orden en la base de datos, pero el cambio sí se ha aplicado en pantalla.");
    }
  }

  if (loadError) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">No se pudo cargar Google Maps.</div>;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="space-y-5">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-2xl font-black text-slate-950">Mapa desde cero</h2>
          <p className="mt-2 text-sm text-slate-600">
            El filtro superior muestra solo días que ya tienen rutas. El formulario sí permite crear rutas en cualquier día real del viaje.
          </p>
          {message ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{message}</div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-xl font-black text-slate-950">Día</h3>
          <p className="mt-2 text-sm text-slate-600">Filtra el mapa y la lista por el día que elijas.</p>
          <input
            type="date"
            min={trip?.start_date || realTripDates[0] || undefined}
            max={trip?.end_date || realTripDates[realTripDates.length - 1] || undefined}
            value={selectedDay === "all" ? "" : selectedDay}
            onChange={(event) => {
              setSelectedDay(event.target.value || "all");
              setSelectedRouteId(null);
            }}
            className="mt-4 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none"
          />
          <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {selectedDay === "all" ? "No hay un día concreto seleccionado. Se muestran todos." : `Día seleccionado: ${selectedDay}`}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-slate-950">{editingRouteId ? "Editar ruta" : "Nueva ruta"}</h3>
              <p className="mt-1 text-sm text-slate-600">Origen, destino y paradas se pueden elegir desde todo lo que ya existe en Plan.</p>
            </div>
            {editingRouteId ? (
              <button
                type="button"
                onClick={() => setEditingRouteId(null)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
              >
                Cancelar
              </button>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-900">Día de la ruta</label>
              <input
                type="date"
                min={trip?.start_date || realTripDates[0] || undefined}
                max={trip?.end_date || realTripDates[realTripDates.length - 1] || undefined}
                value={form.routeDate}
                onChange={(event) => setForm((current) => ({ ...current, routeDate: event.target.value }))}
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-slate-900">Nombre de la ruta</label>
                <input
                  value={form.routeName}
                  onChange={(event) => setForm((current) => ({ ...current, routeName: event.target.value }))}
                  placeholder="Ej. Traslado al hotel"
                  className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-900">Hora de salida</label>
                <input
                  type="time"
                  value={form.departureTime}
                  onChange={(event) => setForm((current) => ({ ...current, departureTime: event.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none"
                />
              </div>
            </div>

            <ManualField
              label="Origen"
              selectLabel="Elegir desde Plan"
              planOptions={planOptions}
              value={form.origin}
              onPickPlan={(value) => applyPlanToStop("origin", value)}
              onTextChange={(value) => updateStop("origin", { address: value, name: value, planId: null })}
              onPlaceSelected={({ address, latitude, longitude }) =>
                updateStop("origin", { address, name: address, latitude, longitude, planId: null })
              }
            />

            <div className="rounded-3xl border border-slate-200 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-lg font-black text-slate-950">Paradas intermedias</h4>
                  <p className="mt-1 text-sm text-slate-600">Puedes añadir varias paradas y luego optimizar automáticamente su orden.</p>
                </div>
                <button
                  type="button"
                  onClick={addWaypoint}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                >
                  Añadir parada
                </button>
              </div>

              <div className="mt-4 space-y-4">
                {form.waypoints.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
                    No hay paradas todavía.
                  </div>
                ) : (
                  form.waypoints.map((stop, index) => (
                    <div key={stop.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900">Parada {index + 1}</p>
                        <button
                          type="button"
                          onClick={() => removeWaypoint(stop.id)}
                          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                        >
                          Quitar
                        </button>
                      </div>
                      <select
                        value=""
                        onChange={(event) => {
                          if (!event.target.value) return;
                          applyPlanToStop({ waypointId: stop.id }, event.target.value);
                        }}
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none"
                      >
                        <option value="">Elegir desde Plan</option>
                        {planOptions.map((item) => (
                          <option key={`${item.source}-${item.id}`} value={`${item.source}:${item.id}`}>
                            {formatPlanLabel(item)}
                          </option>
                        ))}
                      </select>
                      <div className="mt-3">
                        <PlaceAutocompleteInput
                          value={stop.address}
                          onChange={(value) => updateStop({ waypointId: stop.id }, { address: value, name: value, planId: null })}
                          onPlaceSelect={({ address, latitude, longitude }) =>
                            updateStop({ waypointId: stop.id }, { address, name: address, latitude, longitude, planId: null })
                          }
                          placeholder="Busca una dirección o lugar"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <ManualField
              label="Destino"
              selectLabel="Elegir desde Plan"
              planOptions={planOptions}
              value={form.destination}
              onPickPlan={(value) => applyPlanToStop("destination", value)}
              onTextChange={(value) => updateStop("destination", { address: value, name: value, planId: null })}
              onPlaceSelected={({ address, latitude, longitude }) =>
                updateStop("destination", { address, name: address, latitude, longitude, planId: null })
              }
            />

            <div>
              <label className="block text-sm font-semibold text-slate-900">Notas</label>
              <textarea
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                rows={3}
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy || !isLoaded}
                onClick={() => void calculateRoute(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 disabled:opacity-60"
              >
                Calcular ruta
              </button>
              <button
                type="button"
                disabled={busy || !isLoaded || form.waypoints.filter(stopHasCoords).length < 2}
                onClick={() => void calculateRoute(true)}
                className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 disabled:opacity-60"
              >
                Optimizar orden automático
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveRoute()}
                className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? "Guardando..." : editingRouteId ? "Guardar cambios" : "Crear ruta"}
              </button>
            </div>

            {(form.distanceText || form.durationText || form.arrivalTime) ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {form.distanceText ? <span>{form.distanceText}</span> : null}
                {form.durationText ? <span>{form.distanceText ? " · " : ""}{form.durationText}</span> : null}
                {form.arrivalTime ? <span>{form.distanceText || form.durationText ? " · " : ""}Llegada {form.arrivalTime}</span> : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="text-xl font-black text-slate-950">Mapa</h3>
            <p className="mt-1 text-sm text-slate-600">
              Si eliges un día, la vista se ajusta a sus rutas. Si no eliges ruta concreta, se muestran todas las del filtro activo.
            </p>
          </div>

          <div className="h-[620px] w-full bg-slate-100">
            {isLoaded && typeof window !== "undefined" && window.google?.maps ? (
              <GoogleMap
                center={center}
                zoom={7}
                mapContainerStyle={{ width: "100%", height: "100%" }}
                onLoad={(map) => {
                  mapRef.current = map;
                }}
                options={{
                  mapTypeControl: true,
                  streetViewControl: false,
                  fullscreenControl: true,
                }}
              >
                {visiblePlanMarkers.map((item) => (
                  <MarkerF
                    key={`${item.source}-${item.id}`}
                    position={{ lat: item.latitude!, lng: item.longitude! }}
                    onClick={() => setActiveInfoId(`${item.source}-${item.id}`)}
                    title={item.title}
                  />
                ))}

                {visiblePlanMarkers.map((item) =>
                  activeInfoId === `${item.source}-${item.id}` ? (
                    <InfoWindowF
                      key={`info-${item.source}-${item.id}`}
                      position={{ lat: item.latitude!, lng: item.longitude! }}
                      onCloseClick={() => setActiveInfoId(null)}
                    >
                      <div className="max-w-[240px] p-1 text-sm text-slate-800">
                        <p className="font-semibold">{item.title}</p>
                        <p className="mt-1 text-slate-600">{item.subtitle}</p>
                        <p className="mt-2 text-slate-600">{item.address}</p>
                      </div>
                    </InfoWindowF>
                  ) : null
                )}

                {selectedDayRoutes.map((route, index) => {
                  const path = cleanPathPoints(routeOverlays[route.id] || route.pathPoints);
                  if (path.length < 2) return null;
                  const focused = selectedRouteId ? selectedRouteId === route.id : true;
                  return (
                    <PolylineF
                      key={route.id}
                      path={path}
                      options={{
                        strokeColor: route.color || COLOR_PALETTE[index % COLOR_PALETTE.length],
                        strokeOpacity: focused ? 1 : 0.25,
                        strokeWeight: focused ? 5 : 3,
                        zIndex: focused ? 50 : 10,
                      }}
                      onClick={() => setSelectedRouteId(route.id)}
                    />
                  );
                })}
              </GoogleMap>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Cargando Google Maps…</div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-slate-950">Rutas {selectedDay === "all" ? "del viaje" : `del ${selectedDay}`}</h3>
              <p className="mt-1 text-sm text-slate-600">
                Debajo del mapa tienes todas las rutas del filtro activo. Puedes ver, editar, borrar y reordenar las del día.
              </p>
            </div>
            {selectedDay !== "all" ? (
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                Drag & drop activado
              </div>
            ) : null}
          </div>

          <div className="mt-4 space-y-4">
            {selectedDayRoutes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">No hay rutas para este filtro.</div>
            ) : (
              selectedDayRoutes.map((route) => {
                const selected = selectedRouteId === route.id;
                const dragEnabled = selectedDay !== "all" && route.editable;
                return (
                  <div
                    key={route.id}
                    draggable={dragEnabled}
                    onDragStart={() => setDraggingRouteId(route.id)}
                    onDragOver={(event) => {
                      if (dragEnabled) event.preventDefault();
                    }}
                    onDrop={() => void handleDropRoute(route.id)}
                    className={`rounded-2xl border p-4 transition ${selected ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="h-4 w-4 rounded-full" style={{ backgroundColor: route.color }} />
                          <h4 className="text-base font-semibold text-slate-950">{route.routeName}</h4>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          {route.routeDate || "Sin día"}
                          {route.departureTime ? ` · ${route.departureTime}` : ""}
                          {route.distanceText ? ` · ${route.distanceText}` : ""}
                          {route.durationText ? ` · ${route.durationText}` : ""}
                        </p>
                        <p className="mt-2 text-sm text-slate-600">{route.origin.name} → {route.destination.name}</p>
                        {route.waypoints.length ? (
                          <p className="mt-1 text-sm text-slate-500">Paradas: {route.waypoints.map((item) => item.name).join(" · ")}</p>
                        ) : null}
                        {!route.editable ? (
                          <p className="mt-2 text-xs font-semibold text-amber-700">Ruta heredada de la tabla antigua routes. Se muestra en mapa para no perderla.</p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedRouteId(selected ? null : route.id)}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                        >
                          {selected ? "Ocultar detalle" : "Ver detalle"}
                        </button>
                        {route.editable ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRouteId(route.id);
                              setSelectedRouteId(route.id);
                            }}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                          >
                            Editar
                          </button>
                        ) : null}
                        {route.editable ? (
                          <button
                            type="button"
                            onClick={() => void deleteRoute(route.id)}
                            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
                          >
                            Eliminar
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
