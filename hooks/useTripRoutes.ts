"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export type RoutePoint = {
  lat: number;
  lng: number;
};

export type RouteStop = {
  id?: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
};

export type SaveRouteInput = {
  routeDate: string;
  routeName: string;
  departureTime: string;
  mode: string;
  color?: string | null;
  notes?: string | null;
  originName: string;
  originAddress: string;
  originLatitude: number | null;
  originLongitude: number | null;
  stops?: RouteStop[];
  stopName?: string;
  stopAddress?: string;
  stopLatitude?: number | null;
  stopLongitude?: number | null;
  destinationName: string;
  destinationAddress: string;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  distanceText?: string | null;
  durationText?: string | null;
  arrivalTime?: string | null;
  routePoints?: RoutePoint[];
  pathPoints?: RoutePoint[];
  routeOrder?: number | null;
};

function sanitizePointArray(points?: RoutePoint[] | null) {
  if (!Array.isArray(points)) return [];
  return points
    .filter(
      (point) =>
        point &&
        typeof point.lat === "number" &&
        Number.isFinite(point.lat) &&
        typeof point.lng === "number" &&
        Number.isFinite(point.lng)
    )
    .map((point) => ({ lat: point.lat, lng: point.lng }));
}

function sanitizeStops(input: SaveRouteInput) {
  const rawStops = Array.isArray(input.stops) ? input.stops : [];
  const stops = rawStops
    .filter(
      (stop) =>
        stop &&
        typeof stop.name === "string" &&
        (typeof stop.latitude === "number" || typeof stop.longitude === "number" || stop.address)
    )
    .map((stop) => ({
      name: stop.name || stop.address || "Parada",
      address: stop.address || stop.name || null,
      latitude: typeof stop.latitude === "number" ? stop.latitude : null,
      longitude: typeof stop.longitude === "number" ? stop.longitude : null,
    }))
    .filter(
      (stop) =>
        typeof stop.latitude === "number" &&
        Number.isFinite(stop.latitude) &&
        typeof stop.longitude === "number" &&
        Number.isFinite(stop.longitude)
    );

  if (stops.length > 0) return stops;

  if (
    typeof input.stopLatitude === "number" &&
    Number.isFinite(input.stopLatitude) &&
    typeof input.stopLongitude === "number" &&
    Number.isFinite(input.stopLongitude)
  ) {
    return [
      {
        name: input.stopName || input.stopAddress || "Parada",
        address: input.stopAddress || input.stopName || null,
        latitude: input.stopLatitude,
        longitude: input.stopLongitude,
      },
    ];
  }

  return [];
}

