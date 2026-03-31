import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  return {
    userId: user.id,
    participantId: participant.id,
    tripId: participant.trip_id,
    role: (participant.role ?? "viewer") as "owner" | "editor" | "viewer",
  };
}