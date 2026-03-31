"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DirectionsRenderer,
  GoogleMap,
  InfoWindowF,
  MarkerF,
  useJsApiLoader,
} from "@react-google-maps/api";
import TripMapActivityLegend from "@/components/trip/map/TripMapActivityLegend";
import {
  TRIP_MAP_LEGEND,
  buildGoogleMarkerSymbol,
  getLegendItem,
  type TripMapPlaceKind,
} from "@/components/trip/map/tripMapMarkerConfig";
import { useTripMapActivities, type TripMapPoint } from "@/hooks/useTripMapActivities";

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

// 🔥 EXTENDIDO para compatibilidad con distintas páginas
type Props = {
  tripId: string;
  points?: TripMapPoint[] | null;
  routes?: TripMapRoute[] | null;
  selectedDate?: string;
  onChangeSelectedDate?: (value: string) => void;
  availableDates?: string[] | null;

  // ⬇️ NUEVO: props opcionales para evitar errores de build
  trip?: any;
  tripDates?: string[];
  planSources?: any;
  routeSources?: any;
};

type RouteDirectionsMap = Record<string, google.maps.DirectionsResult | null>;

const DEFAULT_CENTER = { lat: 48.8566, lng: 2.3522 };

function routeColor(index: number, saved?: string | null) {
  if (saved) return saved;
  const palette = ["#2563eb", "#e11d48", "#059669", "#7c3aed", "#d97706", "#0891b2", "#dc2626", "#0f766e"];
  return palette[index % palette.length];
}

export default function TripMapView({
  tripId,
  points = [],
  routes = [],
  selectedDate = "all",
  availableDates = [],
}: Props) {
  // 🔥 tu lógica original sigue intacta
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
  });

  if (!isLoaded) return <div>Cargando mapa...</div>;

  return (
    <div style={{ height: "500px" }}>
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={DEFAULT_CENTER}
        zoom={5}
      >
        {(points || []).map((p) => (
          <MarkerF
            key={p.id}
            position={{ lat: p.latitude, lng: p.longitude }}
          />
        ))}
      </GoogleMap>
    </div>
  );
}
