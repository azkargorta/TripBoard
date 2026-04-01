"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DirectionsRenderer,
  GoogleMap,
  MarkerF,
  useJsApiLoader,
} from "@react-google-maps/api";
import PlaceAutocompleteInput from "@/components/PlaceAutocompleteInput";
import { useTripRoutes } from "@/hooks/useTripRoutes";

type UnknownRow = Record<string, unknown>;

export type TripMapRoute = {
  id: string;
  route_day?: string | null;
  route_date?: string | null;
  departure_time?: string | null;
  title?: string | null;
  route_name?: string | null;
  travel_mode?: string | null;
  notes?: string | null;
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

const DEFAULT_CENTER = { lat: 48.8566, lng: 2.3522 };

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeTravelMode(value: string | null | undefined) {
  const clean = (value || "").toUpperCase();
  if (clean === "WALKING") return "WALKING" as const;
  if (clean === "BICYCLING") return "BICYCLING" as const;
  if (clean === "TRANSIT") return "TRANSIT" as const;
  return "DRIVING" as const;
}

function buildPlanPlaces(rows: unknown[] | undefined, prefix: string): PlaceOption[] {
  return (rows ?? [])
    .map((row, index) => {
      const item = row as UnknownRow;
      const latitude =
        asNumber(item.latitude) ??
        asNumber(item.place_latitude) ??
        asNumber(item.location_latitude);
      const longitude =
        asNumber(item.longitude) ??
        asNumber(item.place_longitude) ??
        asNumber(item.location_longitude);

      if (latitude == null || longitude == null) return null;

      const label =
        asString(item.title) ??
        asString(item.name) ??
        asString(item.place_name) ??
        asString(item.location_name) ??
        `Lugar ${index + 1}`;

      const address =
        asString(item.address) ??
        asString(item.place_name) ??
        asString(item.location_name) ??
        label;

      return {
        id: `${prefix}-${String(item.id ?? index)}`,
        label,
        address,
        latitude,
        longitude,
        activityDate:
          asString(item.activity_date) ??
          asString(item.day_date) ??
          asString(item.date) ??
          null,
      };
    })
    .filter(Boolean) as PlaceOption[];
}

function buildInitialRoutes(rows: unknown[] | undefined, prefix: string): TripMapRoute[] {
  return (rows ?? [])
    .map((row, index) => {
      const item = row as UnknownRow;
      const originLat =
        asNumber(item.origin_latitude) ??
        asNumber(item.start_latitude) ??
        asNumber(item.from_latitude);
      const originLng =
        asNumber(item.origin_longitude) ??
        asNumber(item.start_longitude) ??
        asNumber(item.from_longitude);
      const destinationLat =
        asNumber(item.destination_latitude) ??
        asNumber(item.end_latitude) ??
        asNumber(item.to_latitude);
      const destinationLng =
        asNumber(item.destination_longitude) ??
        asNumber(item.end_longitude) ??
        asNumber(item.to_longitude);

      if (originLat == null || originLng == null || destinationLat == null || destinationLng == null) {
        return null;
      }

      return {
        id: String(item.id ?? `${prefix}-${index}`),
        route_day:
          asString(item.route_day) ??
          asString(item.route_date) ??
          asString(item.day_date) ??
          null,
        route_date:
          asString(item.route_date) ??
          asString(item.route_day) ??
          asString(item.day_date) ??
          null,
        departure_time:
          asString(item.departure_time) ??
          asString(item.start_time) ??
          null,
        title:
          asString(item.title) ??
          asString(item.route_name) ??
          asString(item.name) ??
          "Ruta",
        route_name:
          asString(item.route_name) ??
          asString(item.title) ??
          asString(item.name) ??
          "Ruta",
        travel_mode:
          asString(item.travel_mode) ??
          asString(item.mode) ??
          "DRIVING",
        notes: asString(item.notes) ?? null,
        color: asString(item.color) ?? "#4f46e5",
        origin_name: asString(item.origin_name) ?? asString(item.origin_address) ?? "Origen",
        origin_address: asString(item.origin_address) ?? asString(item.origin_name) ?? "Origen",
        origin_latitude: originLat,
        origin_longitude: originLng,
        stop_name: asString(item.stop_name) ?? null,
        stop_address: asString(item.stop_address) ?? null,
        stop_latitude: asNumber(item.stop_latitude),
        stop_longitude: asNumber(item.stop_longitude),
        destination_name:
          asString(item.destination_name) ?? asString(item.destination_address) ?? "Destino",
        destination_address:
          asString(item.destination_address) ?? asString(item.destination_name) ?? "Destino",
        destination_latitude: destinationLat,
        destination_longitude: destinationLng,
        distance_text: asString(item.distance_text) ?? null,
        duration_text: asString(item.duration_text) ?? null,
        arrival_time: asString(item.arrival_time) ?? null,
      };
    })
    .filter(Boolean) as TripMapRoute[];
}

function emptyPlaceState(): FormPlaceState {
  return {
    mode: "plan",
    planId: "",
    address: "",
    latitude: null,
    longitude: null,
  };
}

function formatDateLabel(date: string) {
  if (!date) return date;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
  }).format(parsed);
}

