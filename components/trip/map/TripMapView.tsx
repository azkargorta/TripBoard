"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DirectionsRenderer, GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import PlaceAutocompleteInput from "@/components/PlaceAutocompleteInput";
import { useTripRoutes } from "@/hooks/useTripRoutes";

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

function buildInitialRoutes(rows: unknown[] | undefined, prefix: string): TripMapRoute[] {
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
      ...buildInitialRoutes(routeSources?.tripRoutes, "trip-route"),
      ...buildInitialRoutes(routeSources?.legacyRoutes, "legacy-route"),
    ];
    const byId = new Map<string, TripMapRoute>();
    all.forEach((route) => byId.set(route.id, route));
    return Array.from(byId.values());
  }, [routeSources]);

  const [routesState, setRoutesState] = useState<TripMapRoute[]>(initialRoutes);
  const [selectedDate, setSelectedDate] = useState<string>("all");
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeDate, setRouteDate] = useState(tripDates[0] || "");
  const [routeName, setRouteName] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [origin, setOrigin] = useState<FormPlaceState>(emptyPlaceState());
  const [destination, setDestination] = useState<FormPlaceState>(emptyPlaceState());
  const [preview, setPreview] = useState<RoutePreview | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [directionsMap, setDirectionsMap] = useState<Record<string, google.maps.DirectionsResult | null>>({});

  const { routeError: hookRouteError } = useTripRoutes(tripId);

  useEffect(() => {
    setRoutesState(initialRoutes);
  }, [initialRoutes]);

  useEffect(() => {
    if (hookRouteError) setRouteError(hookRouteError);
  }, [hookRouteError]);

  const visibleRoutes = useMemo(() => {
    return selectedDate === "all"
      ? routesState
      : routesState.filter((route) => (route.route_day || route.route_date) === selectedDate);
  }, [routesState, selectedDate]);

  useEffect(() => {
    const gm = typeof window !== "undefined" ? window.google : undefined;
    if (!isLoaded || !gm?.maps) return;

    const service = new gm.maps.DirectionsService();
    let cancelled = false;

    async function loadDirections() {
      const next: Record<string, google.maps.DirectionsResult | null> = {};
      for (const route of visibleRoutes) {
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
            travelMode: gm.maps.TravelMode[normalizeTravelMode(route.travel_mode)],
            provideRouteAlternatives: false,
          });
          next[route.id] = result;
        } catch {
          next[route.id] = null;
        }
      }
      if (!cancelled) setDirectionsMap(next);
    }

    void loadDirections();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, visibleRoutes]);

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

  const fitMapToData = useCallback(() => {
    const gm = typeof window !== "undefined" ? window.google : undefined;
    const map = mapRef.current;
    if (!map || !gm?.maps) return;

    const bounds = new gm.maps.LatLngBounds();
    let hasData = false;

    visiblePoints.forEach((point) => {
      bounds.extend({ lat: point.latitude, lng: point.longitude });
      hasData = true;
    });

    visibleRoutes.forEach((route) => {
      const directions = directionsMap[route.id];
      const overview = directions?.routes?.[0]?.overview_path;
      if (overview?.length) {
        overview.forEach((point) => {
          bounds.extend(point);
          hasData = true;
        });
      }
    });

    if (preview?.directions?.routes?.[0]?.overview_path?.length) {
      preview.directions.routes[0].overview_path.forEach((point) => {
        bounds.extend(point);
        hasData = true;
      });
    }

    if (!hasData) {
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(6);
      return;
    }

    map.fitBounds(bounds, 80);
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

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Origen</h2>
          <div className="mt-4 space-y-2">
            <PlaceAutocompleteInput
              value={origin.address}
              onChange={(value) =>
                setOrigin((prev) => ({
                  ...prev,
                  address: value,
                }))
              }
              onPlaceSelect={(payload) => void handleAutocompleteSelect(setOrigin, payload)}
            />
            <div className="text-xs text-slate-500">Lat: {origin.latitude ?? "—"} · Lng: {origin.longitude ?? "—"}</div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Destino</h2>
          <div className="mt-4 space-y-2">
            <PlaceAutocompleteInput
              value={destination.address}
              onChange={(value) =>
                setDestination((prev) => ({
                  ...prev,
                  address: value,
                }))
              }
              onPlaceSelect={(payload) => void handleAutocompleteSelect(setDestination, payload)}
            />
            <div className="text-xs text-slate-500">Lat: {destination.latitude ?? "—"} · Lng: {destination.longitude ?? "—"}</div>
          </div>
        </section>
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
                      strokeColor: "#0f766e",
                      strokeOpacity: 0.9,
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
