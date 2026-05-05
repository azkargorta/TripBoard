import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import TripRecapClient from "@/components/trip/recap/TripRecapClient";

type Props = { params: { id: string } };

export default async function TripRecapPage({ params }: Props) {
  const tripId = params.id;
  await requireTripAccess(tripId);
  const supabase = await createClient();

  const [
    { data: trip },
    { data: activities },
    { data: expenses },
    { count: participantsCount },
  ] = await Promise.all([
    supabase.from("trips").select("id, name, destination, start_date, end_date, base_currency").eq("id", tripId).maybeSingle(),
    supabase.from("trip_activities").select("id, title, activity_date, activity_kind, latitude, longitude").eq("trip_id", tripId),
    supabase.from("trip_expenses").select("amount, currency, category").eq("trip_id", tripId),
    supabase.from("trip_participants").select("id", { count: "exact" }).eq("trip_id", tripId).neq("status", "removed"),
  ]);

  if (!trip) return <div className="p-8 text-slate-500">Viaje no encontrado.</div>;

  // Stats
  const actList = activities || [];
  const expList = expenses || [];

  const totalDays = trip.start_date && trip.end_date
    ? Math.max(1, Math.round((new Date(`${trip.end_date}T12:00:00Z`).getTime() - new Date(`${trip.start_date}T12:00:00Z`).getTime()) / (86400 * 1000)) + 1)
    : 0;

  const totalExpenses = expList.reduce((a, e) => a + Number(e.amount || 0), 0);

  // Cities visited (unique places from activities)
  const cities = new Set<string>();
  const destinations = (trip.destination || "").split(/\s*·\s*/).map((s: string) => s.trim()).filter(Boolean);
  for (const d of destinations) cities.add(d);

  // Activity kinds breakdown
  const kindCounts: Record<string, number> = {};
  for (const a of actList) {
    const k = a.activity_kind || "visit";
    kindCounts[k] = (kindCounts[k] || 0) + 1;
  }

  // Rough km (sum of haversine between consecutive activities with coords)
  function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
    return R * 2 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2));
  }
  const withCoords = actList.filter((a) => a.latitude && a.longitude).map((a) => ({ lat: a.latitude!, lng: a.longitude! }));
  let km = 0;
  for (let i = 1; i < withCoords.length; i++) km += haversineKm(withCoords[i-1]!, withCoords[i]!);

  return (
    <TripRecapClient
      tripId={tripId}
      tripName={trip.name || "Mi viaje"}
      destination={trip.destination}
      startDate={trip.start_date}
      endDate={trip.end_date}
      totalDays={totalDays}
      activitiesCount={actList.length}
      totalExpenses={totalExpenses}
      currency={trip.base_currency || "EUR"}
      participantsCount={participantsCount ?? 1}
      cities={Array.from(cities)}
      kindCounts={kindCounts}
      kmTravelled={Math.round(km)}
    />
  );
}
