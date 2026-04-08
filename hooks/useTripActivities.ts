"use client";

import { useCallback, useEffect, useState } from "react";
export type TripActivity = {
  id: string;
  trip_id?: string;
  linked_reservation_id?: string | null;
  title: string;
  description?: string | null;
  rating?: number | null;
  comment?: string | null;
  activity_date?: string | null;
  activity_time?: string | null;
  place_name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  activity_type?: string | null;
  activity_kind?: string | null;
  source?: string | null;
  created_at?: string | null;
};

export type TripPlanSummary = {
  id: string;
  name?: string | null;
  destination?: string | null;
};

export type SaveActivityInput = {
  title: string;
  description?: string;
  rating?: number | null;
  comment?: string;
  activityDate?: string;
  activityTime?: string;
  placeName?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  activityKind?: string;
};

export function useTripActivities(tripId: string) {
  const [trip, setTrip] = useState<TripPlanSummary | null>(null);
  const [activities, setActivities] = useState<TripActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function isLockAbortError(err: unknown) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "";
    const name = err instanceof Error ? err.name : "";
    const lower = message.toLowerCase();
    return (
      name === "AbortError" ||
      lower.includes("the lock request is aborted") ||
      lower.includes("lock request is aborted")
    );
  }

  async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: number | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => {
          timer = window.setTimeout(() => reject(new Error(`Timeout (${label})`)), ms);
        }),
      ]);
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  async function apiRequest<T>(input: RequestInfo, init: RequestInit, label: string): Promise<T> {
    const resp = await withTimeout(fetch(input, init), 20000, label);
    const text = await resp.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { error: text || "Respuesta no JSON." };
    }
    if (!resp.ok) throw new Error(payload?.error || `Error ${resp.status}`);
    if (payload?.error) throw new Error(payload.error);
    return payload as T;
  }

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Trip + actividades via API server-side (evita locks/hangs del navegador)
      const payload = await apiRequest<{ trip: TripPlanSummary | null; activities: TripActivity[] }>(
        `/api/trip-activities?tripId=${encodeURIComponent(tripId)}`,
        { method: "GET" },
        "cargar plan"
      );
      setTrip((payload.trip || null) as TripPlanSummary | null);
      setActivities(Array.isArray(payload.activities) ? payload.activities : []);
    } catch (err) {
      console.error(err);
      const msg =
        isLockAbortError(err)
          ? "El navegador ha abortado un lock de almacenamiento al cargar el plan. Prueba a recargar la página y cerrar otras pestañas de TripBoard."
          : err instanceof Error && err.message.startsWith("Timeout")
            ? "La carga del plan se ha quedado colgada (timeout). Revisa tu conexión/VPN y recarga la página."
            : err instanceof Error
              ? err.message
              : "No se pudo cargar el plan.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  const createActivity = useCallback(
    async (input: SaveActivityInput) => {
      setSaving(true);
      setError(null);
      try {
        await apiRequest<{ activity: TripActivity }>(
          "/api/trip-activities",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tripId,
              title: input.title.trim(),
              description: input.description?.trim() || null,
              rating: typeof input.rating === "number" && input.rating >= 1 && input.rating <= 5 ? input.rating : null,
              comment: input.comment?.trim() || null,
              activity_date: input.activityDate || null,
              activity_time: input.activityTime || null,
              place_name: input.placeName?.trim() || null,
              address: input.address?.trim() || null,
              latitude: input.latitude ?? null,
              longitude: input.longitude ?? null,
              activity_type: input.activityKind === "lodging" ? "lodging" : "general",
              activity_kind: input.activityKind || "visit",
              source: "manual",
            }),
          },
          "crear actividad"
        );

        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo crear la actividad.");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [load, tripId]
  );

  const updateActivity = useCallback(
    async (activityId: string, input: SaveActivityInput) => {
      setSaving(true);
      setError(null);
      try {
        await apiRequest<{ activity: TripActivity }>(
          `/api/trip-activities/${activityId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: input.title.trim(),
              description: input.description?.trim() || null,
              rating: typeof input.rating === "number" && input.rating >= 1 && input.rating <= 5 ? input.rating : null,
              comment: input.comment?.trim() || null,
              activity_date: input.activityDate || null,
              activity_time: input.activityTime || null,
              place_name: input.placeName?.trim() || null,
              address: input.address?.trim() || null,
              latitude: input.latitude ?? null,
              longitude: input.longitude ?? null,
              activity_type: input.activityKind === "lodging" ? "lodging" : "general",
              activity_kind: input.activityKind || "visit",
            }),
          },
          "editar actividad"
        );

        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo actualizar la actividad.");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [load]
  );

  const deleteActivity = useCallback(
    async (activityId: string) => {
      const confirmed = window.confirm("¿Seguro que quieres borrar esta actividad del plan?");
      if (!confirmed) return;

      setSaving(true);
      setError(null);
      try {
        await apiRequest<{ ok: true }>(
          `/api/trip-activities/${activityId}`,
          { method: "DELETE" },
          "borrar actividad"
        );

        await load();
      } finally {
        setSaving(false);
      }
    },
    [load]
  );

  return {
    trip,
    activities,
    loading,
    saving,
    error,
    reload: load,
    createActivity,
    updateActivity,
    deleteActivity,
  };
}
