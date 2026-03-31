import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import TripMapView from "@/components/trip/map/TripMapView";

type Props = {
  params: { id: string };
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

export default async function TripMapPage({ params }: Props) {
  const tripId = params.id;

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
    <main className="page-shell space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            Mapa del viaje
          </div>

          <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950 md:text-5xl">
            {trip.name || "Viaje"}
          </h1>

          <p className="mt-3 max-w-4xl text-lg text-slate-600">
            Crea rutas reales del viaje usando los lugares guardados en Plan, edita recorridos por día,
            organiza múltiples paradas y visualiza todo directamente sobre el mapa.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href={`/trip/${tripId}`}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-900"
          >
            Volver al viaje
          </Link>

          <Link
            href="/dashboard"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-900"
          >
            Dashboard
          </Link>
        </div>
      </section>

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
