"use client";

import { useMemo } from "react";

export type MapRouteRecord = {
  id: string;
  name?: string | null;
  route_date?: string | null;
  route_start_time?: string | null;
  distance_text?: string | null;
  duration_text?: string | null;
  origin_activity_id?: string | null;
  destination_activity_id?: string | null;
  waypoint_ids?: string[] | null;
  travel_mode?: "DRIVING" | "WALKING" | "TRANSIT" | null;
};

export function useTripRoutesByDay(routes: MapRouteRecord[], selectedDay: string) {
  return useMemo(() => {
    if (!selectedDay) return [];
    return routes
      .filter((route) => route.route_date === selectedDay)
      .sort((a, b) => (a.route_start_time || "").localeCompare(b.route_start_time || ""));
  }, [routes, selectedDay]);
}
