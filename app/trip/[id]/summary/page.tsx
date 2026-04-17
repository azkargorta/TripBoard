import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";
import TripScreenActions from "@/components/trip/common/TripScreenActions";
import TripFirstRunPanel from "@/components/trip/home/TripFirstRunPanel";
import TripSummaryOverview, {
  type TripSummaryActivityPreview,
  type TripSummaryTabDef,
} from "@/components/trip/summary/TripSummaryOverview";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";
import { getTripWeatherByDestination } from "@/lib/trip-weather";

type TripPageProps = {
  params: { id: string };
};

type TripRow = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  base_currency: string | null;
};

type ActivityRow = {
  id: string;
  title: string;
  activity_date: string | null;
  activity_time: string | null;
  place_name: string | null;
  address: string | null;
};

const CALENDAR_TZ = "Europe/Madrid";

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start && !end) return "Fechas por definir";
  if (start && end) return `${formatDate(start)} — ${formatDate(end)}`;
  return start ? `Desde ${formatDate(start)}` : `Hasta ${formatDate(end)}`;
}

function calendarDayYMD(timeZone: string, d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function parseActivityMoment(activity: ActivityRow) {
  if (!activity.activity_date) return null;
  const time =
    activity.activity_time && /^\d{2}:\d{2}/.test(activity.activity_time) ? `${activity.activity_time}:00` : "23:59:59";
  const value = new Date(`${activity.activity_date}T${time}`);
  return Number.isNaN(value.getTime()) ? null : value;
}

export default async function TripSummaryPage({ params }: TripPageProps) {
  const tripId = params.id;
  const access = await requireTripAccess(tripId);
  const supabase = await createClient();
  const isPremium = await isPremiumEnabledForTrip({ supabase, userId: access.userId, tripId });

  const [
    { data: trip, error: tripError },
    { count: participantsCount },
    { count: activitiesCount, data: activitiesData },
    { count: routesCount },
    { count: expensesCount },
    { count: resourcesCount },
  ] = await Promise.all([
    supabase.from("trips").select("id, name, destination, start_date, end_date, base_currency").eq("id", tripId).maybeSingle(),
    supabase.from("trip_participants").select("id", { count: "exact", head: true }).eq("trip_id", tripId).neq("status", "removed"),
    supabase
      .from("trip_activities")
      .select("id, title, activity_date, activity_time, place_name, address", { count: "exact" })
      .eq("trip_id", tripId)
      .order("activity_date", { ascending: true })
      .order("activity_time", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("trip_routes").select("id", { count: "exact", head: true }).eq("trip_id", tripId),
    supabase.from("trip_expenses").select("id", { count: "exact", head: true }).eq("trip_id", tripId),
    supabase.from("trip_resources").select("id", { count: "exact", head: true }).eq("trip_id", tripId),
  ]);

  if (tripError || !trip) {
    console.error("Error cargando viaje:", tripError);
    redirect("/dashboard");
  }

  const currentTrip = trip as TripRow;
  const activities = (activitiesData ?? []) as ActivityRow[];

  const now = new Date();
  const todayStr = calendarDayYMD(CALENDAR_TZ, now);
  const todayLabel = new Intl.DateTimeFormat("es-ES", {
    timeZone: CALENDAR_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);

  const nextActivity =
    activities
      .map((activity) => ({ activity, when: parseActivityMoment(activity) }))
      .filter((item): item is { activity: ActivityRow; when: Date } => !!item.when)
      .find((item) => item.when.getTime() >= now.getTime())?.activity ?? null;

  const plansToday: Array<TripSummaryActivityPreview & { isPast: boolean }> = activities
    .filter((a) => a.activity_date === todayStr)
    .map((a) => {
      const w = parseActivityMoment(a);
      return {
        id: a.id,
        title: a.title,
        activity_date: a.activity_date,
        activity_time: a.activity_time,
        place_name: a.place_name,
        address: a.address,
        isPast: w ? w.getTime() < now.getTime() : false,
      };
    })
    .sort((a, b) => {
      const wa = parseActivityMoment(a as ActivityRow);
      const wb = parseActivityMoment(b as ActivityRow);
      if (!wa && !wb) return 0;
      if (!wa) return 1;
      if (!wb) return -1;
      return wa.getTime() - wb.getTime();
    });

  const nextPlanPreview: TripSummaryActivityPreview | null = nextActivity
    ? {
        id: nextActivity.id,
        title: nextActivity.title,
        activity_date: nextActivity.activity_date,
        activity_time: nextActivity.activity_time,
        place_name: nextActivity.place_name,
        address: nextActivity.address,
      }
    : null;

  const weather = await getTripWeatherByDestination(currentTrip.destination);
  const destTrim = (currentTrip.destination ?? "").trim();
  const weatherHint = !destTrim ? "no-destination" : !weather ? "unavailable" : "ok";

  const alerts = [
    !currentTrip.destination ? "Añade el destino para activar clima y contexto." : null,
    (participantsCount ?? 0) <= 1 ? "Añade participantes si vais a viajar en grupo." : null,
    (activitiesCount ?? 0) === 0 ? "Todavía no hay planes: crea tu primer plan en la pestaña Plan." : null,
    (routesCount ?? 0) === 0 ? "Aún no hay rutas: usa Mapa para crear trayectos." : null,
    (expensesCount ?? 0) === 0 ? "Aún no hay gastos: añade el primer gasto para ver balances." : null,
  ].filter(Boolean) as string[];

  const tabs: TripSummaryTabDef[] = [
    {
      href: `/trip/${tripId}/plan`,
      label: "Plan",
      subtitle: "Itinerario, notas del viaje y actividades por día",
      metric: `${activitiesCount ?? 0} planes`,
      iconSrc: "/brand/tabs/plan.png",
      tone: "cyan",
    },
    {
      href: `/trip/${tripId}/map`,
      label: "Mapa",
      subtitle: "Rutas, trayectos y paradas sobre el mapa",
      metric: `${routesCount ?? 0} rutas`,
      iconSrc: "/brand/tabs/map.png",
      tone: "emerald",
    },
    {
      href: `/trip/${tripId}/expenses`,
      label: "Gastos",
      subtitle: "Split, pagos y balances del grupo",
      metric: `${expensesCount ?? 0} gastos`,
      iconSrc: "/brand/tabs/expenses.png",
      tone: "amber",
    },
    {
      href: `/trip/${tripId}/participants`,
      label: "Gente",
      subtitle: "Invitaciones, roles y permisos",
      metric: `${participantsCount ?? 0} ${(participantsCount ?? 0) === 1 ? "persona" : "personas"}`,
      iconSrc: "/brand/tabs/participants.png",
      tone: "slate",
    },
    {
      href: `/trip/${tripId}/resources`,
      label: "Recursos",
      subtitle: "Documentos, reservas y listas",
      metric: `${resourcesCount ?? 0} ítems`,
      iconSrc: "/brand/tabs/documents.png",
      tone: "rose",
    },
    {
      href: `/trip/${tripId}/ai-chat`,
      label: "IA del viaje",
      subtitle: isPremium ? "Chat con el contexto de este viaje" : "Requiere plan Premium",
      metric: isPremium ? "Premium activo" : "Ver Premium",
      iconSrc: "/brand/tabs/ai.png",
      tone: "violet",
    },
  ];

  return (
    <main className="space-y-8">
      <TripBoardPageHeader
        section="Resumen del viaje"
        title={currentTrip.name}
        description={`${currentTrip.destination || "Destino pendiente"} · ${formatDateRange(currentTrip.start_date, currentTrip.end_date)}`}
        iconSrc="/brand/tabs/calendar.png"
        iconAlt="Resumen"
        actions={<TripScreenActions tripId={tripId} showSummary={false} homeLabel="Mis viajes" />}
      />

      <TripFirstRunPanel
        tripId={tripId}
        tripName={currentTrip.name}
        isPremium={isPremium}
        counts={{
          participants: participantsCount ?? 0,
          activities: activitiesCount ?? 0,
          routes: routesCount ?? 0,
          expenses: expensesCount ?? 0,
          resources: resourcesCount ?? 0,
        }}
      />

      <TripSummaryOverview
        tripId={tripId}
        weather={weather}
        weatherHint={weatherHint}
        todayLabel={todayLabel}
        plansToday={plansToday}
        nextPlan={nextPlanPreview}
        tabs={tabs}
      />

      {alerts.length ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="text-sm font-extrabold text-amber-900">Siguientes pasos</div>
          <ul className="mt-3 space-y-2 text-sm text-amber-950">
            {alerts.slice(0, 5).map((a) => (
              <li key={a} className="flex gap-2">
                <span aria-hidden>•</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <div className="text-sm font-extrabold text-emerald-900">Todo listo</div>
          <div className="mt-1 text-sm text-emerald-950">
            El viaje tiene contenido en las distintas áreas. Sigue desde las tarjetas de arriba o el menú lateral.
          </div>
        </section>
      )}
    </main>
  );
}
