"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type TripActivity = {
  id: string;
  trip_id: string;
  linked_reservation_id?: string | null;
  title: string;
  description?: string | null;
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

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [tripResponse, activitiesResponse] = await Promise.all([
        supabase.from("trips").select("id, name, destination").eq("id", tripId).single(),
        supabase
          .from("trip_activities")
          .select("*")
          .eq("trip_id", tripId)
          .order("activity_date", { ascending: true })
          .order("activity_time", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

      if (tripResponse.error) {
        throw new Error(tripResponse.error.message);
      }

      if (activitiesResponse.error) {
        throw new Error(activitiesResponse.error.message);
      }

      setTrip((tripResponse.data || null) as TripPlanSummary | null);
      setActivities((activitiesResponse.data || []) as TripActivity[]);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "No se pudo cargar el plan.");
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
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const payload = {
          trip_id: tripId,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          activity_date: input.activityDate || null,
          activity_time: input.activityTime || null,
          place_name: input.placeName?.trim() || null,
          address: input.address?.trim() || null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          activity_type: input.activityKind === "lodging" ? "lodging" : "general",
          activity_kind: input.activityKind || "visit",
          source: "manual",
          created_by_user_id: session?.user?.id || null,
        };

        const { error } = await supabase.from("trip_activities").insert(payload);
        if (error) throw new Error(error.message);

        await load();
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
        const payload = {
          title: input.title.trim(),
          description: input.description?.trim() || null,
          activity_date: input.activityDate || null,
          activity_time: input.activityTime || null,
          place_name: input.placeName?.trim() || null,
          address: input.address?.trim() || null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          activity_type: input.activityKind === "lodging" ? "lodging" : "general",
          activity_kind: input.activityKind || "visit",
        };

        const { error } = await supabase.from("trip_activities").update(payload).eq("id", activityId);
        if (error) throw new Error(error.message);

        await load();
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
        const { error } = await supabase.from("trip_activities").delete().eq("id", activityId);
        if (error) throw new Error(error.message);

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
