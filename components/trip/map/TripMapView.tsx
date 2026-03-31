"use client";

import { useMemo } from "react";
import {
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
      };
    })
    .filter(Boolean) as TripMapPoint[];
}

function buildRouteLines(rows: unknown[] | undefined, prefix: string) {
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
        path: [
          { lat: originLat, lng: originLng },
          { lat: destinationLat, lng: destinationLng },
        ],
      };
    })
    .filter(Boolean) as Array<{
      id: string;
      color: string;
      path: { lat: number; lng: number }[];
    }>;
}

export default function TripMapView({
  points = [],
  routes = [],
  tripDates = [],
  selectedDate,
  onChangeSelectedDate,
  planSources,
  routeSources,
}: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
  });

  const computedPoints = useMemo(() => {
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
    [...directPoints, ...planPoints].forEach((point) => {
      byId.set(point.id, point);
    });

    return Array.from(byId.values());
  }, [planSources, points]);

  const computedRoutes = useMemo(() => {
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
          path: [
            { lat: originLat, lng: originLng },
            { lat: destinationLat, lng: destinationLng },
          ],
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      color: string;
      path: { lat: number; lng: number }[];
    }>;

    return [
      ...directRoutes,
      ...buildRouteLines(routeSources?.tripRoutes, "trip-route"),
      ...buildRouteLines(routeSources?.legacyRoutes, "legacy-route"),
    ];
  }, [routeSources, routes]);

  const center = useMemo(() => {
    const firstPoint = computedPoints[0];
    if (firstPoint) {
      return { lat: firstPoint.latitude, lng: firstPoint.longitude };
    }

    const firstRoute = computedRoutes[0]?.path?.[0];
    if (firstRoute) return firstRoute;

    return DEFAULT_CENTER;
  }, [computedPoints, computedRoutes]);

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
      {tripDates.length > 0 && onChangeSelectedDate ? (
        <div className="flex flex-wrap gap-2">
          {tripDates.map((date) => {
            const active = selectedDate === date;
            return (
              <button
                key={date}
                type="button"
                onClick={() => onChangeSelectedDate(date)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                  active
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-700 border border-slate-200"
                }`}
              >
                {date}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm" style={{ height: "560px" }}>
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: "100%" }}
          center={center}
          zoom={computedPoints.length || computedRoutes.length ? 7 : 5}
          options={{
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: true,
          }}
        >
          {computedPoints.map((point) => (
            <MarkerF
              key={point.id}
              position={{ lat: point.latitude, lng: point.longitude }}
              title={point.title || undefined}
            />
          ))}

          {computedRoutes.map((route) => (
            <PolylineF
              key={route.id}
              path={route.path}
              options={{
                strokeColor: route.color,
                strokeOpacity: 0.9,
                strokeWeight: 4,
              }}
            />
          ))}
        </GoogleMap>
      </div>

      {!computedPoints.length && !computedRoutes.length ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No hay puntos ni rutas válidas para mostrar todavía. Añade lugares en Plan o rutas guardadas.
        </div>
      ) : null}
    </div>
  );
}