export function useTripRoutes(tripId: string, reload?: () => Promise<void>) {
  const [savingRoute, setSavingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: number | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => {
          timer = window.setTimeout(() => {
            reject(new Error(`Timeout (${label})`));
          }, ms);
        }),
      ]);
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  async function apiRequest<T>(input: RequestInfo, init: RequestInit, label: string): Promise<T> {
    const response = await withTimeout(fetch(input, init), 20000, label);
    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { error: text || "Respuesta no JSON." };
    }

    if (!response.ok) {
      throw new Error(payload?.error || `Error ${response.status}`);
    }
    if (payload?.error) throw new Error(payload.error);
    return payload as T;
  }

  function isLockAbortError(error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "";

    const name = error instanceof Error ? error.name : "";
    const lower = message.toLowerCase();

    return (
      name === "AbortError" ||
      lower.includes("the lock request is aborted") ||
      lower.includes("lock request is aborted")
    );
  }

  async function withLockRetry<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (!isLockAbortError(error)) throw error;

      // Pequeño backoff + asegurar sesión inicializada.
      try {
        await supabase.auth.getSession();
      } catch {
        // no-op
      }
      await new Promise((resolve) => setTimeout(resolve, 200));

      return await fn();
    }
  }

  async function saveRoute(input: SaveRouteInput, routeId?: string) {
    setSavingRoute(true);
    setRouteError(null);

    try {
      if (!tripId) {
        throw new Error("Falta el identificador del viaje.");
      }

      if (!input.routeDate) {
        throw new Error("Falta el día de la ruta.");
      }

      if (!input.routeName?.trim()) {
        throw new Error("Falta el nombre de la ruta.");
      }

      if (
        typeof input.originLatitude !== "number" ||
        typeof input.originLongitude !== "number" ||
        typeof input.destinationLatitude !== "number" ||
        typeof input.destinationLongitude !== "number"
      ) {
        throw new Error("Origen y destino deben tener coordenadas válidas.");
      }

      const routePoints = sanitizePointArray(input.routePoints);
      const pathPoints = sanitizePointArray(input.pathPoints);
      const waypoints = sanitizeStops(input);
      const firstStop = waypoints[0] || null;

      const payload = {
        trip_id: tripId,
        route_date: input.routeDate,
        route_day: input.routeDate,
        day_date: input.routeDate,
        name: input.routeName.trim(),
        route_name: input.routeName.trim(),
        title: input.routeName.trim(),
        departure_time: input.departureTime || null,
        start_time: input.departureTime || null,
        route_start_time: input.departureTime || null,
        mode: input.mode || "driving",
        travel_mode: (input.mode || "driving").toUpperCase(),
        color: input.color || null,
        notes: input.notes ?? null,
        origin_name: input.originName || input.originAddress || "Origen",
        origin_address: input.originAddress || null,
        origin_latitude: input.originLatitude,
        origin_longitude: input.originLongitude,
        stop_name: firstStop?.name || null,
        stop_address: firstStop?.address || null,
        stop_latitude: firstStop?.latitude ?? null,
        stop_longitude: firstStop?.longitude ?? null,
        destination_name: input.destinationName || input.destinationAddress || "Destino",
        destination_address: input.destinationAddress || null,
        destination_latitude: input.destinationLatitude,
        destination_longitude: input.destinationLongitude,
        distance_text: input.distanceText || null,
        duration_text: input.durationText || null,
        arrival_time: input.arrivalTime || null,
        route_points: routePoints,
        path_points: pathPoints.length ? pathPoints : routePoints,
        waypoints,
        route_order: typeof input.routeOrder === "number" ? input.routeOrder : null,
      };

      // Guardado vía API server-side para evitar locks del navegador (Supabase storage).
      // Mantiene RLS/permiso porque el server client usa cookies del usuario.
      const body = {
        tripId,
        ...payload,
      };

      const apiResult = routeId
        ? await apiRequest<{ route: any }>(
            `/api/trip-routes/${routeId}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
            "guardar ruta (PATCH)"
          )
        : await apiRequest<{ route: any }>(
            `/api/trip-routes`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
            "guardar ruta (POST)"
          );

      if (!apiResult?.route) {
        throw new Error("No se recibió la ruta guardada.");
      }

      void reload?.();
      return apiResult.route;
    } catch (error) {
      const message = isLockAbortError(error)
        ? "El navegador ha abortado un lock de almacenamiento al guardar (suele pasar con varias pestañas abiertas o sesión inestable). Prueba a recargar la página y cerrar otras pestañas de TripBoard, y vuelve a guardar."
        : error instanceof Error && error.message.startsWith("Timeout")
          ? "La petición se ha quedado colgada al guardar. Revisa tu conexión/VPN, recarga la página y vuelve a intentarlo."
          : error instanceof Error
            ? error.message
            : "No se pudo guardar la ruta.";
      console.error("saveRoute error:", error);
      setRouteError(message);
      throw error;
    } finally {
      setSavingRoute(false);
    }

    /* Unreachable: kept for reference of old client-side approach.
      if (result.error) {
        const raw = result.error.message || "No se pudo guardar la ruta.";

        if (raw.toLowerCase().includes("schema cache")) {
          throw new Error(
            "La tabla trip_routes no tiene todavía todos los campos necesarios. Ejecuta primero el SQL del parche de rutas."
          );
        }

        if (raw.toLowerCase().includes("row-level security")) {
          throw new Error(
            "Supabase está bloqueando el guardado por RLS. Ejecuta el SQL de policies de trip_routes."
          );
        }

        throw new Error(raw);
      }

      // Importante: no bloquear el guardado si el reload se queda colgado
      // (p. ej. por locks del navegador o latencias). El usuario puede seguir.
      void reload?.();
      return result.data;
    */
  }

  async function deleteRoute(routeId: string) {
    setSavingRoute(true);
    setRouteError(null);

    try {
      await apiRequest<{ ok: true }>(
        `/api/trip-routes/${routeId}`,
        { method: "DELETE" },
        "eliminar ruta (DELETE)"
      );
      void reload?.();
    } catch (error) {
      const message = isLockAbortError(error)
        ? "El navegador ha abortado un lock de almacenamiento al eliminar. Prueba a recargar la página y cerrar otras pestañas de TripBoard, y vuelve a intentarlo."
        : error instanceof Error && error.message.startsWith("Timeout")
          ? "La petición a Supabase se ha quedado colgada al eliminar. Revisa tu conexión/VPN y vuelve a intentarlo."
          : error instanceof Error
            ? error.message
          : "No se pudo eliminar la ruta.";
      setRouteError(message);
      throw error;
    } finally {
      setSavingRoute(false);
    }
  }

  async function reorderRoutes(routeIds: string[]) {
    setSavingRoute(true);
    setRouteError(null);

    try {
      // No usado en el mapa actual; mantenemos implementación client-side.
      await withLockRetry(async () => {
        await withTimeout(
          Promise.all(
            routeIds.map((routeId, index) =>
              Promise.resolve(supabase.from("trip_routes").update({ route_order: index + 1 }).eq("id", routeId))
            )
          ),
          20000,
          "reordenar rutas"
        );
      });
      void reload?.();
    } catch (error) {
      const message = isLockAbortError(error)
        ? "El navegador ha abortado un lock de almacenamiento al reordenar. Prueba a recargar la página y cerrar otras pestañas de TripBoard."
        : error instanceof Error && error.message.startsWith("Timeout")
          ? "La petición a Supabase se ha quedado colgada al reordenar. Revisa tu conexión/VPN y vuelve a intentarlo."
          : error instanceof Error
            ? error.message
          : "No se pudo reordenar las rutas.";
      setRouteError(message);
      throw error;
    } finally {
      setSavingRoute(false);
    }
  }

  async function updateActivitiesTimes() {
    return;
  }

  return {
    saveRoute,
    updateActivitiesTimes,
    deleteRoute,
    reorderRoutes,
    savingRoute,
    routeError,
  };
}
