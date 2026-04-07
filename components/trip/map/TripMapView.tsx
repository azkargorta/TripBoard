"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DirectionsRenderer, GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import PlaceAutocompleteInput from "@/components/PlaceAutocompleteInput";
import { useTripRoutes } from "@/hooks/useTripRoutes";
import { supabase } from "@/lib/supabase";

const GOOGLE_LIBRARIES: ("places")[] = ["places"];
const DEFAULT_CENTER = { lat: 48.8566, lng: 2.3522 };

type UnknownRow = Record<string, unknown>;
type RouteMode = "DRIVING" | "WALKING" | "BICYCLING" | "TRANSIT";

type AutocompletePayload = {
  address: string;
  latitude: number | null;
  longitude: number | null;
};

export type TripMapRoute = {
  id: string;
  source?: "trip_routes" | "legacy_routes";
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
};

type Props = {
  tripId: string;
  trip?: {
    id: string;
    name?: string | null;
    destination?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  };
  tripDates?: string[];
  planSources?: {
    tripActivities?: unknown[];
    legacyActivities?: unknown[];
  } | null;
  routeSources?: {
    tripRoutes?: unknown[];
    legacyRoutes?: unknown[];
  } | null;
};

type PlaceOption = {
  id: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  activityDate?: string | null;
};

type FormPlaceState = {
  mode: "plan" | "search";
  planId: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
};

type RoutePreview = {
  directions: google.maps.DirectionsResult;
  distanceText: string | null;
  durationText: string | null;
  arrivalTime: string | null;
  overviewPath: { lat: number; lng: number }[];
};

type DriveAltKey = "with_tolls" | "without_tolls";

type DriveAlternatives = {
  with_tolls: RoutePreview | null;
  without_tolls: RoutePreview | null;
  selected: DriveAltKey;
};

type GasStationMarker = {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  brand: string | null;
};

