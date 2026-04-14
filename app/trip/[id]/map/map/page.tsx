import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import TripMapView from "@/components/trip/map/TripMapView";
import TripTabActions from "@/components/trip/common/TripTabActions";
import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";

type Props = {
  params: { id: string };
};

function buildTripDates(startDate?: string | null, endDate?: string | null) {
  if (!startDate || !endDate) return [];

  const dates: string[] = [];
  let current = startDate;

  while (current <= endDate) {
    dates.push(current);

    const [year, month, day] = current.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    current = next.toISOString().slice(0, 10);
  }

  return dates;
}

export default async function TripMapPage({ params }: Props) {
  const tripId = params.id;

  await requireTripAccess(tripId);
  const supabase = await createClient();

  const [{ data: trip }, { data: activities }, { data: routes }] = await Promise.all([
    supabase
      .from("trips")
      .select("id, name, destination, start_date, end_date")
      .eq("id", tripId)
      .maybeSingle(),

    supabase
      .from("trip_activities")
      .select("id, title, latitude, longitude, activity_type, activity_date, location_name, notes")
      .eq("trip_id", tripId),

    supabase
      .from("trip_routes")
      .select("*")
      .eq("trip_id", tripId)
      .order("route_day", { ascending: true })
      .order("departure_time", { ascending: true }),
  ]);

  if (!trip) {
    redirect(`/trip/${tripId}`);
  }

  const points = (activities || [])
    .filter(
      (item) =>
        Number.isFinite(item.latitude) &&
        Number.isFinite(item.longitude)
    )
    .map((item) => ({
      id: item.id,
      title: item.title || item.location_name || "Lugar",
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      kind: item.activity_type || "activity",
      activity_date: item.activity_date || null,
      location_name: item.location_name || null,
      notes: item.notes || null,
    }));

  // SOLO días del viaje
  const availableDates = buildTripDates(trip.start_date, trip.end_date);

  return (
    <main className="space-y-6">
      <TripBoardPageHeader
        section="Mapa del viaje"
        title={trip.name || "Viaje"}
        description="Organiza actividades sobre el mapa, crea rutas del día y visualiza lugares guardados."
        iconSrc="/brand/tabs/map.png"
        iconAlt="Mapa"
        actions={<TripTabActions tripId={tripId} />}
      />

      <TripMapView
        tripId={tripId}
        points={points}
        routes={(routes as any[]) || []}
        selectedDate="all"
        availableDates={availableDates}
      />
    </main>
  );
}