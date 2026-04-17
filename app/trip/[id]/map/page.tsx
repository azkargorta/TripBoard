import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import TripMapView from "@/components/trip/map/TripMapView";
import TripScreenActions from "@/components/trip/common/TripScreenActions";
import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";

type Props = {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

type QueryResult<T> = { data: T[]; error?: string | null };

async function safeSelect<T = Record<string, unknown>>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  tripId: string,
  orderBy?: string
): Promise<QueryResult<T>> {
  try {
    let query = supabase.from(table).select("*").eq("trip_id", tripId);
    if (orderBy) {
      query = query.order(orderBy as never, { ascending: true });
    }
    const result = await query;
    if (result.error) {
      return { data: [], error: result.error.message };
    }
    return { data: (result.data as T[]) || [] };
  } catch (error) {
    return {
      data: [],
      error: error instanceof Error ? error.message : `No se pudo leer ${table}.`,
    };
  }
}

function buildTripDates(startDate?: string | null, endDate?: string | null) {
  if (!startDate || !endDate) return [] as string[];

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

export default async function TripMapPage({ params, searchParams }: Props) {
  const tripId = params.id;
  const rawView = searchParams?.view;
  const view = typeof rawView === "string" ? rawView.trim().toLowerCase() : Array.isArray(rawView) ? String(rawView[0] || "").trim().toLowerCase() : "";
  if (view === "explore") {
    // Explorar ya no vive dentro del mapa.
    redirect(`/trip/${encodeURIComponent(tripId)}/plan?explore=1`);
  }

  await requireTripAccess(tripId);
  const supabase = await createClient();

  const tripResponse = await supabase
    .from("trips")
    .select("id, name, destination, start_date, end_date")
    .eq("id", tripId)
    .maybeSingle();

  const trip = tripResponse.data;

  if (!trip) {
    redirect(`/trip/${tripId}`);
  }

  const [tripActivities, legacyActivities, tripRoutes, legacyRoutes] = await Promise.all([
    safeSelect(supabase, "trip_activities", tripId, "activity_date"),
    safeSelect(supabase, "activities", tripId, "activity_date"),
    safeSelect(supabase, "trip_routes", tripId, "route_day"),
    safeSelect(supabase, "routes", tripId, "route_date"),
  ]);

  return (
    <main className="space-y-6">
      <TripBoardPageHeader
        section="Mapa del viaje"
        title={trip.name || "Viaje"}
        description="Crea rutas con los lugares del plan, edita recorridos por día, organiza varias paradas y visualízalo todo sobre el mapa."
        iconSrc="/brand/tabs/map.png"
        iconAlt="Mapa"
        actions={<TripScreenActions tripId={tripId} />}
      />

      <TripMapView
        tripId={tripId}
        trip={{
          id: trip.id,
          name: trip.name || "Viaje",
          destination: trip.destination || null,
          start_date: trip.start_date || null,
          end_date: trip.end_date || null,
        }}
        tripDates={buildTripDates(trip.start_date, trip.end_date)}
        planSources={{
          tripActivities: tripActivities.data,
          legacyActivities: legacyActivities.data,
        }}
        routeSources={{
          tripRoutes: tripRoutes.data,
          legacyRoutes: legacyRoutes.data,
        }}
      />
    </main>
  );
}
