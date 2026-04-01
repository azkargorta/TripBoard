"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DirectionsRenderer,
  GoogleMap,
  MarkerF,
  PolylineF,
  useJsApiLoader,
} from "@react-google-maps/api";

export type TripMapPoint = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string | null;
  activity_date?: string | null;
  location_name?: string | null;
  notes?: string | null;
  kind?: string | null;
};

export type TripMapRoute = {
  id: string;
  route_day?: string | null;
  departure_time?: string | null;
  title?: string | null;
  travel_mode?: string | null;
  notes?: string | null;
  color?: string | null;
  origin_name?: string | null;
  origin_latitude?: number | null;
  origin_longitude?: number | null;
  destination_name?: string | null;
  destination_latitude?: number | null;
  destination_longitude?: number | null;
};

type UnknownRow = Record<string, unknown>;

type Props = {
  tripId: string;
  points?: TripMapPoint[] | null;
  routes?: TripMapRoute[] | null;
  selectedDate?: string;
  onChangeSelectedDate?: (value: string) => void;
  availableDates?: string[] | null;
  trip?: unknown;
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

type RouteRenderItem = {
  id: string;
  color: string;
  travelMode: "DRIVING" | "WALKING" | "BICYCLING" | "TRANSIT";
  routeDay: string | null;
  path: { lat: number; lng: number }[];
};

type DirectionsMap = Record<string, google.maps.DirectionsResult | null>;

const DEFAULT_CENTER = { lat: 48.8566, lng: 2.3522 };

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

function normalizeTravelMode(value: string | null | undefined): RouteRenderItem["travelMode"] {
  const clean = (value || "").toUpperCase();
  if (clean === "WALKING") return "WALKING";
  if (clean === "BICYCLING") return "BICYCLING";
  if (clean === "TRANSIT") return "TRANSIT";
  return "DRIVING";
}

function buildPlanPoints(rows: unknown[] | undefined, prefix: string) {
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

      return {
        id: `${prefix}-${String(item.id ?? index)}`,
        latitude,
        longitude,
        title:
          asString(item.title) ??
          asString(item.name) ??
          asString(item.place_name) ??
          asString(item.location_name) ??
          "Parada",
        activity_date:
          asString(item.activity_date) ??
          asString(item.day_date) ??
          asString(item.date) ??
          null,
        location_name:
          asString(item.location_name) ??
          asString(item.place_name) ??
          asString(item.address) ??
          null,
        notes: asString(item.notes) ?? null,
        kind: asString(item.activity_type) ?? asString(item.activity_kind) ?? null,
      };
    })
    .filter(Boolean) as TripMapPoint[];
}

function buildRouteItems(rows: unknown[] | undefined, prefix: string) {
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

      if (
        originLat == null ||
        originLng == null ||
        destinationLat == null ||
        destinationLng == null
      ) {
        return null;
      }

      return {
        id: `${prefix}-${String(item.id ?? index)}`,
        color: asString(item.color) ?? "#4f46e5",
        travelMode: normalizeTravelMode(asString(item.travel_mode)),
        routeDay:
          asString(item.route_day) ??
          asString(item.route_date) ??
          asString(item.day_date) ??
          null,
        path: [
          { lat: originLat, lng: originLng },
          { lat: destinationLat, lng: destinationLng },
        ],
      };
    })
    .filter(Boolean) as RouteRenderItem[];
}

