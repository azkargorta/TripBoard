import { supabase } from "@/lib/supabase";
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

function nowIso() {
  return new Date().toISOString();
}

export async function getCurrentUser() {
  // getSession() puede no resolver en Safari/WebViews; getUser() es más estable.
  const { data, error } = await withTimeout(
    supabase.auth.getUser(),
    8_000,
    "No se pudo comprobar tu sesión (timeout). Recarga e inténtalo de nuevo."
  );

  if (error) throw error;
  return data.user ?? null;
}

export async function getInviteByToken(token: string) {
  const { data, error } = await supabase
    .from("trip_invites")
    .select("*")
    .eq("token", token)
    .single();

  if (error || !data) {
    throw error || new Error("Invitación no encontrada");
  }

  return data as TripInviteRecord;
}

export async function ensureParticipantForInvite(
  invite: TripInviteRecord,
  userId: string
) {
  if (invite.participant_id) {
    const { data: existingParticipant, error: existingParticipantError } =
      await supabase
        .from("trip_participants")
        .select("id, trip_id, user_id")
        .eq("id", invite.participant_id)
        .single();

    if (existingParticipantError || !existingParticipant) {
      throw (
        existingParticipantError ||
        new Error("No se encontró el participante asociado a la invitación")
      );
    }

    if (
      existingParticipant.user_id &&
      existingParticipant.user_id !== userId
    ) {
      throw new Error(
        "Este enlace ya está vinculado a otro usuario."
      );
    }

    const { data: updatedParticipant, error: updateError } = await supabase
      .from("trip_participants")
      .update({
        user_id: userId,
        joined_via: "invite",
        linked_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", invite.participant_id)
      .select("*")
      .single();

    if (updateError || !updatedParticipant) {
      throw updateError || new Error("No se pudo vincular el participante");
    }

    return updatedParticipant;
  }

  const { data: existingByUser, error: existingByUserError } = await supabase
    .from("trip_participants")
    .select("id")
    .eq("trip_id", invite.trip_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingByUserError) {
    throw existingByUserError;
  }

  if (existingByUser) {
    return existingByUser;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, email")
    .eq("id", userId)
    .maybeSingle();

  const { data: inserted, error: insertError } = await supabase
    .from("trip_participants")
    .insert({
      trip_id: invite.trip_id,
      display_name: invite.display_name || profile?.username || "Participante",
      username: profile?.username || null,
      email: invite.email || profile?.email || null,
      user_id: userId,
      joined_via: "invite",
      role: invite.role,
      status: "active",
      linked_at: nowIso(),
      can_manage_trip: invite.can_manage_trip ?? false,
      can_manage_participants: invite.can_manage_participants ?? false,
      can_manage_expenses: invite.can_manage_expenses ?? false,
      can_manage_plan: invite.can_manage_plan ?? false,
      can_manage_map: invite.can_manage_map ?? false,
      can_manage_resources: invite.can_manage_resources ?? false,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    throw insertError || new Error("No se pudo crear el participante");
  }

  return inserted;
}

export async function markInviteAccepted(inviteId: string, userId: string) {
  const { error } = await supabase
    .from("trip_invites")
    .update({
      status: "accepted",
      accepted_by_user_id: userId,
      accepted_at: nowIso(),
    })
    .eq("id", inviteId);

  if (error) {
    throw error;
  }
}

export async function acceptInviteToken(token: string) {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Debes iniciar sesión para aceptar la invitación.");
  }

  const invite = await getInviteByToken(token);

  if (invite.status === "accepted") {
    return {
      invite,
      alreadyAccepted: true,
    };
  }

  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    throw new Error("Esta invitación ha caducado.");
  }

  await ensureParticipantForInvite(invite, user.id);
  await markInviteAccepted(invite.id, user.id);

  return {
    invite,
    alreadyAccepted: false,
  };
}
