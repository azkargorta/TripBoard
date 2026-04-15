import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import TripHomeActions from "@/components/trip/home/TripHomeActions";
import TripWeatherCard from "@/components/trip/home/TripWeatherCard";
import TripTripBasicsEditor from "@/components/trip/home/TripTripBasicsEditor";
import { computePersonalBalance } from "@/lib/personal-balance";
import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";
import TripScreenActions from "@/components/trip/common/TripScreenActions";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";
import TripFirstRunPanel from "@/components/trip/home/TripFirstRunPanel";
import { Bell, CalendarDays, Wallet } from "lucide-react";

type TripPageProps = {
  params: {
    id: string;
  };
};

type TripRow = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  base_currency: string | null;
};

type ParticipantRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  email: string | null;
  user_id: string | null;
  status: string | null;
  role?: string | null;
  can_manage_trip?: boolean | null;
};

type ProfileRow = {
  full_name: string | null;
  username: string | null;
  email: string | null;
};

type ActivityRow = {
  id: string;
  title: string;
  activity_date: string | null;
  activity_time: string | null;
  place_name: string | null;
  address: string | null;
  activity_kind: string | null;
  activity_type: string | null;
};

type RouteRow = {
  id: string;
  route_day?: string | null;
  route_date?: string | null;
  day_date?: string | null;
};

type ExpenseRow = {
  id: string;
  amount: number | string | null;
  amount_in_base?: number | string | null;
  currency: string | null;
  payer_name?: string | null;
  participant_names?: unknown;
  paid_by_names?: unknown;
  owed_by_names?: unknown;
  paid_by_participant_id: string | null;
  split_between: unknown;
};

type ResourceRow = {
  id: string;
};

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start && !end) return "Fechas por definir";
  if (start && end) return `${formatDate(start)} — ${formatDate(end)}`;
  return start ? `Desde ${formatDate(start)}` : `Hasta ${formatDate(end)}`;
}

