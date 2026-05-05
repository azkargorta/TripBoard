import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import TripTodayClient from "@/components/trip/today/TripTodayClient";

type Props = { params: { id: string } };

function todayYMD() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

export default async function TripTodayPage({ params }: Props) {
  const tripId = params.id;
  const access = await requireTripAccess(tripId);
  const supabase = await createClient();
  const today = todayYMD();

  const [{ data: trip }, { data: activities }] = await Promise.all([
    supabase.from("trips").select("id, name, destination, start_date, end_date").eq("id", tripId).maybeSingle(),
    supabase.from("trip_activities")
      .select("id, title, description, activity_date, activity_time, place_name, address, latitude, longitude, activity_kind, activity_type")
      .eq("trip_id", tripId)
      .gte("activity_date", today)
      .order("activity_date")
      .order("activity_time")
      .limit(20),
  ]);

  if (!trip) redirect(`/trip/${tripId}`);

  // Check if trip is active today
  const tripStart = trip.start_date || "";
  const tripEnd = trip.end_date || "";
  const isActive = today >= tripStart && today <= tripEnd;

  // Today's activities
  const todayActivities = (activities || []).filter((a) => a.activity_date === today);
  // Next upcoming (after today)
  const upcoming = (activities || []).filter((a) => a.activity_date && a.activity_date > today).slice(0, 3);

  return (
    <TripTodayClient
      tripId={tripId}
      tripName={trip.name || "Mi viaje"}
      destination={trip.destination}
      today={today}
      isActive={isActive}
      tripStart={tripStart}
      tripEnd={tripEnd}
      todayActivities={todayActivities}
      upcoming={upcoming}
      canEdit={access.can_manage_plan}
    />
  );
}
