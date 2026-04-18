import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

export type CreateTripInput = {
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  base_currency: string;
};

/**
 * Inserta `trips` + participante owner. Misma lógica que POST /api/trips.
 */
export async function createTripWithOwner(
  supabase: SupabaseClient,
  user: User,
  input: CreateTripInput
): Promise<{ tripId: string } | { error: string }> {
  const name = input.name.trim();
  const destination = typeof input.destination === "string" ? input.destination.trim() : "";
  const start_date = input.start_date;
  const end_date = input.end_date;
  const base_currency = /^[A-Z]{3}$/.test(input.base_currency) ? input.base_currency : "EUR";

  if (!name) return { error: "El nombre del viaje es obligatorio." };
  if (start_date && end_date && start_date > end_date) {
    return { error: "La fecha de inicio no puede ser posterior a la fecha de fin." };
  }

  const tripInsert = await supabase
    .from("trips")
    .insert({
      name,
      destination: destination || null,
      start_date,
      end_date,
      base_currency,
    })
    .select("id")
    .single();

  if (tripInsert.error || !tripInsert.data) {
    return { error: tripInsert.error?.message || "No se pudo crear el viaje." };
  }

  const tripId = String((tripInsert.data as { id: string }).id);

  const participantInsert = await supabase.from("trip_participants").insert({
    trip_id: tripId,
    display_name:
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.user_metadata?.username ||
      user.email ||
      "Usuario",
    username: user.user_metadata?.username || user.email?.split("@")[0] || null,
    joined_via: "owner",
    user_id: user.id,
    role: "owner",
  });

  if (participantInsert.error) {
    await supabase.from("trips").delete().eq("id", tripId);
    return { error: participantInsert.error.message };
  }

  return { tripId };
}
