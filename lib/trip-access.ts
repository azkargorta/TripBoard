import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";

export type TripAccessResult = {
  userId: string;
  participantId: string;
  tripId: string;
  role: "owner" | "editor" | "viewer";
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
    .select("id, trip_id, user_id, role")
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

  // Premium gating: en plan gratis solo se permite entrar al "viaje activo".
  // Implementación: el último viaje creado (created_at más reciente) de los viajes donde participas.
  // Los viajes antiguos quedan guardados pero bloqueados hasta premium.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("is_premium")
    .eq("id", user.id)
    .maybeSingle();

  const isPremium = Boolean((profileRow as any)?.is_premium);
  if (!isPremium) {
    // Si el viaje tiene al menos 1 usuario premium, permitimos acceso aunque el usuario sea free:
    // ese viaje funciona "modo premium compartido".
    const tripHasPremium = await isPremiumEnabledForTrip({
      supabase,
      userId: user.id,
      tripId,
    });
    if (tripHasPremium) {
      return {
        userId: user.id,
        participantId: participant.id,
        tripId: participant.trip_id,
        role: (participant.role ?? "viewer") as "owner" | "editor" | "viewer",
      };
    }

    const { data: newestTrip } = await supabase
      .from("trips")
      .select("id, created_at")
      .in(
        "id",
        (
          await supabase
            .from("trip_participants")
            .select("trip_id")
            .eq("user_id", user.id)
            .neq("status", "removed")
        ).data?.map((r: any) => r.trip_id) ?? []
      )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (newestTrip?.id && String(newestTrip.id) !== String(tripId)) {
      redirect("/dashboard?upgrade=premium&reason=trip_limit");
    }
  }

  return {
    userId: user.id,
    participantId: participant.id,
    tripId: participant.trip_id,
    role: (participant.role ?? "viewer") as "owner" | "editor" | "viewer",
  };
}