function amountValue(value: string | number | null | undefined) {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isTripInProgress(start: string | null, end: string | null, today: string) {
  if (!start || !end) return false;
  return start <= today && today <= end;
}

function isFutureTrip(start: string | null, today: string) {
  return !!start && start > today;
}

function parseActivityMoment(activity: ActivityRow) {
  if (!activity.activity_date) return null;
  const time =
    activity.activity_time && /^\d{2}:\d{2}/.test(activity.activity_time)
      ? `${activity.activity_time}:00`
      : "23:59:59";
  const value = new Date(`${activity.activity_date}T${time}`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function isLodging(activity: ActivityRow) {
  const kind = String(activity.activity_kind || "").trim().toLowerCase();
  const type = String(activity.activity_type || "").trim().toLowerCase();
  return kind === "lodging" || type === "lodging";
}

export default async function TripPage({ params }: TripPageProps) {
  const tripId = params.id;
  const access = await requireTripAccess(tripId);
  const supabase = await createClient();
  const isPremium = await isPremiumEnabledForTrip({ supabase, userId: access.userId, tripId });

  const [
    { data: trip, error: tripError },
    { data: participantsData, error: participantsError },
    { data: profileData, error: profileError },
    { data: activitiesData, error: activitiesError },
    { data: routesData, error: routesError },
    { data: expensesData, error: expensesError },
    { data: resourcesData, error: resourcesError },
  ] = await Promise.all([
    supabase
      .from("trips")
      .select("id, name, destination, start_date, end_date, base_currency")
      .eq("id", tripId)
      .maybeSingle(),
    supabase
      .from("trip_participants")
      .select("id, display_name, username, email, user_id, status, role, can_manage_trip")
      .eq("trip_id", tripId)
      .neq("status", "removed")
      .order("created_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("full_name, username, email")
      .eq("id", access.userId)
      .maybeSingle(),
    supabase
      .from("trip_activities")
      .select(
        "id, title, activity_date, activity_time, place_name, address, activity_kind, activity_type"
      )
      .eq("trip_id", tripId)
      .order("activity_date", { ascending: true })
      .order("activity_time", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("trip_routes").select("id, route_day, route_date, day_date").eq("trip_id", tripId),
    supabase
      .from("trip_expenses")
      .select(
        "id, amount, currency, payer_name, participant_names, paid_by_names, owed_by_names, paid_by_participant_id, split_between"
      )
      .eq("trip_id", tripId),
    supabase.from("trip_resources").select("id").eq("trip_id", tripId),
  ]);

  if (tripError || !trip) {
    console.error("Error cargando viaje:", tripError);
    redirect("/dashboard");
  }

  if (participantsError) console.error("Error cargando participantes:", participantsError);
  if (profileError) console.error("Error cargando perfil:", profileError);
  if (activitiesError) console.error("Error cargando actividades:", activitiesError);
  if (routesError) console.error("Error cargando rutas:", routesError);
  if (expensesError) console.error("Error cargando gastos:", expensesError);
  if (resourcesError) console.error("Error cargando recursos:", resourcesError);

  const currentTrip = trip as TripRow;
  const participants = ((participantsData ?? []) as ParticipantRow[]).filter(
    (item) => item.status !== "removed"
  );
  const currentParticipant =
    participants.find((participant) => participant.id === access.participantId) ?? null;
  const canEditTrip = Boolean(
    currentParticipant &&
      ((currentParticipant.role ?? access.role) === "owner" || currentParticipant.can_manage_trip)
  );
  const currentProfile = (profileData ?? null) as ProfileRow | null;
  const activities = (activitiesData ?? []) as ActivityRow[];
  const routes = (routesData ?? []) as RouteRow[];
  const expenses = (expensesData ?? []) as ExpenseRow[];
  const resources = (resourcesData ?? []) as ResourceRow[];

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const activeToday = isTripInProgress(currentTrip.start_date, currentTrip.end_date, today);
  const futureTrip = isFutureTrip(currentTrip.start_date, today);
  const todayActivities = activities.filter((activity) => activity.activity_date === today);
  const nextActivity =
    activities
      .map((activity) => ({ activity, when: parseActivityMoment(activity) }))
      .filter((item): item is { activity: ActivityRow; when: Date } => !!item.when)
      .find((item) => item.when.getTime() >= now.getTime())?.activity ?? null;

  const ownBalance = computePersonalBalance({
    currentParticipant,
    currentProfile,
    expenses,
    participants,
  });

  const nextCheckIn =
    activities
      .filter((a) => isLodging(a))
      .map((activity) => ({ activity, when: parseActivityMoment(activity) }))
      .filter((item): item is { activity: ActivityRow; when: Date } => !!item.when)
      .find((item) => {
        const delta = item.when.getTime() - now.getTime();
        return delta >= 0 && delta <= 24 * 60 * 60 * 1000;
      })?.activity ?? null;

  const totalSpent = expenses.reduce(
    (sum, expense) => sum + amountValue(expense.amount_in_base ?? expense.amount),
    0
  );

  const alerts = [
    !currentTrip.destination ? "Añade el destino del viaje para activar clima y contexto." : null,
    participants.length === 0 ? "Este viaje no tiene participantes visibles." : null,
    activities.length === 0 ? "No hay actividades en el plan todavía." : null,
    routes.length === 0 ? "Todavía no has creado rutas en el mapa." : null,
    expenses.length === 0 ? "Aún no hay gastos añadidos al split." : null,
    resources.length === 0 ? "No has subido recursos o reservas todavía." : null,
    ownBalance.matchedBy === "none"
      ? "No se ha podido enlazar tu balance con los gastos. Revisa que tu nombre de participante coincida con el usado en los gastos."
      : null,
  ].filter(Boolean) as string[];

  const moduleCards = [
    {
      href: `/trip/${tripId}/plan`,
      title: "Plan",
      subtitle: "Agenda, visitas y horarios",
      iconSrc: "/brand/tabs/plan.png",
      iconAlt: "Plan",
      metric: `${activities.length} actividades`,
      accent: "from-sky-100 to-cyan-50 border-sky-200",
    },
    {
      href: `/trip/${tripId}/map`,
      title: "Mapa",
      subtitle: "Rutas, trayectos y paradas",
      iconSrc: "/brand/tabs/map.png",
      iconAlt: "Mapa",
      metric: `${routes.length} rutas`,
      accent: "from-emerald-100 to-teal-50 border-emerald-200",
    },
    {
      href: `/trip/${tripId}/expenses`,
      title: "Gastos",
      subtitle: "Split, pagos y balances",
      iconSrc: "/brand/tabs/expenses.png",
      iconAlt: "Gastos",
      metric: `${totalSpent.toFixed(2)} ${currentTrip.base_currency || "EUR"}`,
      accent: "from-amber-100 to-orange-50 border-amber-200",
    },
    {
      href: `/trip/${tripId}/participants`,
      title: "Participantes",
      subtitle: "Viajeros, roles y permisos",
      iconSrc: "/brand/tabs/participants.png",
      iconAlt: "Participantes",
      metric: `${participants.length} viajeros`,
      accent: "from-violet-100 to-fuchsia-50 border-violet-200",
    },
    {
      href: `/trip/${tripId}/resources`,
      title: "Recursos y listas",
      subtitle: "Tickets, reservas, docs y listas",
      iconSrc: "/brand/tabs/resources.png",
      iconAlt: "Recursos",
      metric: `${resources.length} recursos`,
      accent: "from-slate-100 to-slate-50 border-slate-200",
    },
    {
      href: `/trip/${tripId}/ai-chat`,
      title: "Chat IA",
      subtitle: "Consulta y organiza el viaje",
      iconSrc: "/brand/tabs/ai.png",
      iconAlt: "Chat IA",
      metric: nextActivity ? "Con contexto del viaje" : "Listo para ayudarte",
      accent: "from-pink-100 to-rose-50 border-pink-200",
    },
  ];

  return (
    <main className="space-y-8">
      <TripBoardPageHeader
        section={activeToday ? "Viaje en curso" : futureTrip ? "Viaje futuro" : "Resumen del viaje"}
        title={currentTrip.name}
        description={`${currentTrip.destination || "Destino pendiente"} · ${formatDateRange(currentTrip.start_date, currentTrip.end_date)}`}
        actions={<TripScreenActions tripId={tripId} showSummary={false} homeLabel="Mis viajes" />}
      />

      <TripFirstRunPanel
        tripId={tripId}
        tripName={currentTrip.name}
        canEditTrip={canEditTrip}
        counts={{
          participants: participants.length,
          activities: activities.length,
          routes: routes.length,
          expenses: expenses.length,
          resources: resources.length,
        }}
      />

      {nextCheckIn || Math.abs(ownBalance.net) >= 0.01 ? (
        <section className="card-soft p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <Bell className="h-4 w-4" aria-hidden />
                Recordatorios
              </div>
              <div className="mt-2 text-sm text-slate-600">
                Alertas rápidas dentro de Kaviro (check-ins y pagos del split).
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/trip/${tripId}/plan`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                <CalendarDays className="h-4 w-4" aria-hidden />
                Ver plan
              </Link>
              <Link
                href={`/trip/${tripId}/expenses`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                <Wallet className="h-4 w-4" aria-hidden />
                Ver gastos
              </Link>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-950">Check-in en 24h</div>
              {nextCheckIn ? (
                <div className="mt-2 text-sm text-slate-700">
                  <div className="font-bold text-slate-950">{nextCheckIn.title || "Alojamiento"}</div>
                  <div className="mt-1 text-xs text-slate-600">
                    {nextCheckIn.activity_date ? formatDate(nextCheckIn.activity_date) : "Sin fecha"}
                    {nextCheckIn.activity_time ? ` · ${nextCheckIn.activity_time.slice(0, 5)}` : ""}
                    {nextCheckIn.place_name || nextCheckIn.address ? ` · ${nextCheckIn.place_name || nextCheckIn.address}` : ""}
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-sm text-slate-600">No hay check-ins en las próximas 24 horas.</div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-950">Pagos del split</div>
              <div className="mt-2 text-sm text-slate-700">
                {ownBalance.net <= -0.01 ? (
                  <span>
                    Te falta por pagar aproximadamente{" "}
                    <span className="font-bold text-rose-700">{Math.abs(ownBalance.net).toFixed(2)} {currentTrip.base_currency || "EUR"}</span>.
                  </span>
                ) : ownBalance.net >= 0.01 ? (
                  <span>
                    Te deben aproximadamente{" "}
                    <span className="font-bold text-emerald-700">{ownBalance.net.toFixed(2)} {currentTrip.base_currency || "EUR"}</span>.
                  </span>
                ) : (
                  <span>No parece que tengas pagos pendientes ahora mismo.</span>
                )}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Basado en los gastos añadidos. Para “quién debe a quién”, revisa Balances y pagos.
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="card-soft p-6 md:p-8">
        <div className="grid gap-6 md:grid-cols-[1.8fr_1fr]">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Datos principales
              </div>
              <TripTripBasicsEditor
                tripId={tripId}
                destination={currentTrip.destination}
                startDate={currentTrip.start_date}
                endDate={currentTrip.end_date}
                baseCurrency={currentTrip.base_currency}
                canEdit={canEditTrip}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Fechas</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {formatDateRange(currentTrip.start_date, currentTrip.end_date)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Lugar</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {currentTrip.destination || "Sin destino"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Participantes</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{participants.length} viajeros</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Moneda</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{currentTrip.base_currency || "EUR"}</p>
              </div>
            </div>

            <TripHomeActions trip={currentTrip} />
          </div>

          <div className="rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">Próxima actividad</p>
            {nextActivity ? (
              <div className="mt-4 space-y-3">
                <div className="inline-flex items-center rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">
                  {nextActivity.activity_date ? formatDate(nextActivity.activity_date) : "Sin fecha"}
                  {nextActivity.activity_time ? ` · ${nextActivity.activity_time.slice(0, 5)}` : ""}
                </div>
                <h2 className="text-2xl font-bold text-slate-950">{nextActivity.title}</h2>
                <p className="text-sm text-slate-600">
                  {nextActivity.place_name || nextActivity.address || "Ubicación pendiente"}
                </p>
                <p className="text-sm font-medium text-violet-700">
                  {nextActivity.activity_kind || nextActivity.activity_type || "Actividad del plan"}
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-violet-300 bg-white/70 p-4 text-sm text-slate-600">
                No hay una próxima actividad programada. Añade algo al plan para verla aquí.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Accesos rápidos: plegable en móvil, siempre visible en desktop */}
      <section className="md:hidden">
        <details className="card-soft overflow-hidden" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-950">Accesos rápidos</h2>
              <p className="mt-1 text-sm text-slate-600">Plan, gastos, mapa, participantes y más.</p>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              Abrir
            </span>
          </summary>
          <div className="px-5 pb-5">
            <div className="grid gap-3">
              {moduleCards.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className={`group rounded-2xl border bg-gradient-to-br p-4 transition active:scale-[0.99] ${item.accent}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      {"iconSrc" in item && item.iconSrc ? (
                        <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-white/70 ring-1 ring-slate-200">
                          <Image
                            src={item.iconSrc}
                            alt={item.iconAlt || item.title}
                            width={40}
                            height={40}
                            className="h-full w-full object-contain object-center scale-[1.18]"
                          />
                        </span>
                      ) : (
                        <span className="text-2xl" aria-hidden>
                          {(item as any).emoji}
                        </span>
                      )}
                      <div>
                        <p className="text-sm font-bold text-slate-950">{item.title}</p>
                        <p className="mt-0.5 text-sm text-slate-600">{item.subtitle}</p>
                        <p className="mt-2 text-xs font-semibold text-slate-700">{item.metric}</p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-slate-500">→</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </details>
      </section>

      <section className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-3">
        {moduleCards.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className={`group rounded-3xl border bg-gradient-to-br p-5 transition hover:-translate-y-0.5 hover:shadow-lg ${item.accent}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-3xl">
                  {"iconSrc" in item && item.iconSrc ? (
                    <span className="inline-flex h-[54px] w-[54px] items-center justify-center overflow-hidden rounded-2xl bg-white/70 ring-1 ring-slate-200">
                      <Image
                        src={item.iconSrc}
                        alt={item.iconAlt || item.title}
                        width={54}
                        height={54}
                        className="h-full w-full object-contain object-center scale-[1.18]"
                      />
                    </span>
                  ) : (
                    (item as any).emoji
                  )}
                </div>
                <h2 className="mt-4 text-xl font-bold text-slate-950">{item.title}</h2>
                <p className="mt-1 text-sm text-slate-600">{item.subtitle}</p>
              </div>
              <div className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700">
                Entrar
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3">
              <span className="text-sm font-semibold text-slate-800">{item.metric}</span>
              <span className="text-sm text-slate-500 transition group-hover:translate-x-0.5">→</span>
            </div>
          </Link>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        {isPremium ? (
          <TripWeatherCard tripId={tripId} destination={currentTrip.destination} />
        ) : (
          <section className="card-soft p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Clima</p>
                <h3 className="mt-1 text-2xl font-bold text-slate-950">Próximos 7 días</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Funcionalidad disponible solo con el plan Premium.
                </p>
              </div>
              <Link
                href="/account?upgrade=premium&focus=premium#premium-plans"
                className="inline-flex min-h-[40px] items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Mejorar a Premium
              </Link>
            </div>
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              La meteorología está deshabilitada en la versión gratuita.
            </div>
          </section>
        )}

        <div className="space-y-6">
          {/* En móvil, plegamos los bloques largos */}
          <details className="card-soft overflow-hidden md:open" open>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 md:cursor-default">
              <h3 className="text-xl font-bold text-slate-950">Hoy toca</h3>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 md:hidden">
                Ver
              </span>
            </summary>
            <div className="px-5 pb-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                {activeToday ? (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                    Hoy estás de viaje
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    Aún no toca hoy
                  </span>
                )}
              </div>
 
              {activeToday && todayActivities.length > 0 ? (
                <div className="space-y-3">
                  {todayActivities.slice(0, 4).map((activity) => (
                    <div key={activity.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{activity.title}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {activity.place_name || activity.address || "Ubicación pendiente"}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                          {activity.activity_time ? activity.activity_time.slice(0, 5) : "Sin hora"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                  {activeToday
                    ? "No hay actividades planificadas para hoy."
                    : "Este bloque se activará cuando el viaje coincida con la fecha actual."}
                </div>
              )}
            </div>
          </details>

          <details className="card-soft overflow-hidden md:open" open>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 md:cursor-default">
              <h3 className="text-xl font-bold text-slate-950">Tu balance</h3>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 md:hidden">
                Ver
              </span>
            </summary>
            <div className="px-5 pb-5">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {currentParticipant?.display_name || currentProfile?.full_name || currentProfile?.username || "Tu usuario"}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Balance enlazado por {ownBalance.matchedBy === "mixed" ? "nombres e IDs" : ownBalance.matchedBy === "names" ? "nombres" : ownBalance.matchedBy === "ids" ? "IDs de participante" : "sin coincidencia"}.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Has pagado</p>
                  <p className="mt-2 text-xl font-bold text-slate-950">
                    {ownBalance.paid.toFixed(2)} {currentTrip.base_currency || "EUR"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Te corresponde</p>
                  <p className="mt-2 text-xl font-bold text-slate-950">
                    {ownBalance.owed.toFixed(2)} {currentTrip.base_currency || "EUR"}
                  </p>
                </div>
                <div
                  className={`rounded-2xl border p-4 ${
                    ownBalance.net >= 0 ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"
                  }`}
                >
                  <p
                    className={`text-xs font-semibold uppercase tracking-[0.16em] ${
                      ownBalance.net >= 0 ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    Balance neto
                  </p>
                  <p
                    className={`mt-2 text-xl font-bold ${
                      ownBalance.net >= 0 ? "text-emerald-900" : "text-rose-900"
                    }`}
                  >
                    {ownBalance.net >= 0 ? "+" : ""}
                    {ownBalance.net.toFixed(2)} {currentTrip.base_currency || "EUR"}
                  </p>
                </div>
              </div>
            </div>
          </details>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <details className="card-soft overflow-hidden md:open" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-6 md:cursor-default">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold text-slate-950">Resumen rápido</h3>
              <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 md:inline-flex">
                Vista general
              </span>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 md:hidden">
              Ver
            </span>
          </summary>
          <div className="px-6 pb-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm text-slate-500">Plan</p>
                <p className="mt-2 text-3xl font-bold text-slate-950">{activities.length}</p>
                <p className="mt-1 text-sm text-slate-600">elementos en agenda</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm text-slate-500">Mapa</p>
                <p className="mt-2 text-3xl font-bold text-slate-950">{routes.length}</p>
                <p className="mt-1 text-sm text-slate-600">rutas creadas</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm text-slate-500">Recursos</p>
                <p className="mt-2 text-3xl font-bold text-slate-950">{resources.length}</p>
                <p className="mt-1 text-sm text-slate-600">archivos y reservas</p>
              </div>
            </div>
          </div>
        </details>

        <details className="card-soft overflow-hidden md:open" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-6 md:cursor-default">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold text-slate-950">Alertas del viaje</h3>
              <span className="hidden rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 md:inline-flex">
                Revisión rápida
              </span>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 md:hidden">
              Ver
            </span>
          </summary>
          <div className="px-6 pb-6">
            {alerts.length > 0 ? (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={alert}
                    className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                  >
                    {alert}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
                Todo va bien: el viaje ya tiene información clave en plan, mapa, gastos y recursos.
              </div>
            )}
          </div>
        </details>
      </section>
    </main>
  );
}
