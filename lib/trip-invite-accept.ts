import { withTimeout } from "@/lib/with-timeout";

export type InviteStatus = "pending" | "accepted" | "expired" | "cancelled";

export type TripInviteRecord = {
  id: string;
  trip_id: string;
  participant_id: string | null;
  token: string;
  display_name: string | null;
  email: string | null;
  role: "owner" | "editor" | "viewer";
  status: InviteStatus;
  created_by_user_id: string | null;
  accepted_by_user_id: string | null;
  accepted_at: string | null;
  expires_at: string | null;
  created_at: string;
  can_manage_trip?: boolean | null;
  can_manage_participants?: boolean | null;
  can_manage_expenses?: boolean | null;
  can_manage_plan?: boolean | null;
  can_manage_map?: boolean | null;
  can_manage_resources?: boolean | null;
};

export async function getInviteByToken(token: string) {
  const res = await withTimeout(
    fetch(`/api/trip-invites/${encodeURIComponent(token)}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    }),
    12_000,
    "No se pudo cargar la invitación (timeout). Revisa la conexión e inténtalo otra vez."
  );

  const payload = (await res.json().catch(() => null)) as { invite?: TripInviteRecord; error?: string } | null;
  if (!res.ok) {
    throw new Error(payload?.error || `No se pudo cargar la invitación (${res.status})`);
  }

  if (!payload?.invite) {
    throw new Error("Invitación no encontrada");
  }

  return payload.invite;
}

export async function acceptInviteToken(token: string) {
  const res = await withTimeout(
    fetch(`/api/trip-invites/accept`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }),
    20_000,
    "No se pudo aceptar la invitación (timeout). Revisa la conexión e inténtalo otra vez."
  );

  const payload = (await res.json().catch(() => null)) as
    | { invite?: TripInviteRecord; alreadyAccepted?: boolean; error?: string }
    | null;

  if (!res.ok) {
    throw new Error(payload?.error || `No se pudo aceptar la invitación (${res.status})`);
  }

  if (!payload?.invite) {
    throw new Error("Respuesta inválida del servidor.");
  }

  return {
    invite: payload.invite,
    alreadyAccepted: Boolean(payload.alreadyAccepted),
  };
}
