import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";
import { getTripWeatherByDestination } from "@/lib/trip-weather";
import { parseActivityLocalMoment } from "@/lib/trip-activity-moment";
import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";
import TripScreenActions from "@/components/trip/common/TripScreenActions";
import TripOverviewClient from "@/components/trip/overview/TripOverviewClient";

type Props = { params: { id: string } };

function formatDate(v: string | null) {
  if (!v) return null;
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit", month: "long", year: "numeric",
  }).format(new Date(`${v}T12:00:00`));
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function todayYMD() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

export default async function TripOverviewPage({ params }: Props) {
  const tripId = params.id;
  const access = await requireTripAccess(tripId);
  const supabase = await createClient();
  const isPremium = await isPremiumEnabledForTrip({ supabase, userId: access.userId, tripId });

  // ── Fetch all data in parallel ─────────────────────────────────────────────
  const [
    { data: tripRow },
    { count: activitiesCount, data: activitiesData },
    { count: expensesCount, data: expenseAmounts },
    { count: participantsCount },
    { count: resourcesCount },
  ] = await Promise.all([
    supabase.from("trips").select("id, name, destination, start_date, end_date, base_currency").eq("id", tripId).maybeSingle(),
    supabase.from("trip_activities").select("id, title, activity_date, activity_time, place_name, address, activity_kind, latitude, longitude", { count: "exact" }).eq("trip_id", tripId),
    supabase.from("trip_expenses").select("amount, currency", { count: "exact" }).eq("trip_id", tripId),
    supabase.from("trip_participants").select("id", { count: "exact" }).eq("trip_id", tripId).neq("status", "removed"),
    supabase.from("trip_resources").select("id", { count: "exact" }).eq("trip_id", tripId),
  ]);

  const trip = tripRow as { id: string; name: string; destination: string | null; start_date: string | null; end_date: string | null; base_currency: string | null } | null;
  if (!trip) return <div className="p-8 text-slate-500">Viaje no encontrado.</div>;

  const today = todayYMD();
  const startDate = trip.start_date;
  const endDate = trip.end_date;

  // Trip phase
  let phase: "before" | "during" | "after" = "before";
  let daysUntilStart: number | null = null;
  let daysUntilEnd: number | null = null;
  let daysElapsed: number | null = null;
  let totalTripDays: number | null = null;

  if (startDate && endDate) {
    totalTripDays = daysBetween(startDate, endDate) + 1;
    if (today < startDate) {
      phase = "before";
      daysUntilStart = daysBetween(today, startDate);
    } else if (today > endDate) {
      phase = "after";
      daysElapsed = totalTripDays;
    } else {
      phase = "during";
      daysElapsed = daysBetween(startDate, today) + 1;
      daysUntilEnd = daysBetween(today, endDate);
    }
  }

  // Next activity
  const activities = Array.isArray(activitiesData) ? activitiesData : [];
  const now = new Date();
  const upcomingActivities = activities
    .map((a) => ({ a, when: parseActivityLocalMoment(a as any) }))
    .filter((x): x is { a: typeof activities[0]; when: Date } => x.when !== null && x.when.getTime() >= now.getTime())
    .sort((x, y) => x.when.getTime() - y.when.getTime());

  const nextActivity = upcomingActivities[0]?.a ?? null;

  // Today's activities
  const todayActivities = activities
    .filter((a) => a.activity_date === today)
    .sort((a, b) => String(a.activity_time || "").localeCompare(String(b.activity_time || "")));

  // Expenses summary
  const currency = trip.base_currency || "EUR";
  let totalExpenses = 0;
  for (const e of (expenseAmounts || []) as Array<{ amount: unknown; currency: string | null }>) {
    const n = Number(e.amount);
    if (Number.isFinite(n)) totalExpenses += n;
  }

  // Weather
  const weather = await getTripWeatherByDestination(trip.destination);

  // Completion percentage
  const completedActivities = activities.filter(
    (a) => a.activity_date && a.activity_date < today
  ).length;
  const completionPct = (activitiesCount ?? 0) > 0
    ? Math.round((completedActivities / (activitiesCount ?? 1)) * 100)
    : 0;

  return (
    <main className="space-y-6">
      <TripBoardPageHeader
        section="Resumen"
        title={trip.name}
        description={[
          trip.destination,
          startDate && endDate ? `${formatDate(startDate)} — ${formatDate(endDate)}` : null,
        ].filter(Boolean).join(" · ")}
        iconSrc="/brand/tabs/plan.png"
        iconAlt="Overview"
        actions={<TripScreenActions tripId={tripId} />}
      />

      <TripOverviewClient
        tripId={tripId}
        tripName={trip.name}
        destination={trip.destination}
        startDate={startDate}
        endDate={endDate}
        phase={phase}
        daysUntilStart={daysUntilStart}
        daysUntilEnd={daysUntilEnd}
        daysElapsed={daysElapsed}
        totalTripDays={totalTripDays}
        activitiesCount={activitiesCount ?? 0}
        completedActivities={completedActivities}
        completionPct={completionPct}
        expensesCount={expensesCount ?? 0}
        totalExpenses={totalExpenses}
        currency={currency}
        participantsCount={participantsCount ?? 0}
        resourcesCount={resourcesCount ?? 0}
        nextActivity={nextActivity ? {
          id: nextActivity.id,
          title: nextActivity.title,
          activity_date: nextActivity.activity_date,
          activity_time: nextActivity.activity_time,
          place_name: nextActivity.place_name,
          activity_kind: nextActivity.activity_kind,
        } : null}
        todayActivities={todayActivities.map((a) => ({
          id: a.id,
          title: a.title,
          activity_time: a.activity_time,
          activity_kind: a.activity_kind,
          place_name: a.place_name,
        }))}
        weather={weather}
        isPremium={isPremium}
        canEdit={access.can_manage_plan}
      />
    </main>
  );
}
