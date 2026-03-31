"use client";

import { GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api";

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

type Props = {
  tripId: string;
  points?: TripMapPoint[] | null;
  routes?: TripMapRoute[] | null;
  selectedDate?: string;
  onChangeSelectedDate?: (value: string) => void;
  availableDates?: string[] | null;
  trip?: unknown;
  tripDates?: string[];
  planSources?: unknown;
  routeSources?: unknown;
};

const DEFAULT_CENTER = { lat: 48.8566, lng: 2.3522 };

export default function TripMapView({ points = [] }: Props) {
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
