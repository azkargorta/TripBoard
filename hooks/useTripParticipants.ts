"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  ParticipantPermissions,
  ParticipantStatus,
  TripParticipantRecord,
  TripRole,
} from "@/lib/participants";
export type { TripRole } from "@/lib/participants";
import { normalizePermissions } from "@/lib/participants";

export type TripParticipant = TripParticipantRecord;

export type ProfileSearchResult = {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
};

export type CreateTripParticipantInput = {
  trip_id: string;
  display_name: string;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
  joined_via?: string | null;
  user_id?: string | null;
  role?: TripRole;
  status?: ParticipantStatus;
  linked_at?: string | null;
} & Partial<ParticipantPermissions>;

export type UpdateTripParticipantInput = Partial<
  Omit<CreateTripParticipantInput, "trip_id">
>;

type UseTripParticipantsResult = {
  participants: TripParticipant[];
  loading: boolean;
  error: string | null;
  addParticipant: (input: CreateTripParticipantInput) => Promise<TripParticipant>;
  updateParticipant: (
    id: string,
    input: UpdateTripParticipantInput
  ) => Promise<TripParticipant>;
  removeParticipant: (id: string) => Promise<void>;
  searchProfiles: (query: string) => Promise<ProfileSearchResult[]>;
  linkParticipantToProfile: (
    participantId: string,
    profile: ProfileSearchResult
  ) => Promise<void>;
  refetch: () => Promise<void>;
};

export function useTripParticipants(
  tripId: string | undefined
): UseTripParticipantsResult {
  const [participants, setParticipants] = useState<TripParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchParticipants = useCallback(async () => {
    if (!tripId) {
      setParticipants([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("trip_participants")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true });

    if (error) {
      setParticipants([]);
      setError(error.message);
      setLoading(false);
      return;
    }

    setParticipants((data ?? []) as TripParticipant[]);
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    void fetchParticipants();
  }, [fetchParticipants]);

  const addParticipant = useCallback(
    async (input: CreateTripParticipantInput) => {
      setError(null);

      const role = input.role ?? "viewer";
      const permissions = normalizePermissions(role, input);
      const payload = {
        trip_id: input.trip_id,
        display_name: input.display_name.trim(),
        username: input.username?.trim() || null,
        email: input.email?.trim().toLowerCase() || null,
        phone: input.phone?.trim() || null,
        joined_via: input.joined_via ?? "manual",
        user_id: input.user_id ?? null,
        role,
        status: input.status ?? (input.user_id ? "active" : "pending"),
        linked_at: input.linked_at ?? (input.user_id ? new Date().toISOString() : null),
        ...permissions,
      };

      const { data, error } = await supabase
        .from("trip_participants")
        .insert(payload)
        .select("*")
        .single();

      if (error || !data) {
        const message = error?.message ?? "No se pudo crear el participante";
        setError(message);
        throw new Error(message);
      }

      await fetchParticipants();
      return data as TripParticipant;
    },
    [fetchParticipants]
  );

  const updateParticipant = useCallback(
    async (id: string, input: UpdateTripParticipantInput) => {
      setError(null);

      const current = participants.find((participant) => participant.id === id);
      if (!current) {
        throw new Error("Participante no encontrado");
      }

      const nextRole = input.role ?? current.role;
      const permissions = normalizePermissions(nextRole, {
        can_manage_trip: input.can_manage_trip ?? current.can_manage_trip,
        can_manage_participants:
          input.can_manage_participants ?? current.can_manage_participants,
        can_manage_expenses:
          input.can_manage_expenses ?? current.can_manage_expenses,
        can_manage_plan: input.can_manage_plan ?? current.can_manage_plan,
        can_manage_map: input.can_manage_map ?? current.can_manage_map,
        can_manage_resources:
          input.can_manage_resources ?? current.can_manage_resources,
      });

      const payload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        role: nextRole,
        status: input.status ?? current.status,
        can_manage_trip: permissions.can_manage_trip,
        can_manage_participants: permissions.can_manage_participants,
        can_manage_expenses: permissions.can_manage_expenses,
        can_manage_plan: permissions.can_manage_plan,
        can_manage_map: permissions.can_manage_map,
        can_manage_resources: permissions.can_manage_resources,
      };

      if (input.display_name !== undefined) {
        payload.display_name = input.display_name.trim();
      }
      if (input.username !== undefined) {
        payload.username = input.username?.trim() || null;
      }
      if (input.email !== undefined) {
        payload.email = input.email?.trim().toLowerCase() || null;
      }
      if (input.phone !== undefined) {
        payload.phone = input.phone?.trim() || null;
      }
      if (input.joined_via !== undefined) {
        payload.joined_via = input.joined_via || null;
      }
      if (input.user_id !== undefined) {
        payload.user_id = input.user_id || null;
      }
      if (input.linked_at !== undefined) {
        payload.linked_at = input.linked_at;
      }

      const { data, error } = await supabase
        .from("trip_participants")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();

      if (error || !data) {
        const message = error?.message ?? "No se pudo actualizar el participante";
        setError(message);
        throw new Error(message);
      }

      await fetchParticipants();
      return data as TripParticipant;
    },
    [fetchParticipants, participants]
  );

  const removeParticipant = useCallback(
    async (id: string) => {
      setError(null);

      const current = participants.find((participant) => participant.id === id);
      if (!current) return;

      const activeOwners = participants.filter(
        (participant) => participant.role === "owner" && participant.status === "active"
      );

      if (current.role === "owner" && activeOwners.length <= 1) {
        const message = "El viaje debe mantener al menos un owner activo.";
        setError(message);
        throw new Error(message);
      }

      const { error } = await supabase
        .from("trip_participants")
        .update({
          status: "removed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) {
        setError(error.message);
        throw new Error(error.message);
      }

      await fetchParticipants();
    },
    [fetchParticipants, participants]
  );

  const searchProfiles = useCallback(async (query: string) => {
    const normalized = query.trim();
    if (!normalized) return [];

    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, email, full_name")
      .or(`username.ilike.%${normalized}%,email.ilike.%${normalized}%`)
      .limit(8);

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as ProfileSearchResult[];
  }, []);

  const linkParticipantToProfile = useCallback(
    async (participantId: string, profile: ProfileSearchResult) => {
      const participant = participants.find((item) => item.id === participantId);
      if (!participant) {
        throw new Error("Participante no encontrado");
      }

      const duplicate = participants.find(
        (item) =>
          item.trip_id === participant.trip_id &&
          item.id !== participantId &&
          item.user_id === profile.id &&
          item.status !== "removed"
      );

      if (duplicate) {
        throw new Error("Ese usuario ya está vinculado a otro participante del viaje.");
      }

      const { error } = await supabase
        .from("trip_participants")
        .update({
          user_id: profile.id,
          username: profile.username,
          email: profile.email,
          joined_via: participant.joined_via === "manual" ? "linked" : participant.joined_via,
          linked_at: new Date().toISOString(),
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", participantId);

      if (error) {
        setError(error.message);
        throw new Error(error.message);
      }

      await fetchParticipants();
    },
    [fetchParticipants, participants]
  );

  return {
    participants,
    loading,
    error,
    addParticipant,
    updateParticipant,
    removeParticipant,
    searchProfiles,
    linkParticipantToProfile,
    refetch: fetchParticipants,
  };
}