type RouteFormState = {
  editingRouteId: string | null;
  routeDate: string;
  routeName: string;
  departureTime: string;
  travelMode: RouteMode;
  color: string;
  originName: string;
  destinationName: string;
  stopEnabled: boolean;
  stopName: string;
  restStopsEnabled: boolean;
  restStopsCount: number;
  restStopMinutes: number;
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeTravelMode(value: string | null | undefined): RouteMode {
  const clean = (value || "").toUpperCase();
  if (clean === "WALKING") return "WALKING";
  if (clean === "BICYCLING") return "BICYCLING";
  if (clean === "TRANSIT") return "TRANSIT";
  return "DRIVING";
}

function emptyPlaceState(): FormPlaceState {
  return { mode: "plan", planId: "", address: "", latitude: null, longitude: null };
}

function buildPlanPlaces(rows: unknown[] | undefined, prefix: string): PlaceOption[] {
  return (rows ?? [])
    .map((row, index) => {
      const item = row as UnknownRow;
      const latitude = asNumber(item.latitude) ?? asNumber(item.place_latitude) ?? asNumber(item.location_latitude);
      const longitude = asNumber(item.longitude) ?? asNumber(item.place_longitude) ?? asNumber(item.location_longitude);
      if (latitude == null || longitude == null) return null;

      const label =
        asString(item.title) ??
        asString(item.name) ??
        asString(item.place_name) ??
        asString(item.location_name) ??
        `Lugar ${index + 1}`;

      const address = asString(item.address) ?? asString(item.place_name) ?? asString(item.location_name) ?? label;

      return {
        id: `${prefix}-${String(item.id ?? index)}`,
        label,
        address,
        latitude,
        longitude,
        activityDate: asString(item.activity_date) ?? asString(item.day_date) ?? asString(item.date) ?? null,
      };
    })
    .filter(Boolean) as PlaceOption[];
}

function buildInitialRoutes(
  rows: unknown[] | undefined,
  source: TripMapRoute["source"],
  prefix: string
): TripMapRoute[] {
  return (rows ?? [])
    .map((row, index) => {
      const item = row as UnknownRow;
      const originLat = asNumber(item.origin_latitude) ?? asNumber(item.start_latitude) ?? asNumber(item.from_latitude);
      const originLng = asNumber(item.origin_longitude) ?? asNumber(item.start_longitude) ?? asNumber(item.from_longitude);
      const destinationLat =
        asNumber(item.destination_latitude) ?? asNumber(item.end_latitude) ?? asNumber(item.to_latitude);
      const destinationLng =
        asNumber(item.destination_longitude) ?? asNumber(item.end_longitude) ?? asNumber(item.to_longitude);
      if (originLat == null || originLng == null || destinationLat == null || destinationLng == null) return null;

      return {
        id: String(item.id ?? `${prefix}-${index}`),
        source,
        route_day: asString(item.route_day) ?? asString(item.route_date) ?? asString(item.day_date) ?? null,
        route_date: asString(item.route_date) ?? asString(item.route_day) ?? asString(item.day_date) ?? null,
        departure_time: asString(item.departure_time) ?? asString(item.start_time) ?? null,
        title: asString(item.title) ?? asString(item.route_name) ?? asString(item.name) ?? "Ruta",
        route_name: asString(item.route_name) ?? asString(item.title) ?? asString(item.name) ?? "Ruta",
        travel_mode: asString(item.travel_mode) ?? asString(item.mode) ?? "DRIVING",
        color: asString(item.color) ?? "#4f46e5",
        origin_name: asString(item.origin_name) ?? asString(item.origin_address) ?? "Origen",
        origin_address: asString(item.origin_address) ?? asString(item.origin_name) ?? "Origen",
        origin_latitude: originLat,
        origin_longitude: originLng,
        stop_name: asString(item.stop_name) ?? null,
        stop_address: asString(item.stop_address) ?? null,
        stop_latitude: asNumber(item.stop_latitude),
        stop_longitude: asNumber(item.stop_longitude),
        destination_name: asString(item.destination_name) ?? asString(item.destination_address) ?? "Destino",
        destination_address: asString(item.destination_address) ?? asString(item.destination_name) ?? "Destino",
        destination_latitude: destinationLat,
        destination_longitude: destinationLng,
        distance_text: asString(item.distance_text) ?? null,
        duration_text: asString(item.duration_text) ?? null,
        arrival_time: asString(item.arrival_time) ?? null,
      };
    })
    .filter(Boolean) as TripMapRoute[];
}

function formatRouteMeta(route: TripMapRoute) {
  const date = route.route_day || route.route_date || "";
  const time = route.departure_time || "";
  const mode = normalizeTravelMode(route.travel_mode);
  const base = [date, time].filter(Boolean).join(" · ");
  const extra = [
    route.distance_text ? `📏 ${route.distance_text}` : null,
    route.duration_text ? `⏱️ ${route.duration_text}` : null,
    route.arrival_time ? `Llegada ${route.arrival_time}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    base,
    extra,
    modeLabel: mode === "DRIVING" ? "Coche" : mode === "WALKING" ? "Andando" : mode === "BICYCLING" ? "Bici" : "Transporte público",
  };
}

function buildGoogleMapsDirectionsUrl(route: TripMapRoute) {
  const origin =
    typeof route.origin_latitude === "number" && typeof route.origin_longitude === "number"
      ? `${route.origin_latitude},${route.origin_longitude}`
      : route.origin_address || route.origin_name || "";
  const destination =
    typeof route.destination_latitude === "number" && typeof route.destination_longitude === "number"
      ? `${route.destination_latitude},${route.destination_longitude}`
      : route.destination_address || route.destination_name || "";

  const waypoints: string[] = [];
  if (typeof route.stop_latitude === "number" && typeof route.stop_longitude === "number") {
    waypoints.push(`${route.stop_latitude},${route.stop_longitude}`);
  } else if (route.stop_address) {
    waypoints.push(route.stop_address);
  }

  const travelMode = normalizeTravelMode(route.travel_mode).toLowerCase();
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: travelMode,
  });
  if (waypoints.length) params.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function secondsToHuman(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function metersToHuman(meters: number | null) {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

function addSecondsToTime(timeHHMM: string, seconds: number) {
  const [hStr, mStr] = timeHHMM.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const base = h * 3600 + m * 60;
  const next = base + seconds;
  const nextH = Math.floor(next / 3600) % 24;
  const nextM = Math.floor((next % 3600) / 60);
  return `${String(nextH).padStart(2, "0")}:${String(nextM).padStart(2, "0")}`;
}

function defaultFormState(tripDates: string[], selectedDate: string): RouteFormState {
  const firstDate = tripDates[0] || "";
  const date = selectedDate !== "all" ? selectedDate : firstDate;
  return {
    editingRouteId: null,
    routeDate: date,
    routeName: "",
    departureTime: "",
    travelMode: "DRIVING",
    color: "#4f46e5",
    originName: "Origen",
    destinationName: "Destino",
    stopEnabled: false,
    stopName: "Parada",
    restStopsEnabled: false,
    restStopsCount: 1,
    restStopMinutes: 15,
  };
}

function buildRouteNotes(form: RouteFormState) {
  const rest =
    form.travelMode === "DRIVING" && form.restStopsEnabled
      ? {
          enabled: true,
          count: Math.max(0, Math.floor(form.restStopsCount || 0)),
          minutesEach: Math.max(0, Math.floor(form.restStopMinutes || 0)),
        }
      : { enabled: false, count: 0, minutesEach: 0 };

  return JSON.stringify({
    restStops: rest,
  });
}

function parseRouteNotes(notes: unknown) {
  if (typeof notes !== "string" || !notes.trim()) return null;
  try {
    return JSON.parse(notes) as any;
  } catch {
    return null;
  }
}

function normalizeBrand(input: string | null | undefined) {
  const value = (input || "").toLowerCase();
  if (!value) return null;
  if (value.includes("repsol")) return "Repsol";
  if (value.includes("cepsa")) return "Cepsa";
  if (value.includes("shell")) return "Shell";
  if (value.includes("bp")) return "BP";
  if (value.includes("total")) return "Total";
  if (value.includes("galp")) return "Galp";
  if (value.includes("av")) return "AVIA";
  return null;
}

function brandBadge(brand: string | null) {
  if (!brand) return { text: "⛽", bg: "#0f172a", fg: "#ffffff" };
  if (brand === "Repsol") return { text: "R", bg: "#f97316", fg: "#ffffff" };
  if (brand === "Cepsa") return { text: "C", bg: "#ef4444", fg: "#ffffff" };
  if (brand === "Shell") return { text: "S", bg: "#facc15", fg: "#111827" };
  if (brand === "BP") return { text: "BP", bg: "#16a34a", fg: "#ffffff" };
  if (brand === "Total") return { text: "T", bg: "#2563eb", fg: "#ffffff" };
  if (brand === "Galp") return { text: "G", bg: "#111827", fg: "#ffffff" };
  if (brand === "AVIA") return { text: "A", bg: "#0ea5e9", fg: "#ffffff" };
  return { text: "⛽", bg: "#0f172a", fg: "#ffffff" };
}

function buildBrandSvgIcon(brand: string | null) {
  const badge = brandBadge(brand);
  const text = badge.text;
  const size = 44;
  const r = 18;
  const fontSize = text.length >= 2 ? 13 : 16;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${badge.bg}" stroke="#ffffff" stroke-width="3"/>
  <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle"
    font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto"
    font-size="${fontSize}" font-weight="800" fill="${badge.fg}">${text}</text>
</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(36, 36),
    anchor: new window.google.maps.Point(18, 18),
  };
}

export default function TripMapView({ tripId, tripDates = [], planSources, routeSources }: Props) {
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey,
    libraries: GOOGLE_LIBRARIES,
  });

  const mapRef = useRef<google.maps.Map | null>(null);

  const planPlaces = useMemo(() => {
    const all = [
      ...buildPlanPlaces(planSources?.tripActivities, "trip-activity"),
      ...buildPlanPlaces(planSources?.legacyActivities, "legacy-activity"),
    ];
    const byId = new Map<string, PlaceOption>();
    all.forEach((place) => byId.set(place.id, place));
    return Array.from(byId.values());
  }, [planSources]);

  const initialRoutes = useMemo(() => {
    const all = [
      ...buildInitialRoutes(routeSources?.tripRoutes, "trip_routes", "trip-route"),
      ...buildInitialRoutes(routeSources?.legacyRoutes, "legacy_routes", "legacy-route"),
    ];
    const byKey = new Map<string, TripMapRoute>();
    all.forEach((route) => byKey.set(`${route.source || "trip_routes"}:${route.id}`, route));
    return Array.from(byKey.values());
  }, [routeSources]);

  const [routesState, setRoutesState] = useState<TripMapRoute[]>(initialRoutes);
  const [selectedDate, setSelectedDate] = useState<string>("all");
  const [directionsMap, setDirectionsMap] = useState<Record<string, google.maps.DirectionsResult | null>>({});
  const [routeError, setRouteError] = useState<string | null>(null);
  const [activeRouteKey, setActiveRouteKey] = useState<string | null>(null);
  const [focusedRouteKey, setFocusedRouteKey] = useState<string | null>(null);
  const [form, setForm] = useState<RouteFormState>(() => defaultFormState(tripDates, "all"));
  const [origin, setOrigin] = useState<FormPlaceState>(emptyPlaceState());
  const [stop, setStop] = useState<FormPlaceState>(emptyPlaceState());
  const [destination, setDestination] = useState<FormPlaceState>(emptyPlaceState());
  const [preview, setPreview] = useState<RoutePreview | null>(null);
  const [driveAlternatives, setDriveAlternatives] = useState<DriveAlternatives | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [gasStations, setGasStations] = useState<GasStationMarker[]>([]);
  const [gasStationsLoading, setGasStationsLoading] = useState(false);
  const [gasStationsError, setGasStationsError] = useState<string | null>(null);

  useEffect(() => {
    setRoutesState(initialRoutes);
  }, [initialRoutes]);

  useEffect(() => {
    // limpiar gasolineras al cambiar focus o filtro
    setGasStations([]);
    setGasStationsError(null);
  }, [focusedRouteKey, selectedDate]);

  useEffect(() => {
    setForm((prev) => {
      if (prev.editingRouteId) return prev;
      const next = defaultFormState(tripDates, selectedDate);
      return { ...next, routeDate: next.routeDate || prev.routeDate || "" };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripDates, selectedDate]);

  const reloadRoutes = useCallback(async () => {
    if (!tripId) return;
    setLoadingRoutes(true);
    setRouteError(null);
    try {
      const { data, error } = await supabase
        .from("trip_routes")
        .select("*")
        .eq("trip_id", tripId)
        .order("route_day", { ascending: true })
        .order("departure_time", { ascending: true });
      if (error) throw new Error(error.message);

      const nextTripRoutes = buildInitialRoutes(data as unknown[], "trip_routes", "trip-route");
      setRoutesState((prev) => {
        const legacy = prev.filter((r) => r.source === "legacy_routes");
        const byKey = new Map<string, TripMapRoute>();
        legacy.forEach((r) => byKey.set(`legacy_routes:${r.id}`, r));
        nextTripRoutes.forEach((r) => byKey.set(`trip_routes:${r.id}`, r));
        return Array.from(byKey.values());
      });
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : "No se pudieron recargar las rutas.");
    } finally {
      setLoadingRoutes(false);
    }
  }, [tripId]);

  const { routeError: hookRouteError, saveRoute, deleteRoute, savingRoute } = useTripRoutes(tripId, reloadRoutes);

  useEffect(() => {
    if (hookRouteError) setRouteError(hookRouteError);
  }, [hookRouteError]);

  const visibleRoutes = useMemo(() => {
    const base =
      selectedDate === "all"
      ? routesState
      : routesState.filter((route) => (route.route_day || route.route_date) === selectedDate);
    if (!focusedRouteKey) return base;
    return base.filter((route) => `${route.source || "trip_routes"}:${route.id}` === focusedRouteKey);
  }, [routesState, selectedDate, focusedRouteKey]);

  const visiblePoints = useMemo(() => {
    return planPlaces
      .filter((place) => selectedDate === "all" || place.activityDate === selectedDate)
      .map((place) => ({
        id: place.id,
        latitude: place.latitude,
        longitude: place.longitude,
        title: place.label,
      }));
  }, [planPlaces, selectedDate]);

  useEffect(() => {
    if (!isLoaded || typeof window === "undefined" || !window.google?.maps) return;

    const gmMaps = window.google.maps;
    const service = new gmMaps.DirectionsService();
    let cancelled = false;

    async function loadDirections() {
      const next: Record<string, google.maps.DirectionsResult | null> = {};

      for (const route of visibleRoutes) {
        const routeKey = `${route.source || "trip_routes"}:${route.id}`;
        if (
          typeof route.origin_latitude !== "number" ||
          typeof route.origin_longitude !== "number" ||
          typeof route.destination_latitude !== "number" ||
          typeof route.destination_longitude !== "number"
        ) {
          continue;
        }

        try {
          const result = await service.route({
            origin: { lat: route.origin_latitude, lng: route.origin_longitude },
            destination: { lat: route.destination_latitude, lng: route.destination_longitude },
            travelMode: gmMaps.TravelMode[normalizeTravelMode(route.travel_mode)],
            provideRouteAlternatives: false,
          });
          next[routeKey] = result;
        } catch {
          next[routeKey] = null;
        }
      }

      if (!cancelled) {
        setDirectionsMap(next);
      }
    }

    void loadDirections();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, visibleRoutes]);

  const focusedDirections = useMemo(() => {
    if (!focusedRouteKey) return null;
    return directionsMap[focusedRouteKey] || null;
  }, [directionsMap, focusedRouteKey]);

  useEffect(() => {
    if (!isLoaded || typeof window === "undefined" || !window.google?.maps?.places) return;
    if (!focusedRouteKey) return;

    const directions = focusedDirections;
    const overview = directions?.routes?.[0]?.overview_path;
    if (!overview || overview.length < 2) return;

    let cancelled = false;
    setGasStationsLoading(true);
    setGasStationsError(null);

    const service = new window.google.maps.places.PlacesService(document.createElement("div"));

    const sampled: google.maps.LatLng[] = [];
    // muestrear cada ~25 puntos (limitamos llamadas)
    for (let i = 0; i < overview.length; i += 25) {
      sampled.push(overview[i]);
    }
    // siempre incluir final
    sampled.push(overview[overview.length - 1]);

    const maxRequests = 8;
    const points = sampled.slice(0, maxRequests);
    const found = new Map<string, GasStationMarker>();

    function nearbySearchAt(point: google.maps.LatLng) {
      return new Promise<void>((resolve) => {
        service.nearbySearch(
          {
            location: point,
            radius: 2500,
            type: "gas_station",
          },
          (results, status) => {
            if (cancelled) return resolve();
            if (status !== window.google.maps.places.PlacesServiceStatus.OK || !results) return resolve();

            results.forEach((r) => {
              const placeId = r.place_id;
              const loc = r.geometry?.location;
              if (!placeId || !loc) return;

              const name = r.name || "Gasolinera";
              const brand = normalizeBrand(name);
              found.set(placeId, {
                placeId,
                name,
                lat: loc.lat(),
                lng: loc.lng(),
                brand,
              });
            });

            resolve();
          }
        );
      });
    }

    (async () => {
      try {
        for (const point of points) {
          if (cancelled) return;
          // eslint-disable-next-line no-await-in-loop
          await nearbySearchAt(point);
        }

        if (cancelled) return;
        const list = Array.from(found.values()).slice(0, 30);
        setGasStations(list);
      } catch (error) {
        if (!cancelled) {
          setGasStationsError(error instanceof Error ? error.message : "No se pudieron cargar gasolineras.");
        }
      } finally {
        if (!cancelled) setGasStationsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [focusedDirections, focusedRouteKey, isLoaded]);

  const handleAutocompleteSelect = async (
    setState: React.Dispatch<React.SetStateAction<FormPlaceState>>,
    payload: AutocompletePayload
  ) => {
    let latitude = payload.latitude;
    let longitude = payload.longitude;

    if ((latitude == null || longitude == null) && typeof window !== "undefined" && window.google?.maps && payload.address) {
      try {
        const geocoder = new window.google.maps.Geocoder();
        const result = await geocoder.geocode({ address: payload.address });
        const location = result.results?.[0]?.geometry?.location;
        if (location) {
          latitude = location.lat();
          longitude = location.lng();
        }
      } catch (error) {
        console.error("No se pudieron obtener coordenadas del autocompletar", error);
      }
    }

    setState({
      mode: "search",
      planId: "",
      address: payload.address,
      latitude,
      longitude,
    });
  };

  const applyPlanPlace = useCallback(
    (setState: React.Dispatch<React.SetStateAction<FormPlaceState>>, placeId: string) => {
      const place = planPlaces.find((p) => p.id === placeId);
      if (!place) return;
      setState({
        mode: "plan",
        planId: place.id,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
      });
    },
    [planPlaces]
  );

  const resetForm = useCallback(() => {
    setActiveRouteKey(null);
    setFocusedRouteKey(null);
    setPreview(null);
    setDriveAlternatives(null);
    setPreviewError(null);
    setOrigin(emptyPlaceState());
    setStop(emptyPlaceState());
    setDestination(emptyPlaceState());
    setForm(defaultFormState(tripDates, selectedDate));
  }, [selectedDate, tripDates]);

  const beginEditRoute = useCallback(
    (route: TripMapRoute) => {
      const key = `${route.source || "trip_routes"}:${route.id}`;
      setActiveRouteKey(key);
      setFocusedRouteKey(key);
      setPreview(null);
      setDriveAlternatives(null);
      setPreviewError(null);

      const notes = parseRouteNotes((route as any).notes);
      const restStops = notes?.restStops;

      setForm({
        editingRouteId: route.source === "trip_routes" ? route.id : null,
        routeDate: route.route_day || route.route_date || (selectedDate !== "all" ? selectedDate : tripDates[0] || ""),
        routeName: route.route_name || route.title || "Ruta",
        departureTime: route.departure_time || "",
        travelMode: normalizeTravelMode(route.travel_mode),
        color: route.color || "#4f46e5",
        originName: route.origin_name || "Origen",
        destinationName: route.destination_name || "Destino",
        stopEnabled: !!(route.stop_latitude && route.stop_longitude) || !!route.stop_address,
        stopName: route.stop_name || "Parada",
        restStopsEnabled: !!restStops?.enabled,
        restStopsCount: typeof restStops?.count === "number" ? restStops.count : 1,
        restStopMinutes: typeof restStops?.minutesEach === "number" ? restStops.minutesEach : 15,
      });

      setOrigin({
        mode: "search",
        planId: "",
        address: route.origin_address || route.origin_name || "",
        latitude: route.origin_latitude ?? null,
        longitude: route.origin_longitude ?? null,
      });

      setStop({
        mode: "search",
        planId: "",
        address: route.stop_address || route.stop_name || "",
        latitude: route.stop_latitude ?? null,
        longitude: route.stop_longitude ?? null,
      });

      setDestination({
        mode: "search",
        planId: "",
        address: route.destination_address || route.destination_name || "",
        latitude: route.destination_latitude ?? null,
        longitude: route.destination_longitude ?? null,
      });
    },
    [selectedDate, tripDates]
  );

  const calculatePreview = useCallback(async () => {
    if (!isLoaded || typeof window === "undefined" || !window.google?.maps) {
      setPreviewError("Google Maps aún no está listo.");
      return;
    }

    setPreviewError(null);
    setCalculating(true);

    try {
      const gmMaps = window.google.maps;
      const service = new gmMaps.DirectionsService();

      if (typeof origin.latitude !== "number" || typeof origin.longitude !== "number") {
        throw new Error("El origen debe tener coordenadas válidas.");
      }
      if (typeof destination.latitude !== "number" || typeof destination.longitude !== "number") {
        throw new Error("El destino debe tener coordenadas válidas.");
      }

      const hasStop = form.stopEnabled && typeof stop.latitude === "number" && typeof stop.longitude === "number";

      const baseRequest: google.maps.DirectionsRequest = {
        origin: { lat: origin.latitude, lng: origin.longitude },
        destination: { lat: destination.latitude, lng: destination.longitude },
        travelMode: gmMaps.TravelMode[form.travelMode],
        waypoints: hasStop ? [{ location: { lat: stop.latitude!, lng: stop.longitude! }, stopover: true }] : [],
        provideRouteAlternatives: false,
      };

      const restSeconds =
        form.travelMode === "DRIVING" && form.restStopsEnabled
          ? Math.max(0, Math.floor(form.restStopsCount)) * Math.max(0, Math.floor(form.restStopMinutes)) * 60
          : 0;

      const buildPreview = (result: google.maps.DirectionsResult): RoutePreview => {
        const firstRoute = result.routes?.[0];
        const legs = firstRoute?.legs || [];
        const totalMeters = legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0);
        const totalSeconds = legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0);
        const distanceText = metersToHuman(totalMeters);
        const durationText = secondsToHuman(totalSeconds);
        const arrivalTime = form.departureTime ? addSecondsToTime(form.departureTime, totalSeconds + restSeconds) : null;
        const overviewPath = (firstRoute?.overview_path || []).map((p) => ({ lat: p.lat(), lng: p.lng() }));
        return { directions: result, distanceText, durationText, arrivalTime, overviewPath };
      };

      if (form.travelMode === "DRIVING") {
        const [withTolls, withoutTolls] = await Promise.all([
          service.route({ ...baseRequest, avoidTolls: false }),
          service.route({ ...baseRequest, avoidTolls: true }),
        ]);

        const withPreview = buildPreview(withTolls);
        const withoutPreview = buildPreview(withoutTolls);

        setDriveAlternatives({
          with_tolls: withPreview,
          without_tolls: withoutPreview,
          selected: "with_tolls",
        });
        setPreview(withPreview);
      } else {
        const result = await service.route(baseRequest);
        const one = buildPreview(result);
        setDriveAlternatives(null);
        setPreview(one);
      }
    } catch (error) {
      setPreview(null);
      setDriveAlternatives(null);
      setPreviewError(error instanceof Error ? error.message : "No se pudo calcular la ruta.");
    } finally {
      setCalculating(false);
    }
  }, [destination.latitude, destination.longitude, form.departureTime, form.stopEnabled, form.travelMode, form.restStopsEnabled, form.restStopsCount, form.restStopMinutes, isLoaded, origin.latitude, origin.longitude, stop.latitude, stop.longitude]);

  const handleSave = useCallback(async () => {
    setRouteError(null);
    setPreviewError(null);

    const date = form.routeDate?.trim();
    if (!date) {
      setRouteError("Selecciona un día para la ruta.");
      return;
    }
    if (!form.routeName.trim()) {
      setRouteError("Escribe un nombre para la ruta.");
      return;
    }
    if (typeof origin.latitude !== "number" || typeof origin.longitude !== "number") {
      setRouteError("El origen debe tener coordenadas válidas.");
      return;
    }
    if (typeof destination.latitude !== "number" || typeof destination.longitude !== "number") {
      setRouteError("El destino debe tener coordenadas válidas.");
      return;
    }

    try {
      const effectivePreview =
        driveAlternatives && form.travelMode === "DRIVING"
          ? driveAlternatives[driveAlternatives.selected]
          : preview;

      const result = await saveRoute(
        {
          routeDate: date,
          routeName: form.routeName.trim(),
          departureTime: form.departureTime,
          mode: form.travelMode,
          color: form.color,
          notes: buildRouteNotes(form),
          originName: form.originName || origin.address || "Origen",
          originAddress: origin.address || form.originName || "Origen",
          originLatitude: origin.latitude,
          originLongitude: origin.longitude,
          stopName: form.stopEnabled ? form.stopName : undefined,
          stopAddress: form.stopEnabled ? stop.address : undefined,
          stopLatitude: form.stopEnabled ? stop.latitude : undefined,
          stopLongitude: form.stopEnabled ? stop.longitude : undefined,
          destinationName: form.destinationName || destination.address || "Destino",
          destinationAddress: destination.address || form.destinationName || "Destino",
          destinationLatitude: destination.latitude,
          destinationLongitude: destination.longitude,
          distanceText: effectivePreview?.distanceText ?? null,
          durationText: effectivePreview?.durationText ?? null,
          arrivalTime: effectivePreview?.arrivalTime ?? null,
          routePoints: effectivePreview?.overviewPath ?? [],
          pathPoints: effectivePreview?.overviewPath ?? [],
        },
        form.editingRouteId || undefined
      );

      if (result) {
        setSelectedDate(date);
        resetForm();
      }
    } catch {
      // `useTripRoutes` ya setea `routeError`
    }
  }, [destination.address, destination.latitude, destination.longitude, driveAlternatives, form, origin.address, origin.latitude, origin.longitude, preview, resetForm, saveRoute, stop.address, stop.latitude, stop.longitude]);

  const handleDelete = useCallback(
    async (route: TripMapRoute) => {
      if (route.source !== "trip_routes") {
        setRouteError("Esta ruta es legacy y no se puede eliminar desde aquí.");
        return;
      }
      try {
        await deleteRoute(route.id);
        if (form.editingRouteId === route.id) {
          resetForm();
        }
      } catch {
        // hook maneja error
      }
    },
    [deleteRoute, form.editingRouteId, resetForm]
  );

  const fitMapToData = useCallback(() => {
    if (typeof window === "undefined" || !window.google?.maps || !mapRef.current) return;

    const bounds = new window.google.maps.LatLngBounds();
    let hasData = false;

    visiblePoints.forEach((point) => {
      bounds.extend({ lat: point.latitude, lng: point.longitude });
      hasData = true;
    });

    visibleRoutes.forEach((route) => {
      const routeKey = `${route.source || "trip_routes"}:${route.id}`;
      const directions = directionsMap[routeKey];
      const overview = directions?.routes?.[0]?.overview_path;
      if (overview?.length) {
        overview.forEach((point) => {
          bounds.extend(point);
          hasData = true;
        });
      }
    });

    if (preview?.overviewPath?.length) {
      preview.overviewPath.forEach((point) => {
        bounds.extend(point);
        hasData = true;
      });
    }

    if (!hasData) {
      mapRef.current.setCenter(DEFAULT_CENTER);
      mapRef.current.setZoom(6);
      return;
    }

    mapRef.current.fitBounds(bounds, 80);
  }, [directionsMap, preview, visiblePoints, visibleRoutes]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fitMapToData();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [fitMapToData]);

  if (!googleMapsApiKey) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">Falta configurar <strong>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</strong> en Vercel.</div>;
  }

  if (loadError) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">No se pudo cargar Google Maps.</div>;
  }

  const dateOptions = useMemo(() => {
    const uniq = new Set<string>();
    tripDates.forEach((d) => uniq.add(d));
    visibleRoutes.forEach((r) => {
      const d = r.route_day || r.route_date;
      if (d) uniq.add(d);
    });
    return Array.from(uniq.values()).sort();
  }, [tripDates, visibleRoutes]);

  const planOptionsForForm = useMemo(() => {
    const date = form.routeDate;
    const rows = planPlaces.filter((p) => !date || !p.activityDate || p.activityDate === date);
    return rows.sort((a, b) => (a.label || "").localeCompare(b.label || ""));
  }, [form.routeDate, planPlaces]);

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Rutas</h2>
              <p className="mt-1 text-sm text-slate-600">Filtra por día, edita rutas guardadas o crea una nueva.</p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void reloadRoutes()}
                className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 disabled:opacity-50"
                disabled={loadingRoutes}
              >
                {loadingRoutes ? "Recargando..." : "Recargar"}
              </button>
              {focusedRouteKey ? (
                <button
                  type="button"
                  onClick={() => setFocusedRouteKey(null)}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-violet-200 bg-violet-50 px-3 text-sm font-semibold text-violet-900"
                >
                  Ver todas
                </button>
              ) : null}
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white"
              >
                Nueva ruta
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="grid grid-cols-[1fr_140px] gap-3">
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
              >
                <option value="all">Todos los días</option>
                {dateOptions.map((date) => (
                  <option key={date} value={date}>
                    {date}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={selectedDate === "all" ? "" : selectedDate}
                onChange={(e) => setSelectedDate(e.target.value ? e.target.value : "all")}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
              />
            </div>

            {visibleRoutes.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                No hay rutas guardadas para este filtro.
              </div>
            ) : (
              <div className="space-y-2">
                {visibleRoutes
                  .slice()
                  .sort((a, b) => {
                    const da = a.route_day || a.route_date || "";
                    const db = b.route_day || b.route_date || "";
                    if (da !== db) return da.localeCompare(db);
                    const ta = a.departure_time || "";
                    const tb = b.departure_time || "";
                    return ta.localeCompare(tb);
                  })
                  .map((route) => {
                    const key = `${route.source || "trip_routes"}:${route.id}`;
                    const meta = formatRouteMeta(route);
                    const isActive = activeRouteKey === key;
                    const isFocused = focusedRouteKey === key;
                    const canEdit = route.source === "trip_routes";

                    return (
                      <div
                        key={key}
                        className={`rounded-2xl border p-4 transition ${
                          isActive ? "border-violet-300 bg-violet-50" : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => beginEditRoute(route)}
                            className="text-left"
                            title={canEdit ? "Editar ruta" : "Ruta legacy (solo lectura)"}
                          >
                            <div className="text-sm font-extrabold text-slate-950">{route.route_name || route.title || "Ruta"}</div>
                            <div className="mt-1 text-xs font-semibold text-slate-600">
                              {meta.base ? meta.base : "Sin fecha"} {meta.base ? `· ${meta.modeLabel}` : meta.modeLabel}
                            </div>
                            {meta.extra ? <div className="mt-1 text-xs text-slate-500">{meta.extra}</div> : null}
                          </button>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setFocusedRouteKey((prev) => (prev === key ? null : key))}
                              className={`inline-flex min-h-[36px] items-center justify-center rounded-xl border px-3 text-xs font-bold ${
                                isFocused
                                  ? "border-violet-200 bg-violet-50 text-violet-900"
                                  : "border-slate-300 bg-white text-slate-900"
                              }`}
                            >
                              {isFocused ? "Mostrando" : "Mostrar"}
                            </button>
                            <a
                              href={buildGoogleMapsDirectionsUrl(route)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900"
                            >
                              Abrir
                            </a>
                            {canEdit ? (
                              <button
                                type="button"
                                onClick={() => void handleDelete(route)}
                                disabled={savingRoute}
                                className="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 disabled:opacity-50"
                              >
                                Eliminar
                              </button>
                            ) : (
                              <span className="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-600">
                                Legacy
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {focusedRouteKey ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-extrabold">Vista enfocada</div>
                  <button
                    type="button"
                    onClick={() => setFocusedRouteKey(null)}
                    className="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900"
                  >
                    Mostrar todas las rutas
                  </button>
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  {gasStationsLoading ? "Buscando gasolineras en la ruta…" : gasStations.length ? `${gasStations.length} gasolineras encontradas.` : "Sin gasolineras (o aún cargando)."}
                </div>
                {gasStationsError ? <div className="mt-2 text-xs text-red-700">{gasStationsError}</div> : null}
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">{form.editingRouteId ? "Editar ruta" : "Nueva ruta"}</h2>

          <div className="mt-4 grid gap-3">
            <div className="grid grid-cols-[1fr_140px] gap-3">
              <input
                type="date"
                value={form.routeDate}
                onChange={(e) => setForm((prev) => ({ ...prev, routeDate: e.target.value }))}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
              />
              <input
                type="time"
                value={form.departureTime}
                onChange={(e) => setForm((prev) => ({ ...prev, departureTime: e.target.value }))}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
              />
            </div>

            <input
              type="text"
              value={form.routeName}
              onChange={(e) => setForm((prev) => ({ ...prev, routeName: e.target.value }))}
              placeholder="Nombre de la ruta (ej. Hotel → Museo → Restaurante)"
              className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900"
            />

            <div className="grid grid-cols-[1fr_1fr] gap-3">
              <select
                value={form.travelMode}
                onChange={(e) => setForm((prev) => ({ ...prev, travelMode: e.target.value as RouteMode }))}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
              >
                <option value="DRIVING">Coche</option>
                <option value="WALKING">Andando</option>
                <option value="TRANSIT">Transporte público</option>
                <option value="BICYCLING">Bicicleta</option>
              </select>

              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3"
                title="Color de la ruta"
              />
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {form.travelMode === "DRIVING" ? (
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-extrabold text-slate-950">Paradas de descanso</h3>
                  <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.restStopsEnabled}
                      onChange={(e) => setForm((prev) => ({ ...prev, restStopsEnabled: e.target.checked }))}
                    />
                    Activar
                  </label>
                </div>

                {form.restStopsEnabled ? (
                  <div className="mt-3 grid grid-cols-[1fr_1fr] gap-3">
                    <label className="text-xs font-semibold text-slate-700">
                      Nº paradas
                      <input
                        type="number"
                        min={0}
                        value={form.restStopsCount}
                        onChange={(e) => setForm((prev) => ({ ...prev, restStopsCount: Number(e.target.value || 0) }))}
                        className="mt-2 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Minutos por parada
                      <input
                        type="number"
                        min={0}
                        value={form.restStopMinutes}
                        onChange={(e) => setForm((prev) => ({ ...prev, restStopMinutes: Number(e.target.value || 0) }))}
                        className="mt-2 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-slate-500">
                    Añade descansos para ajustar la hora de llegada (se suman al tiempo de ruta).
                  </div>
                )}
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-extrabold text-slate-950">Origen</h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOrigin((prev) => ({ ...prev, mode: "plan" }))}
                    className={`rounded-xl px-3 py-2 text-xs font-bold ${
                      origin.mode === "plan" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    Plan
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrigin((prev) => ({ ...prev, mode: "search" }))}
                    className={`rounded-xl px-3 py-2 text-xs font-bold ${
                      origin.mode === "search" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    Buscar
                  </button>
                </div>
              </div>

              {origin.mode === "plan" ? (
                <select
                  value={origin.planId}
                  onChange={(e) => applyPlanPlace(setOrigin, e.target.value)}
                  className="mt-3 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
                >
                  <option value="">Selecciona un lugar del Plan…</option>
                  {planOptionsForForm.map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.label} {place.activityDate ? `· ${place.activityDate}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-3">
                  <PlaceAutocompleteInput
                    value={origin.address}
                    onChange={(value) => setOrigin((prev) => ({ ...prev, address: value }))}
                    onPlaceSelect={(payload) => void handleAutocompleteSelect(setOrigin, payload)}
                    placeholder="Busca el origen"
                  />
                </div>
              )}

              <div className="mt-2 text-xs text-slate-500">Lat: {origin.latitude ?? "—"} · Lng: {origin.longitude ?? "—"}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-extrabold text-slate-950">Parada intermedia (opcional)</h3>
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.stopEnabled}
                    onChange={(e) => setForm((prev) => ({ ...prev, stopEnabled: e.target.checked }))}
                  />
                  Activar
                </label>
              </div>

              {form.stopEnabled ? (
                <>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStop((prev) => ({ ...prev, mode: "plan" }))}
                      className={`rounded-xl px-3 py-2 text-xs font-bold ${
                        stop.mode === "plan" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      Plan
                    </button>
                    <button
                      type="button"
                      onClick={() => setStop((prev) => ({ ...prev, mode: "search" }))}
                      className={`rounded-xl px-3 py-2 text-xs font-bold ${
                        stop.mode === "search" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      Buscar
                    </button>
                  </div>

                  {stop.mode === "plan" ? (
                    <select
                      value={stop.planId}
                      onChange={(e) => applyPlanPlace(setStop, e.target.value)}
                      className="mt-3 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
                    >
                      <option value="">Selecciona una parada del Plan…</option>
                      {planOptionsForForm.map((place) => (
                        <option key={place.id} value={place.id}>
                          {place.label} {place.activityDate ? `· ${place.activityDate}` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="mt-3">
                      <PlaceAutocompleteInput
                        value={stop.address}
                        onChange={(value) => setStop((prev) => ({ ...prev, address: value }))}
                        onPlaceSelect={(payload) => void handleAutocompleteSelect(setStop, payload)}
                        placeholder="Busca una parada"
                      />
                    </div>
                  )}

                  <div className="mt-2 text-xs text-slate-500">Lat: {stop.latitude ?? "—"} · Lng: {stop.longitude ?? "—"}</div>
                </>
              ) : (
                <div className="mt-3 text-xs text-slate-500">Activa la parada si quieres añadir un punto intermedio.</div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-extrabold text-slate-950">Destino</h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDestination((prev) => ({ ...prev, mode: "plan" }))}
                    className={`rounded-xl px-3 py-2 text-xs font-bold ${
                      destination.mode === "plan" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    Plan
                  </button>
                  <button
                    type="button"
                    onClick={() => setDestination((prev) => ({ ...prev, mode: "search" }))}
                    className={`rounded-xl px-3 py-2 text-xs font-bold ${
                      destination.mode === "search" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    Buscar
                  </button>
                </div>
              </div>

              {destination.mode === "plan" ? (
                <select
                  value={destination.planId}
                  onChange={(e) => applyPlanPlace(setDestination, e.target.value)}
                  className="mt-3 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
                >
                  <option value="">Selecciona un lugar del Plan…</option>
                  {planOptionsForForm.map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.label} {place.activityDate ? `· ${place.activityDate}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-3">
                  <PlaceAutocompleteInput
                    value={destination.address}
                    onChange={(value) => setDestination((prev) => ({ ...prev, address: value }))}
                    onPlaceSelect={(payload) => void handleAutocompleteSelect(setDestination, payload)}
                    placeholder="Busca el destino"
                  />
                </div>
              )}

              <div className="mt-2 text-xs text-slate-500">
                Lat: {destination.latitude ?? "—"} · Lng: {destination.longitude ?? "—"}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void calculatePreview()}
                disabled={calculating || savingRoute}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-violet-600 px-4 font-extrabold text-white disabled:opacity-60"
              >
                {calculating ? "Calculando..." : "Calcular ruta"}
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={savingRoute}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-slate-900 px-4 font-extrabold text-white disabled:opacity-60"
              >
                {savingRoute ? "Guardando..." : form.editingRouteId ? "Guardar cambios" : "Guardar ruta"}
              </button>
            </div>

            {preview ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="font-extrabold">Resultado del cálculo</div>
                <div className="mt-1 text-emerald-800">
                  {preview.distanceText ? <span>📏 {preview.distanceText}</span> : null}
                  {preview.distanceText && preview.durationText ? <span> · </span> : null}
                  {preview.durationText ? <span>⏱️ {preview.durationText}</span> : null}
                  {preview.arrivalTime ? <span> · Llegada {preview.arrivalTime}</span> : null}
                </div>
              </div>
            ) : null}

            {driveAlternatives && form.travelMode === "DRIVING" ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-900">
                <div className="font-extrabold">Opciones en coche</div>
                <p className="mt-1 text-xs text-slate-600">
                  Nota: Google Directions no devuelve el precio de peajes. Mostramos tiempos/distancias y guardas la opción elegida.
                </p>

                <div className="mt-3 grid gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDriveAlternatives((prev) => (prev ? { ...prev, selected: "with_tolls" } : prev));
                      const alt = driveAlternatives.with_tolls;
                      if (alt) setPreview(alt);
                    }}
                    className={`rounded-2xl border p-3 text-left transition ${
                      driveAlternatives.selected === "with_tolls"
                        ? "border-violet-300 bg-violet-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="text-xs font-extrabold text-slate-950">Con peajes</div>
                    <div className="mt-1 text-xs text-slate-700">
                      {driveAlternatives.with_tolls?.distanceText ?? "—"} · {driveAlternatives.with_tolls?.durationText ?? "—"}
                      {driveAlternatives.with_tolls?.arrivalTime ? ` · Llegada ${driveAlternatives.with_tolls.arrivalTime}` : ""}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">Coste peajes: —</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDriveAlternatives((prev) => (prev ? { ...prev, selected: "without_tolls" } : prev));
                      const alt = driveAlternatives.without_tolls;
                      if (alt) setPreview(alt);
                    }}
                    className={`rounded-2xl border p-3 text-left transition ${
                      driveAlternatives.selected === "without_tolls"
                        ? "border-violet-300 bg-violet-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="text-xs font-extrabold text-slate-950">Sin peajes</div>
                    <div className="mt-1 text-xs text-slate-700">
                      {driveAlternatives.without_tolls?.distanceText ?? "—"} · {driveAlternatives.without_tolls?.durationText ?? "—"}
                      {driveAlternatives.without_tolls?.arrivalTime ? ` · Llegada ${driveAlternatives.without_tolls.arrivalTime}` : ""}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">Coste peajes: —</div>
                  </button>
                </div>
              </div>
            ) : null}

            {previewError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{previewError}</div>
            ) : null}
          </div>
        </section>

        {routeError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{routeError}</div>
        ) : null}
      </div>

      <div className="space-y-4">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {!isLoaded ? (
            <div className="p-6 text-sm text-slate-600">Cargando mapa...</div>
          ) : (
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "720px" }}
              center={DEFAULT_CENTER}
              zoom={6}
              onLoad={(map) => {
                mapRef.current = map;
              }}
              options={{
                streetViewControl: false,
                mapTypeControl: false,
                fullscreenControl: true,
                gestureHandling: "greedy",
              }}
            >
              {visiblePoints.map((point) => (
                <MarkerF key={point.id} position={{ lat: point.latitude, lng: point.longitude }} title={point.title || undefined} />
              ))}

              {focusedRouteKey
                ? gasStations.map((station) => (
                    <MarkerF
                      key={station.placeId}
                      position={{ lat: station.lat, lng: station.lng }}
                      title={station.name}
                      options={{
                        icon: buildBrandSvgIcon(station.brand),
                      }}
                    />
                  ))
                : null}

              {visibleRoutes.map((route) => {
                const routeKey = `${route.source || "trip_routes"}:${route.id}`;
                const directions = directionsMap[routeKey];
                if (!directions) return null;

                return (
                  <DirectionsRenderer
                    key={routeKey}
                    directions={directions}
                    options={{
                      suppressMarkers: false,
                      polylineOptions: {
                        strokeColor: route.color || "#4f46e5",
                        strokeOpacity: 0.9,
                        strokeWeight: 5,
                      },
                    }}
                  />
                );
              })}

              {preview ? (
                <DirectionsRenderer
                  directions={preview.directions}
                  options={{
                    suppressMarkers: false,
                    polylineOptions: {
                      strokeColor: "#0ea5e9",
                      strokeOpacity: 0.95,
                      strokeWeight: 6,
                    },
                  }}
                />
              ) : null}
            </GoogleMap>
          )}
        </section>
      </div>
    </div>
  );
}
