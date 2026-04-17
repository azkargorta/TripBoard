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
import { parseActivityLocalMoment } from "@/lib/trip-activity-moment";

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

function pickNextPlan(activities: ActivityRow[], todayYmd: string, now: Date): ActivityRow | null {
  const items = activities.map((a) => ({ a, when: parseActivityLocalMoment(a) }));
  const valid = items.filter((i): i is { a: ActivityRow; when: Date } => i.when !== null);
  const upcoming = valid.filter((i) => i.when.getTime() >= now.getTime());
  if (upcoming.length) {
    upcoming.sort((x, y) => x.when.getTime() - y.when.getTime());
    return upcoming[0]!.a;
  }
  const futureDays = activities
    .filter((a) => a.activity_date && a.activity_date > todayYmd)
    .sort(
      (a, b) =>
        (a.activity_date || "").localeCompare(b.activity_date || "") ||
        String(a.activity_time || "").localeCompare(String(b.activity_time || ""), "en")
    );
  if (futureDays.length) return futureDays[0]!;
  return null;
}

function truncateHint(s: string, max = 52) {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
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
    { data: lastExpenseRow },
    { data: lastResourceRow },
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
    supabase.from("trip_expenses").select("title").eq("trip_id", tripId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("trip_resources").select("title").eq("trip_id", tripId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
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

  const nextActivity = pickNextPlan(activities, todayStr, now);

  const plansToday: Array<TripSummaryActivityPreview & { isPast: boolean }> = activities
    .filter((a) => a.activity_date === todayStr)
    .map((a) => {
      const w = parseActivityLocalMoment(a);
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
      const wa = parseActivityLocalMoment(a as ActivityRow);
      const wb = parseActivityLocalMoment(b as ActivityRow);
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

  const lastExpenseTitle =
    typeof (lastExpenseRow as { title?: string } | null)?.title === "string"
      ? String((lastExpenseRow as { title: string }).title).trim()
      : "";
  const lastResourceTitle =
    typeof (lastResourceRow as { title?: string } | null)?.title === "string"
      ? String((lastResourceRow as { title: string }).title).trim()
      : "";

  const alerts = [
    !currentTrip.destination ? "Añade el destino para activar clima y contexto." : null,
    (participantsCount ?? 0) <= 1 ? "Añade participantes si vais a viajar en grupo." : null,
    (activitiesCount ?? 0) === 0 ? "Todavía no hay planes: crea tu primer plan en la pestaña Plan." : null,
    (routesCount ?? 0) === 0 ? "Aún no hay rutas: usa Mapa para crear trayectos." : null,
    (expensesCount ?? 0) === 0 ? "Aún no hay gastos: añade el primer gasto para ver balances." : null,
  ].filter(Boolean) as string[];

  const planHint = nextActivity
    ? `Siguiente: ${truncateHint(nextActivity.title)}`
    : (activitiesCount ?? 0) > 0
      ? "Hay actividades: revisa fechas en Plan si no ves un “siguiente”."
      : null;
  const mapHint =
    (routesCount ?? 0) === 0 ? "Aún sin rutas: enlaza paradas del plan en el mapa." : "Edita trayectos y paradas aquí.";
  const expensesHint =
    lastExpenseTitle ? `Último gasto: ${truncateHint(lastExpenseTitle, 44)}` : (expensesCount ?? 0) > 0 ? "Abre Gastos para ver el detalle." : "Registra el primer gasto para balances.";
  const peopleHint =
    (participantsCount ?? 0) <= 1 ? "Invita al grupo con el enlace de participantes." : "Roles y permisos por persona.";
  const resourcesHint = lastResourceTitle ? `Último doc: ${truncateHint(lastResourceTitle, 44)}` : (resourcesCount ?? 0) > 0 ? "Revisa reservas y archivos." : "Sube billetes o PDFs cuando los tengas.";
  const aiHint = isPremium ? "Pide rutas, un itinerario o cambios con contexto del viaje." : "Desbloquea el asistente con Premium.";

  const tabs: TripSummaryTabDef[] = [
    {
      href: `/trip/${tripId}/plan`,
      label: "Plan",
      subtitle: "Itinerario, notas del viaje y actividades por día",
      metric: `${activitiesCount ?? 0} planes`,
      iconSrc: "/brand/tabs/plan.png",
      tone: "cyan",
      hint: planHint,
    },
    {
      href: `/trip/${tripId}/map`,
      label: "Mapa",
      subtitle: "Rutas, trayectos y paradas sobre el mapa",
      metric: `${routesCount ?? 0} rutas`,
      iconSrc: "/brand/tabs/map.png",
      tone: "emerald",
      hint: mapHint,
    },
    {
      href: `/trip/${tripId}/expenses`,
      label: "Gastos",
      subtitle: "Split, pagos y balances del grupo",
      metric: `${expensesCount ?? 0} gastos`,
      iconSrc: "/brand/tabs/expenses.png",
      tone: "amber",
      hint: expensesHint,
    },
    {
      href: `/trip/${tripId}/participants`,
      label: "Gente",
      subtitle: "Invitaciones, roles y permisos",
      metric: `${participantsCount ?? 0} ${(participantsCount ?? 0) === 1 ? "persona" : "personas"}`,
      iconSrc: "/brand/tabs/participants.png",
      tone: "slate",
      hint: peopleHint,
    },
    {
      href: `/trip/${tripId}/resources`,
      label: "Recursos",
      subtitle: "Documentos, reservas y listas",
      metric: `${resourcesCount ?? 0} ítems`,
      iconSrc: "/brand/tabs/documents.png",
      tone: "rose",
      hint: resourcesHint,
    },
    {
      href: `/trip/${tripId}/ai-chat`,
      label: "IA del viaje",
      subtitle: isPremium ? "Chat con el contexto de este viaje" : "Requiere plan Premium",
      metric: isPremium ? "Premium activo" : "Ver Premium",
      iconSrc: "/brand/tabs/ai.png",
      tone: "violet",
      hint: aiHint,
    },
  ];

  return (
    <main className="space-y-5 md:space-y-6">
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
