import { redirect } from "next/navigation";
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