export default function TripMapView({
  points = [],
  routes = [],
  selectedDate,
  onChangeSelectedDate,
  availableDates,
  tripDates = [],
  planSources,
  routeSources,
}: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const mapRef = useRef<google.maps.Map | null>(null);
  const fittedRef = useRef<string | null>(null);
  const [internalSelectedDate, setInternalSelectedDate] = useState("all");
  const [directionsMap, setDirectionsMap] = useState<DirectionsMap>({});
  const [directionsLoading, setDirectionsLoading] = useState(false);

  const effectiveSelectedDate = selectedDate ?? internalSelectedDate;

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
  });

  const allPoints = useMemo(() => {
    const directPoints = (points ?? []).filter(
      (p) =>
        typeof p?.latitude === "number" &&
        Number.isFinite(p.latitude) &&
        typeof p?.longitude === "number" &&
        Number.isFinite(p.longitude)
    );

    const planPoints = [
      ...buildPlanPoints(planSources?.tripActivities, "trip-activity"),
      ...buildPlanPoints(planSources?.legacyActivities, "legacy-activity"),
    ];

    const byId = new Map<string, TripMapPoint>();
    [...directPoints, ...planPoints].forEach((point) => byId.set(point.id, point));
    return Array.from(byId.values());
  }, [planSources, points]);

  const allRoutes = useMemo(() => {
    const directRoutes = (routes ?? [])
      .map((route) => {
        const originLat = asNumber(route.origin_latitude);
        const originLng = asNumber(route.origin_longitude);
        const destinationLat = asNumber(route.destination_latitude);
        const destinationLng = asNumber(route.destination_longitude);

        if (
          originLat == null ||
          originLng == null ||
          destinationLat == null ||
          destinationLng == null
        ) {
          return null;
        }

        return {
          id: route.id,
          color: route.color || "#4f46e5",
          travelMode: normalizeTravelMode(route.travel_mode),
          routeDay: route.route_day ?? null,
          path: [
            { lat: originLat, lng: originLng },
            { lat: destinationLat, lng: destinationLng },
          ],
        };
      })
      .filter(Boolean) as RouteRenderItem[];

    return [
      ...directRoutes,
      ...buildRouteItems(routeSources?.tripRoutes, "trip-route"),
      ...buildRouteItems(routeSources?.legacyRoutes, "legacy-route"),
    ];
  }, [routeSources, routes]);

  const dates = useMemo(() => {
    const raw = availableDates?.length ? availableDates : tripDates;
    const unique = Array.from(new Set((raw ?? []).filter(Boolean)));
    return unique.length ? ["all", ...unique] : [];
  }, [availableDates, tripDates]);

  const visiblePoints = useMemo(() => {
    if (effectiveSelectedDate === "all") return allPoints;
    return allPoints.filter((point) => point.activity_date === effectiveSelectedDate);
  }, [allPoints, effectiveSelectedDate]);

  const visibleRoutes = useMemo(() => {
    if (effectiveSelectedDate === "all") return allRoutes;
    return allRoutes.filter((route) => route.routeDay === effectiveSelectedDate);
  }, [allRoutes, effectiveSelectedDate]);

  const center = useMemo(() => {
    const firstPoint = visiblePoints[0];
    if (firstPoint) return { lat: firstPoint.latitude, lng: firstPoint.longitude };
    const firstRoute = visibleRoutes[0]?.path?.[0];
    if (firstRoute) return firstRoute;
    return DEFAULT_CENTER;
  }, [visiblePoints, visibleRoutes]);

  const fitMapToData = useCallback((map: google.maps.Map) => {
    if (!visiblePoints.length && !visibleRoutes.length) {
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(5);
      return;
    }

    const bounds = new google.maps.LatLngBounds();

    visiblePoints.forEach((point) => {
      bounds.extend({ lat: point.latitude, lng: point.longitude });
    });

    visibleRoutes.forEach((route) => {
      const directions = directionsMap[route.id];
      if (directions?.routes?.[0]?.overview_path?.length) {
        directions.routes[0].overview_path.forEach((latLng) => bounds.extend(latLng));
      } else {
        route.path.forEach((point) => bounds.extend(point));
      }
    });

    if (!bounds.isEmpty()) map.fitBounds(bounds, 80);
  }, [directionsMap, visiblePoints, visibleRoutes]);

  useEffect(() => {
    if (!isLoaded || typeof google === "undefined") return;

    if (!visibleRoutes.length) {
      setDirectionsMap({});
      setDirectionsLoading(false);
      return;
    }

    let cancelled = false;
    const service = new google.maps.DirectionsService();

    async function loadDirections() {
      setDirectionsLoading(true);

      const entries = await Promise.all(
        visibleRoutes.map(async (route) => {
          try {
            const result = await service.route({
              origin: route.path[0],
              destination: route.path[1],
              travelMode: google.maps.TravelMode[route.travelMode],
              provideRouteAlternatives: false,
            });
            return [route.id, result] as const;
          } catch (error) {
            console.error("Error calculando ruta:", route.id, error);
            return [route.id, null] as const;
          }
        })
      );

      if (cancelled) return;

      const nextMap: DirectionsMap = {};
      entries.forEach(([id, result]) => {
        nextMap[id] = result;
      });

      setDirectionsMap(nextMap);
      setDirectionsLoading(false);
    }

    void loadDirections();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, visibleRoutes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;

    const fitKey = JSON.stringify({
      selectedDate: effectiveSelectedDate,
      points: visiblePoints.map((p) => p.id),
      routes: visibleRoutes.map((r) => r.id),
      loadedDirections: Object.keys(directionsMap).sort(),
    });

    if (fittedRef.current === fitKey) return;

    const timer = window.setTimeout(() => {
      fitMapToData(map);
      fittedRef.current = fitKey;
    }, 200);

    return () => window.clearTimeout(timer);
  }, [effectiveSelectedDate, visiblePoints, visibleRoutes, directionsMap, fitMapToData, isLoaded]);

  const handleMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  if (!apiKey) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Falta configurar <strong>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</strong> en Vercel.
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        <p className="font-semibold">No se pudo cargar Google Maps.</p>
        <p>
          Revisa la API key, las APIs activadas en Google Cloud y los dominios permitidos
          en HTTP referrers.
        </p>
      </div>
    );
  }

  if (!isLoaded) {
    return <div className="rounded-2xl border bg-white p-6">Cargando mapa...</div>;
  }

  return (
    <div className="space-y-4">
      {dates.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {dates.map((date) => {
            const active = effectiveSelectedDate === date;
            const label = date === "all" ? "Todos los días" : date;
            return (
              <button
                key={date}
                type="button"
                onClick={() => {
                  if (onChangeSelectedDate) onChangeSelectedDate(date);
                  else setInternalSelectedDate(date);
                }}
                className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                  active
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-700"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      {directionsLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Calculando trayectos por carretera...
        </div>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: "560px" }}
          center={center}
          zoom={6}
          onLoad={handleMapLoad}
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

            if (directions) {
              return (
                <DirectionsRenderer
                  key={route.id}
                  directions={directions}
                  options={{
                    suppressMarkers: true,
                    polylineOptions: {
                      strokeColor: route.color,
                      strokeOpacity: 0.9,
                      strokeWeight: 5,
                    },
                  }}
                />
              );
            }

            return (
              <PolylineF
                key={route.id}
                path={route.path}
                options={{
                  strokeColor: route.color,
                  strokeOpacity: 0.7,
                  strokeWeight: 4,
                }}
              />
            );
          })}
        </GoogleMap>
      </div>

      {!visiblePoints.length && !visibleRoutes.length ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No hay puntos ni rutas válidas para mostrar todavía. Añade lugares en Plan o rutas guardadas.
        </div>
      ) : null}
    </div>
  );
}