export default function TripMapView({
  tripId,
  tripDates = [],
  planSources,
  routeSources,
}: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries: ["places"],
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const fitSignatureRef = useRef<string>("");

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
      ...buildInitialRoutes(routeSources?.tripRoutes, "trip-route"),
      ...buildInitialRoutes(routeSources?.legacyRoutes, "legacy-route"),
    ];
    const byId = new Map<string, TripMapRoute>();
    all.forEach((route) => byId.set(route.id, route));
    return Array.from(byId.values()).sort((a, b) =>
      String(a.route_day || a.route_date || "").localeCompare(String(b.route_day || b.route_date || "")) ||
      String(a.departure_time || "").localeCompare(String(b.departure_time || ""))
    );
  }, [routeSources]);

  const [routesState, setRoutesState] = useState<TripMapRoute[]>(initialRoutes);
  const [selectedDate, setSelectedDate] = useState<string>("all");
  const [highlightedRouteId, setHighlightedRouteId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [routeDate, setRouteDate] = useState(tripDates[0] || "");
  const [departureTime, setDepartureTime] = useState("");
  const [routeName, setRouteName] = useState("");
  const [travelMode, setTravelMode] = useState("DRIVING");
  const [hasStop, setHasStop] = useState(false);
  const [origin, setOrigin] = useState<FormPlaceState>(emptyPlaceState());
  const [stop, setStop] = useState<FormPlaceState>(emptyPlaceState());
  const [destination, setDestination] = useState<FormPlaceState>(emptyPlaceState());
  const [preview, setPreview] = useState<RoutePreview | null>(null);
  const [calculating, setCalculating] = useState(false);

  const [directionsMap, setDirectionsMap] = useState<Record<string, google.maps.DirectionsResult | null>>({});

  const { saveRoute, deleteRoute, savingRoute, routeError: hookRouteError } = useTripRoutes(tripId);

  useEffect(() => {
    setRoutesState(initialRoutes);
  }, [initialRoutes]);

  useEffect(() => {
    if (hookRouteError) setRouteError(hookRouteError);
  }, [hookRouteError]);

  const dateOptions = useMemo(() => {
    const sourceDates = tripDates.length
      ? tripDates
      : routesState
          .map((route) => route.route_day || route.route_date || "")
          .filter(Boolean);

    const unique = Array.from(new Set(sourceDates));
    return ["all", ...unique];
  }, [routesState, tripDates]);

  const visibleRoutes = useMemo(() => {
    const filtered = selectedDate === "all"
      ? routesState
      : routesState.filter((route) => (route.route_day || route.route_date) === selectedDate);

    return highlightedRouteId ? filtered.filter((route) => route.id === highlightedRouteId) : filtered;
  }, [highlightedRouteId, routesState, selectedDate]);

  const visiblePoints = useMemo(() => {
    const points = planPlaces
      .filter((place) => selectedDate === "all" || place.activityDate === selectedDate)
      .map((place) => ({
        id: place.id,
        latitude: place.latitude,
        longitude: place.longitude,
        title: place.label,
      }));

    return highlightedRouteId ? [] : points;
  }, [highlightedRouteId, planPlaces, selectedDate]);

  const fitMapToData = useCallback(() => {
    const map = mapRef.current;
    if (!map || !isLoaded || typeof google === "undefined") return;

    const bounds = new google.maps.LatLngBounds();
    let hasData = false;

    visiblePoints.forEach((point) => {
      bounds.extend({ lat: point.latitude, lng: point.longitude });
      hasData = true;
    });

    visibleRoutes.forEach((route) => {
      const directions = directionsMap[route.id];
      if (directions?.routes?.[0]?.overview_path?.length) {
        directions.routes[0].overview_path.forEach((point) => {
          bounds.extend(point);
          hasData = true;
        });
      } else if (
        typeof route.origin_latitude === "number" &&
        typeof route.origin_longitude === "number" &&
        typeof route.destination_latitude === "number" &&
        typeof route.destination_longitude === "number"
      ) {
        bounds.extend({ lat: route.origin_latitude, lng: route.origin_longitude });
        bounds.extend({ lat: route.destination_latitude, lng: route.destination_longitude });
        hasData = true;
      }
    });

    if (!hasData) {
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(5);
      return;
    }

    map.fitBounds(bounds, 80);
  }, [directionsMap, isLoaded, visiblePoints, visibleRoutes]);

  useEffect(() => {
    if (!isLoaded || typeof google === "undefined") return;

    const routesForDirections = visibleRoutes.filter(
      (route) =>
        typeof route.origin_latitude === "number" &&
        typeof route.origin_longitude === "number" &&
        typeof route.destination_latitude === "number" &&
        typeof route.destination_longitude === "number"
    );

    if (!routesForDirections.length) {
      setDirectionsMap({});
      return;
    }

    let cancelled = false;
    const service = new google.maps.DirectionsService();

    async function loadDirections() {
      const entries = await Promise.all(
        routesForDirections.map(async (route) => {
          try {
            const waypoints =
              typeof route.stop_latitude === "number" && typeof route.stop_longitude === "number"
                ? [{ location: { lat: route.stop_latitude, lng: route.stop_longitude }, stopover: true }]
                : [];

            const result = await service.route({
              origin: { lat: route.origin_latitude!, lng: route.origin_longitude! },
              destination: { lat: route.destination_latitude!, lng: route.destination_longitude! },
              travelMode: google.maps.TravelMode[normalizeTravelMode(route.travel_mode)],
              waypoints,
              provideRouteAlternatives: false,
            });

            return [route.id, result] as const;
          } catch (error) {
            console.error("Error calculando ruta", route.id, error);
            return [route.id, null] as const;
          }
        })
      );

      if (cancelled) return;

      const next: Record<string, google.maps.DirectionsResult | null> = {};
      entries.forEach(([id, result]) => {
        next[id] = result;
      });
      setDirectionsMap(next);
    }

    void loadDirections();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, visibleRoutes]);

  useEffect(() => {
    if (!isLoaded) return;

    const signature = JSON.stringify({
      selectedDate,
      highlightedRouteId,
      routeIds: visibleRoutes.map((r) => r.id),
      pointIds: visiblePoints.map((p) => p.id),
      directionIds: Object.keys(directionsMap).sort(),
      preview: Boolean(preview),
    });

    if (fitSignatureRef.current === signature) return;
    fitSignatureRef.current = signature;

    const timer = window.setTimeout(() => {
      fitMapToData();
    }, 150);

    return () => window.clearTimeout(timer);
  }, [directionsMap, fitMapToData, highlightedRouteId, isLoaded, preview, selectedDate, visiblePoints, visibleRoutes]);

  const resetForm = useCallback(() => {
    setRouteDate(selectedDate !== "all" ? selectedDate : tripDates[0] || "");
    setDepartureTime("");
    setRouteName("");
    setTravelMode("DRIVING");
    setHasStop(false);
    setOrigin(emptyPlaceState());
    setStop(emptyPlaceState());
    setDestination(emptyPlaceState());
    setPreview(null);
    setEditingRouteId(null);
    setRouteError(null);
  }, [selectedDate, tripDates]);

  const applyPlaceSelection = (
    placeStateSetter: React.Dispatch<React.SetStateAction<FormPlaceState>>,
    placeId: string
  ) => {
    const selected = planPlaces.find((place) => place.id === placeId);
    if (!selected) return;
    placeStateSetter({
      mode: "plan",
      planId: placeId,
      address: selected.address,
      latitude: selected.latitude,
      longitude: selected.longitude,
    });
  };

  const buildGoogleMapsUrl = (route: TripMapRoute) => {
    const originAddress = route.origin_address || route.origin_name || "";
    const destinationAddress = route.destination_address || route.destination_name || "";
    const mode = normalizeTravelMode(route.travel_mode).toLowerCase();

    let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originAddress)}&destination=${encodeURIComponent(destinationAddress)}&travelmode=${encodeURIComponent(mode)}`;
    if (route.stop_address || route.stop_name) {
      url += `&waypoints=${encodeURIComponent(route.stop_address || route.stop_name || "")}`;
    }
    return url;
  };

  const calculateRoute = async () => {
    setRouteError(null);
    setPreview(null);

    if (!isLoaded || typeof google === "undefined") {
      setRouteError("Google Maps todavía no está listo.");
      return;
    }

    if (!routeDate) {
      setRouteError("Selecciona un día para la ruta.");
      return;
    }

    if (!routeName.trim()) {
      setRouteError("Ponle un nombre a la ruta.");
      return;
    }

    if (
      typeof origin.latitude !== "number" ||
      typeof origin.longitude !== "number" ||
      typeof destination.latitude !== "number" ||
      typeof destination.longitude !== "number"
    ) {
      setRouteError("Origen y destino deben tener coordenadas válidas.");
      return;
    }

    if (
      hasStop &&
      (typeof stop.latitude !== "number" || typeof stop.longitude !== "number")
    ) {
      setRouteError("La parada intermedia debe tener coordenadas válidas.");
      return;
    }

    try {
      setCalculating(true);
      const service = new google.maps.DirectionsService();

      const result = await service.route({
        origin: { lat: origin.latitude, lng: origin.longitude },
        destination: { lat: destination.latitude, lng: destination.longitude },
        waypoints:
          hasStop && typeof stop.latitude === "number" && typeof stop.longitude === "number"
            ? [{ location: { lat: stop.latitude, lng: stop.longitude }, stopover: true }]
            : [],
        travelMode: google.maps.TravelMode[normalizeTravelMode(travelMode)],
        provideRouteAlternatives: false,
      });

      const legs = result.routes[0]?.legs ?? [];
      const distanceText = legs.map((leg) => leg.distance?.text).filter(Boolean).join(" + ") || null;
      const durationText = legs.map((leg) => leg.duration?.text).filter(Boolean).join(" + ") || null;
      const arrivalTime = legs[legs.length - 1]?.arrival_time?.text || null;

      setPreview({
        directions: result,
        distanceText,
        durationText,
        arrivalTime,
        overviewPath:
          result.routes[0]?.overview_path?.map((point) => ({
            lat: point.lat(),
            lng: point.lng(),
          })) || [],
      });
    } catch (error) {
      console.error(error);
      setRouteError("No se pudo calcular la ruta con Google Directions.");
    } finally {
      setCalculating(false);
    }
  };

  const handleSave = async () => {
    if (!preview) {
      setRouteError("Primero calcula la ruta.");
      return;
    }

    try {
      setRouteError(null);

      const saved = await saveRoute(
        {
          routeDate,
          routeName,
          departureTime,
          mode: travelMode.toLowerCase(),
          originName: origin.address,
          originAddress: origin.address,
          originLatitude: origin.latitude,
          originLongitude: origin.longitude,
          stops:
            hasStop && typeof stop.latitude === "number" && typeof stop.longitude === "number"
              ? [
                  {
                    name: stop.address,
                    address: stop.address,
                    latitude: stop.latitude,
                    longitude: stop.longitude,
                  },
                ]
              : [],
          destinationName: destination.address,
          destinationAddress: destination.address,
          destinationLatitude: destination.latitude,
          destinationLongitude: destination.longitude,
          distanceText: preview.distanceText,
          durationText: preview.durationText,
          arrivalTime: preview.arrivalTime,
          routePoints: preview.overviewPath,
          pathPoints: preview.overviewPath,
        },
        editingRouteId || undefined
      );

      const nextRoute = (Array.isArray(saved) ? saved[0] : saved) as TripMapRoute;
      if (nextRoute?.id) {
        setRoutesState((current) => {
          const filtered = current.filter((route) => route.id !== nextRoute.id);
          return [...filtered, nextRoute].sort((a, b) =>
            String(a.route_day || a.route_date || "").localeCompare(String(b.route_day || b.route_date || "")) ||
            String(a.departure_time || "").localeCompare(String(b.departure_time || ""))
          );
        });
        setHighlightedRouteId(nextRoute.id);
      }

      setIsCreating(false);
      resetForm();
    } catch (error) {
      console.error(error);
      setRouteError(error instanceof Error ? error.message : "No se pudo guardar la ruta.");
    }
  };

  const startEdit = async (route: TripMapRoute) => {
    setIsCreating(true);
    setEditingRouteId(route.id);
    setRouteError(null);
    setRouteDate(route.route_day || route.route_date || "");
    setDepartureTime(route.departure_time || "");
    setRouteName(route.title || route.route_name || "Ruta");
    setTravelMode(normalizeTravelMode(route.travel_mode));
    setOrigin({
      mode: "search",
      planId: "",
      address: route.origin_address || route.origin_name || "",
      latitude: route.origin_latitude ?? null,
      longitude: route.origin_longitude ?? null,
    });
    setHasStop(Boolean(route.stop_latitude != null && route.stop_longitude != null));
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
    setPreview(null);
  };

  const handleDelete = async (routeId: string) => {
    const ok = window.confirm("¿Seguro que quieres eliminar esta ruta?");
    if (!ok) return;

    try {
      await deleteRoute(routeId);
      setRoutesState((current) => current.filter((route) => route.id !== routeId));
      if (highlightedRouteId === routeId) setHighlightedRouteId(null);
      if (editingRouteId === routeId) {
        setIsCreating(false);
        resetForm();
      }
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : "No se pudo eliminar la ruta.");
    }
  };

  if (!apiKey) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Falta configurar <strong>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</strong> en Vercel.
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        No se pudo cargar Google Maps. Revisa la API key, Maps JavaScript API, Places API y Directions API.
      </div>
    );
  }

  const planDateOptions =
    selectedDate === "all"
      ? planPlaces
      : planPlaces.filter((place) => !place.activityDate || place.activityDate === selectedDate);

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Seleccionar día</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {dateOptions.map((date) => (
              <button
                key={date}
                type="button"
                onClick={() => {
                  setSelectedDate(date);
                  setHighlightedRouteId(null);
                  if (!isCreating && date !== "all") setRouteDate(date);
                }}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  selectedDate === date
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-700"
                }`}
              >
                {date === "all" ? "Todos los días" : formatDateLabel(date)}
              </button>
            ))}
          </div>

          {selectedDate !== "all" ? (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setHighlightedRouteId(null);
              }}
              className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
            />
          ) : null}

          <button
            type="button"
            onClick={() => {
              if (!isCreating) resetForm();
              setIsCreating((prev) => !prev);
            }}
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
          >
            {isCreating ? "Cerrar formulario" : "Crear nueva ruta"}
          </button>
        </section>

        {isCreating ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-950">
                {editingRouteId ? "Editar ruta" : "Nueva ruta"}
              </h2>
              {editingRouteId ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    resetForm();
                  }}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  Cancelar edición
                </button>
              ) : null}
            </div>

            <div className="mt-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-800">Día</span>
                  <input
                    type="date"
                    value={routeDate}
                    onChange={(e) => setRouteDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-800">Hora de salida</span>
                  <input
                    type="time"
                    value={departureTime}
                    onChange={(e) => setDepartureTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                  />
                </label>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-800">Nombre de la ruta</span>
                <input
                  type="text"
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  placeholder="Ej. Hotel → Playa"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                />
              </label>

              {[
                { label: "Origen", state: origin, setState: setOrigin },
                { label: "Destino", state: destination, setState: setDestination },
              ].map((item) => (
                <div key={item.label} className="space-y-3 rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">{item.label}</h3>
                    <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
                      <button
                        type="button"
                        onClick={() => item.setState((prev) => ({ ...prev, mode: "plan" }))}
                        className={`rounded-lg px-3 py-1 ${item.state.mode === "plan" ? "bg-white shadow-sm" : "text-slate-500"}`}
                      >
                        Desde Plan
                      </button>
                      <button
                        type="button"
                        onClick={() => item.setState((prev) => ({ ...prev, mode: "search", planId: "" }))}
                        className={`rounded-lg px-3 py-1 ${item.state.mode === "search" ? "bg-white shadow-sm" : "text-slate-500"}`}
                      >
                        Buscar
                      </button>
                    </div>
                  </div>

                  {item.state.mode === "plan" ? (
                    <select
                      value={item.state.planId}
                      onChange={(e) => applyPlaceSelection(item.setState, e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                    >
                      <option value="">Selecciona un lugar del plan</option>
                      {planDateOptions.map((place) => (
                        <option key={place.id} value={place.id}>
                          {place.label}
                          {place.activityDate ? ` · ${place.activityDate}` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <PlaceAutocompleteInput
                      value={item.state.address}
                      onChange={(value) => item.setState((prev) => ({ ...prev, address: value }))}
                      onPlaceSelect={(payload) =>
                        item.setState((prev) => ({
                          ...prev,
                          address: payload.address,
                          latitude: payload.latitude,
                          longitude: payload.longitude,
                        }))
                      }
                    />
                  )}
                </div>
              ))}

              <div className="rounded-2xl border border-slate-200 p-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={hasStop}
                    onChange={(e) => setHasStop(e.target.checked)}
                  />
                  <span className="font-semibold text-slate-900">Añadir parada intermedia</span>
                </label>

                {hasStop ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs w-fit">
                      <button
                        type="button"
                        onClick={() => setStop((prev) => ({ ...prev, mode: "plan" }))}
                        className={`rounded-lg px-3 py-1 ${stop.mode === "plan" ? "bg-white shadow-sm" : "text-slate-500"}`}
                      >
                        Desde Plan
                      </button>
                      <button
                        type="button"
                        onClick={() => setStop((prev) => ({ ...prev, mode: "search", planId: "" }))}
                        className={`rounded-lg px-3 py-1 ${stop.mode === "search" ? "bg-white shadow-sm" : "text-slate-500"}`}
                      >
                        Buscar
                      </button>
                    </div>

                    {stop.mode === "plan" ? (
                      <select
                        value={stop.planId}
                        onChange={(e) => applyPlaceSelection(setStop, e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                      >
                        <option value="">Selecciona una parada</option>
                        {planDateOptions.map((place) => (
                          <option key={place.id} value={place.id}>
                            {place.label}
                            {place.activityDate ? ` · ${place.activityDate}` : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <PlaceAutocompleteInput
                        value={stop.address}
                        onChange={(value) => setStop((prev) => ({ ...prev, address: value }))}
                        onPlaceSelect={(payload) =>
                          setStop((prev) => ({
                            ...prev,
                            address: payload.address,
                            latitude: payload.latitude,
                            longitude: payload.longitude,
                          }))
                        }
                      />
                    )}
                  </div>
                ) : null}
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-800">Modo de transporte</span>
                <select
                  value={travelMode}
                  onChange={(e) => setTravelMode(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                >
                  <option value="DRIVING">Coche</option>
                  <option value="WALKING">Andando</option>
                  <option value="TRANSIT">Transporte público</option>
                </select>
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={calculateRoute}
                  disabled={calculating}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {calculating ? "Calculando..." : "Calcular ruta"}
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!preview || savingRoute}
                  className="rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
                >
                  {savingRoute ? "Guardando..." : "Guardar ruta"}
                </button>
              </div>

              {preview ? (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                  <p><strong>Distancia:</strong> {preview.distanceText || "—"}</p>
                  <p><strong>Duración:</strong> {preview.durationText || "—"}</p>
                  <p><strong>Llegada estimada:</strong> {preview.arrivalTime || "—"}</p>
                </div>
              ) : null}

              {routeError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {routeError}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Rutas guardadas</h2>
          <div className="mt-4 space-y-3">
            {visibleRoutes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                No hay rutas para este día.
              </div>
            ) : (
              visibleRoutes.map((route) => (
                <article key={route.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-slate-950">{route.title || route.route_name || "Ruta"}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {(route.route_day || route.route_date || "Sin día")}
                        {route.departure_time ? ` · ${route.departure_time}` : ""}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {(route.origin_name || route.origin_address || "Origen")} → {(route.destination_name || route.destination_address || "Destino")}
                      </p>
                      {route.distance_text || route.duration_text ? (
                        <p className="mt-1 text-sm text-slate-500">
                          {[route.distance_text, route.duration_text].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                    </div>

                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {normalizeTravelMode(route.travel_mode)}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setHighlightedRouteId((prev) => (prev === route.id ? null : route.id))}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                    >
                      {highlightedRouteId === route.id ? "Mostrar todas" : "Mostrar ruta"}
                    </button>

                    <a
                      href={buildGoogleMapsUrl(route)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                    >
                      Abrir en Google Maps
                    </a>

                    <button
                      type="button"
                      onClick={() => void startEdit(route)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                    >
                      Editar ruta
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleDelete(route.id)}
                      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                    >
                      Eliminar ruta
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="space-y-4">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
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
              <MarkerF
                key={point.id}
                position={{ lat: point.latitude, lng: point.longitude }}
                title={point.title || undefined}
              />
            ))}

            {visibleRoutes.map((route) => {
              const directions = directionsMap[route.id];
              if (!directions) return null;

              return (
                <DirectionsRenderer
                  key={route.id}
                  directions={directions}
                  options={{
                    suppressMarkers: false,
                    polylineOptions: {
                      strokeColor: route.color || "#4f46e5",
                      strokeOpacity: 0.9,
                      strokeWeight: highlightedRouteId === route.id ? 6 : 5,
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
                    strokeColor: "#0f766e",
                    strokeOpacity: 0.9,
                    strokeWeight: 6,
                  },
                }}
              />
            ) : null}
          </GoogleMap>
        </section>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          {highlightedRouteId
            ? "Mostrando solo la ruta seleccionada en el mapa."
            : selectedDate === "all"
            ? "Mostrando rutas de todos los días."
            : `Mostrando rutas del día ${selectedDate}.`}
        </div>
      </div>
    </div>
  );
}
