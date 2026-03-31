"use client";

import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ParticipantPermissions, TripRole } from "@/lib/participants";
import { normalizePermissions } from "@/lib/participants";

export type TripInvite = {
  id: string;
  trip_id: string;
  participant_id: string | null;
  token: string;
  display_name: string | null;
  email: string | null;
  role: TripRole;
  status: string;
  created_by_user_id: string | null;
  accepted_by_user_id: string | null;
  accepted_at: string | null;
  expires_at: string | null;
  created_at: string;
} & ParticipantPermissions;

type CreateTripInviteInput = {
  trip_id: string;
  participant_id?: string | null;
  display_name?: string | null;
  email?: string | null;
  role?: TripRole;
} & Partial<ParticipantPermissions>;

type UseTripInvitesResult = {
  loading: boolean;
  error: string | null;
  createInvite: (input: CreateTripInviteInput) => Promise<TripInvite>;
  buildInviteUrl: (token: string) => string;
};

export function useTripInvites(): UseTripInvitesResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createInvite = useCallback(async (input: CreateTripInviteInput) => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const role = input.role ?? "viewer";
      const permissions = normalizePermissions(role, input);
      const token = crypto.randomUUID().replace(/-/g, "");

      const { data, error } = await supabase
        .from("trip_invites")
        .insert({
          trip_id: input.trip_id,
          participant_id: input.participant_id ?? null,
          token,
          display_name: input.display_name?.trim() || null,
          email: input.email?.trim().toLowerCase() || null,
          role,
          status: "pending",
          created_by_user_id: session?.user?.id ?? null,
          expires_at: null,
          ...permissions,
        })
        .select("*")
        .single();

      if (error || !data) {
        throw error || new Error("No se pudo crear la invitación");
      }

      return data as TripInvite;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo crear la invitación";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const buildInviteUrl = useCallback((token: string) => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/invite/${token}`;
  }, []);

  return {
    loading,
    error,
    createInvite,
    buildInviteUrl,
  };
}
