"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Trip = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  description?: string | null;
  base_currency?: string | null;
};

export type Activity = {
  id: string;
  trip_id: string;
  title: string;
  activity_date?: string | null;
  activity_time?: string | null;
  place?: string | null;
  place_type?: string | null;
  lat?: number | null;
  lng?: number | null;
  sort_order?: number | null;
  notes?: string | null;
  created_at?: string | null;
};

export type Expense = {
  id: string;
  trip_id: string;
  title: string;
  amount: number;
  currency: string | null;
  category?: string | null;
  expense_date?: string | null;
  paid_by_participant_id?: string | null;
  split_between?: string[] | null;
  linked_activity_id?: string | null;
};

export type Participant = {
  id: string;
  trip_id: string;
  display_name: string | null;
  username?: string | null;
  email?: string | null;
  user_id?: string | null;
  status?: string | null;
};

export type Resource = {
  id: string;
  trip_id: string;
  title: string;
  type?: string | null;
  url?: string | null;
};

type UseTripDataResult = {
  trip: Trip | null;
  activities: Activity[];
  expenses: Expense[];
  participants: Participant[];
  resources: Resource[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useTripData(tripId: string): UseTripDataResult {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadTripData() {
    if (!tripId) {
      setError("No se ha proporcionado un tripId válido");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [
        { data: tripData, error: tripError },
        { data: activitiesData, error: activitiesError },
        { data: expensesData, error: expensesError },
        { data: participantsData, error: participantsError },
        { data: resourcesData, error: resourcesError },
      ] = await Promise.all([
        supabase.from("trips").select("*").eq("id", tripId).single(),
        supabase
          .from("activities")
          .select("*")
          .eq("trip_id", tripId)
          .order("activity_date", { ascending: true })
          .order("activity_time", { ascending: true }),
        supabase
          .from("trip_expenses")
          .select("*")
          .eq("trip_id", tripId)
          .order("expense_date", { ascending: false }),
        supabase
          .from("trip_participants")
          .select("id, trip_id, display_name, username, email, user_id, status")
          .eq("trip_id", tripId)
          .neq("status", "removed")
          .order("created_at", { ascending: true }),
        supabase
          .from("trip_resources")
          .select("*")
          .eq("trip_id", tripId)
          .order("created_at", { ascending: false }),
      ]);

      if (tripError) throw tripError;
      if (activitiesError) throw activitiesError;
      if (expensesError) throw expensesError;
      if (participantsError) throw participantsError;
      if (resourcesError) {
        console.warn("No se pudieron cargar recursos:", resourcesError.message);
      }

      setTrip((tripData as Trip) || null);
      setActivities((activitiesData as Activity[]) || []);
      setExpenses((expensesData as Expense[]) || []);
      setParticipants((participantsData as Participant[]) || []);
      setResources((resourcesData as Resource[]) || []);
    } catch (err) {
      console.error("Error loading trip data:", err);
      setError(err instanceof Error ? err.message : "No se pudo cargar el viaje");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTripData();
  }, [tripId]);

  return {
    trip,
    activities,
    expenses,
    participants,
    resources,
    loading,
    error,
    reload: loadTripData,
  };
}
