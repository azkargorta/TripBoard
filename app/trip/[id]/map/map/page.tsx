import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import TripMapView from "@/components/trip/map/TripMapView";
import TripTabActions from "@/components/trip/common/TripTabActions";

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
    <main className="page-shell space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            Mapa del viaje
          </div>

          <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950 md:text-5xl">
            {trip.name || "Viaje"}
          </h1>

          <p className="mt-3 text-lg text-slate-600">
            Organiza actividades sobre el mapa, crea rutas del día y visualiza lugares guardados.
          </p>
        </div>

<TripTabActions tripId={tripId} />
      </section>

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