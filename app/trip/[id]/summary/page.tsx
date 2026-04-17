import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";
import TripScreenActions from "@/components/trip/common/TripScreenActions";
import TripFirstRunPanel from "@/components/trip/home/TripFirstRunPanel";
import { CalendarDays, MapPinned, Wallet } from "lucide-react";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";

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
  const nextActivity =
    activities
      .map((activity) => ({ activity, when: parseActivityMoment(activity) }))
      .filter((item): item is { activity: ActivityRow; when: Date } => !!item.when)
      .find((item) => item.when.getTime() >= now.getTime())?.activity ?? null;

  const alerts = [
    !currentTrip.destination ? "Añade el destino para activar clima y contexto." : null,
    (participantsCount ?? 0) <= 1 ? "Añade participantes si vais a viajar en grupo." : null,
    (activitiesCount ?? 0) === 0 ? "Todavía no hay planes: crea tu primer plan en la pestaña Plan." : null,
    (routesCount ?? 0) === 0 ? "Aún no hay rutas: usa Mapa para crear trayectos." : null,
    (expensesCount ?? 0) === 0 ? "Aún no hay gastos: añade el primer gasto para ver balances." : null,
  ].filter(Boolean) as string[];

  const quick = [
    {
      href: `/trip/${tripId}/plan`,
      title: "Plan",
      subtitle: "Añadir y organizar actividades",
      icon: <CalendarDays className="h-4 w-4" aria-hidden />,
      metric: `${activitiesCount ?? 0} planes`,
    },
    {
      href: `/trip/${tripId}/map`,
      title: "Mapa",
      subtitle: "Rutas, trayectos y paradas",
      icon: <MapPinned className="h-4 w-4" aria-hidden />,
      metric: `${routesCount ?? 0} rutas`,
    },
    {
      href: `/trip/${tripId}/expenses`,
      title: "Gastos",
      subtitle: "Split y balances",
      icon: <Wallet className="h-4 w-4" aria-hidden />,
      metric: `${expensesCount ?? 0} gastos`,
    },
  ];

  return (
    <main className="space-y-6">
      <TripBoardPageHeader
        section="Resumen del viaje"
        title={currentTrip.name}
        description={`${currentTrip.destination || "Destino pendiente"} · ${formatDateRange(currentTrip.start_date, currentTrip.end_date)}`}
        iconSrc="/brand/tabs/plan.png"
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

      <section className="grid gap-3 md:grid-cols-3">
        {quick.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-extrabold text-slate-950">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
                    {item.icon}
                  </span>
                  {item.title}
                </div>
                <div className="mt-1 text-xs text-slate-600">{item.subtitle}</div>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                {item.metric}
              </span>
            </div>
          </Link>
        ))}
      </section>

      {nextActivity ? (
        <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5 shadow-sm">
          <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-violet-700">Próximo plan</div>
          <div className="mt-2 text-lg font-extrabold text-slate-950">{nextActivity.title}</div>
          <div className="mt-1 text-sm text-slate-700">
            {(nextActivity.activity_date ? formatDate(nextActivity.activity_date) : "Sin fecha") +
              (nextActivity.activity_time ? ` · ${nextActivity.activity_time.slice(0, 5)}` : "")}
          </div>
          <div className="mt-1 text-sm text-slate-600">{nextActivity.place_name || nextActivity.address || "Ubicación pendiente"}</div>
          <div className="mt-4">
            <Link
              href={`/trip/${tripId}/plan`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              Ir a Plan
            </Link>
          </div>
        </section>
      ) : null}

      {alerts.length ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="text-sm font-extrabold text-amber-900">Siguientes pasos</div>
          <ul className="mt-3 space-y-2 text-sm text-amber-950">
            {alerts.slice(0, 4).map((a) => (
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
          <div className="mt-1 text-sm text-emerald-950">El viaje ya tiene plan, mapa y gastos en marcha. Sigue organizando desde Plan.</div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold text-slate-950">Recursos</div>
            <div className="mt-1 text-xs text-slate-600">Reservas, documentos y listas del viaje.</div>
          </div>
          <span className="text-sm font-semibold text-slate-700">{resourcesCount ?? 0}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/trip/${tripId}/resources`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Ver recursos
          </Link>
          <Link
            href={`/trip/${tripId}/ai-chat`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Abrir IA
          </Link>
        </div>
      </section>
    </main>
  );
}

