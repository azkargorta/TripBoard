"use client";

type Point = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  kind?: string;
  activity_date?: string | null;
  location_name?: string | null;
  notes?: string | null;
};

type Props = {
  tripId: string;
  points: Point[]; // 🔥 añadido
  routes?: any[];
  selectedDate?: string;
  availableDates?: string[];
};

export default function TripMapView({
  tripId,
  points,
  routes = [],
  selectedDate = "all",
  availableDates = [],
}: Props) {
  return (
    <div>
      {/* DEBUG TEMPORAL */}
      <pre style={{ fontSize: 10 }}>
        {JSON.stringify({ tripId, points, routes, selectedDate }, null, 2)}
      </pre>

      {/* Aquí va tu mapa real */}
    </div>
  );
}
