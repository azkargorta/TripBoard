import { supabase } from "@/lib/supabase";

export type LodgingReservationForSync = {
  id: string;
  trip_id: string;
  reservation_name: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  check_in_date?: string | null;
  check_in_time?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
  sync_to_plan?: boolean | null;
};

async function geocodeAddress(address: string, tripId: string) {
  const response = await fetch("/api/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, tripId }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || "No se pudo geocodificar la dirección.");
  }

  return {
    latitude: typeof payload?.latitude === "number" ? payload.latitude : null,
    longitude: typeof payload?.longitude === "number" ? payload.longitude : null,
    formattedAddress: payload?.formattedAddress || address,
  };
}

export async function syncLodgingReservationToPlan(
  reservation: LodgingReservationForSync
) {
  if (!reservation.sync_to_plan) {
    return removeLodgingReservationFromPlan(reservation.id);
  }

  const joinedAddress = [
    reservation.address,
    reservation.city,
    reservation.country,
  ]
    .filter(Boolean)
    .join(", ")
    .trim();

  let latitude =
    typeof reservation.latitude === "number" ? reservation.latitude : null;
  let longitude =
    typeof reservation.longitude === "number" ? reservation.longitude : null;
  let formattedAddress = joinedAddress || reservation.address || "";

  if ((latitude == null || longitude == null) && joinedAddress) {
    try {
      const geo = await geocodeAddress(joinedAddress, reservation.trip_id);
      latitude = geo.latitude;
      longitude = geo.longitude;
      formattedAddress = geo.formattedAddress || formattedAddress;
    } catch (error) {
      console.error("No se pudo geocodificar el alojamiento:", error);
    }
  }

  const { data: existing } = await supabase
    .from("trip_activities")
    .select("id")
    .eq("linked_reservation_id", reservation.id)
    .maybeSingle();

  const payload = {
    trip_id: reservation.trip_id,
    linked_reservation_id: reservation.id,
    title: `Check-in · ${reservation.reservation_name}`,
    description: reservation.notes || null,
    activity_date: reservation.check_in_date || null,
    activity_time: reservation.check_in_time || null,
    place_name: reservation.reservation_name,
    address: formattedAddress || null,
    latitude,
    longitude,
    activity_type: "lodging",
    source: "reservation",
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("trip_activities")
      .update(payload)
      .eq("id", existing.id);

    if (error) {
      throw new Error(error.message || "No se pudo actualizar la actividad del plan.");
    }
  } else {
    const { error } = await supabase.from("trip_activities").insert(payload);

    if (error) {
      throw new Error(error.message || "No se pudo crear la actividad del plan.");
    }
  }

  if (
    (reservation.latitude == null || reservation.longitude == null) &&
    latitude != null &&
    longitude != null
  ) {
    await supabase
      .from("trip_reservations")
      .update({
        latitude,
        longitude,
      })
      .eq("id", reservation.id);
  }
}

export async function removeLodgingReservationFromPlan(reservationId: string) {
  const { error } = await supabase
    .from("trip_activities")
    .delete()
    .eq("linked_reservation_id", reservationId);

  if (error) {
    throw new Error(error.message || "No se pudo quitar el alojamiento del plan.");
  }
}
