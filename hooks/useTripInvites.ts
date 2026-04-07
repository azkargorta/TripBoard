"use client";

import { useCallback, useState } from "react";
import type { ParticipantPermissions, TripRole } from "@/lib/participants";

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
      const response = await fetch("/api/trip-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo crear la invitación");
      }

      if (!payload?.invite) {
        throw new Error("No se recibió la invitación.");
      }

      return payload.invite as TripInvite;
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
