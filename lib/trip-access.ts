import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { normalizePermissions, normalizeRole } from "@/lib/permissions";

export type TripAccessResult = {
  userId: string;
  participantId: string;
  tripId: string;
  role: "owner" | "editor" | "viewer";
  can_manage_trip: boolean;
  can_manage_participants: boolean;
  can_manage_expenses: boolean;
  can_manage_plan: boolean;
  can_manage_map: boolean;
  can_manage_resources: boolean;
};

export async function requireTripAccess(
  tripId: string
): Promise<TripAccessResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?next=/trip/${tripId}`);
  }

  const { data: participant, error } = await supabase
    .from("trip_participants")
    .select(
      "id, trip_id, user_id, role, can_manage_trip, can_manage_participants, can_manage_expenses, can_manage_plan, can_manage_map, can_manage_resources"
    )
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Error comprobando acceso al viaje:", error);
    redirect("/dashboard");
  }

  if (!participant) {
    redirect("/dashboard");
  }

  const role = normalizeRole((participant as any)?.role);
  const perms = normalizePermissions(role, {
    can_manage_trip: (participant as any)?.can_manage_trip ?? undefined,
    can_manage_participants: (participant as any)?.can_manage_participants ?? undefined,
    can_manage_expenses: (participant as any)?.can_manage_expenses ?? undefined,
    can_manage_plan: (participant as any)?.can_manage_plan ?? undefined,
    can_manage_map: (participant as any)?.can_manage_map ?? undefined,
    can_manage_resources: (participant as any)?.can_manage_resources ?? undefined,
  });

  return {
    userId: user.id,
    participantId: participant.id,
    tripId: participant.trip_id,
    role,
    ...perms,
  };
}

export type GetTripAccessApiResult =
  | { ok: true; access: TripAccessResult }
  | { ok: false; status: 401 | 403 | 500; error: string };

/**
 * Misma comprobación que `requireTripAccess`, pero para Route Handlers:
 * no usa `redirect()` (evita respuestas 307/HTML que rompen `fetch` + JSON).
 */
export async function getTripAccessForApi(
  supabase: SupabaseClient,
  tripId: string
): Promise<GetTripAccessApiResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: "No hay sesión activa." };
  }

  const { data: participant, error } = await supabase
    .from("trip_participants")
    .select(
      "id, trip_id, user_id, role, can_manage_trip, can_manage_participants, can_manage_expenses, can_manage_plan, can_manage_map, can_manage_resources"
    )
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Error comprobando acceso al viaje (API):", error);
    return { ok: false, status: 500, error: "No se pudo verificar el acceso al viaje." };
  }

  if (!participant) {
    return { ok: false, status: 403, error: "No tienes acceso a este viaje." };
  }

  const role = normalizeRole((participant as any)?.role);
  const perms = normalizePermissions(role, {
    can_manage_trip: (participant as any)?.can_manage_trip ?? undefined,
    can_manage_participants: (participant as any)?.can_manage_participants ?? undefined,
    can_manage_expenses: (participant as any)?.can_manage_expenses ?? undefined,
    can_manage_plan: (participant as any)?.can_manage_plan ?? undefined,
    can_manage_map: (participant as any)?.can_manage_map ?? undefined,
    can_manage_resources: (participant as any)?.can_manage_resources ?? undefined,
  });

  return {
    ok: true,
    access: {
      userId: user.id,
      participantId: participant.id,
      tripId: participant.trip_id,
      role,
      ...perms,
    },
  };
}