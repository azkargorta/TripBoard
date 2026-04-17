import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/auth/SignOutButton";
import CreateTripSection from "@/components/dashboard/CreateTripSection";
import TripCardItem from "@/components/dashboard/TripCardItem";
import OnboardingNudge from "@/components/dashboard/OnboardingNudge";
import { isPlatformAdmin } from "@/lib/platform-admin";

type Trip = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at?: string | null;
};

type TripParticipantRow = {
  trip_id: string;
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

function categorizeTrips(trips: Trip[]) {
  const today = new Date().toISOString().slice(0, 10);

  const current: Trip[] = [];
  const future: Trip[] = [];
  const past: Trip[] = [];
  const unscheduled: Trip[] = [];

  for (const trip of trips) {
    const start = trip.start_date;
    const end = trip.end_date;

    if (!start && !end) {
      unscheduled.push(trip);
      continue;
    }

    if (start && end && start <= today && today <= end) {
      current.push(trip);
      continue;
    }

    if (start && start > today) {
      future.push(trip);
      continue;
    }

    if (end && end < today) {
      past.push(trip);
      continue;
    }

    if (start && !end && start > today) {
      future.push(trip);
      continue;
    }

    if (start && !end && start <= today) {
      current.push(trip);
      continue;
    }

    past.push(trip);
  }

  return { current, future, past, unscheduled };
}

function TripCard({
  trip,
  badge,
  accent,
  locked,
}: {
  trip: Trip;
  badge: string;
  accent: string;
  locked: boolean;
}) {
  return <TripCardItem trip={trip} badge={badge} accent={accent} locked={locked} />;
}

function TripSection({
  title,
  subtitle,
  trips,
  badge,
  accent,
  lockedTripIds,
}: {
  title: string;
  subtitle: string;
  trips: Trip[];
  badge: string;
  accent: string;
  lockedTripIds: Set<string>;
}) {
  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="shrink-0 self-start rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm sm:self-auto">
          {trips.length} viaje{trips.length === 1 ? "" : "s"}
        </div>
      </div>

      {trips.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center text-sm text-slate-500">
          No hay viajes en esta categoría.
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              badge={badge}
              accent={accent}
              locked={lockedTripIds.has(String(trip.id))}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const isAdmin = await isPlatformAdmin(user.id, user.email);

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("is_premium")
    .eq("id", user.id)
    .maybeSingle();
  const isPremium = Boolean((profileRow as any)?.is_premium);

  const { data: participantRows, error: participantsError } = await supabase
    .from("trip_participants")
    .select("trip_id")
    .eq("user_id", user.id);

  if (participantsError) {
    console.error("Error cargando participaciones del usuario:", participantsError);
  }

  const tripIds = ((participantRows ?? []) as TripParticipantRow[])
    .map((row) => row.trip_id)
    .filter(Boolean);

  let trips: Trip[] = [];

  if (tripIds.length > 0) {
    const { data: tripsData, error: tripsError } = await supabase
      .from("trips")
      .select("id, name, destination, start_date, end_date, created_at")
      .in("id", tripIds)
      .order("created_at", { ascending: false });

    if (tripsError) {
      console.error("Error cargando viajes del usuario:", tripsError);
    } else {
      trips = (tripsData ?? []) as Trip[];
    }
  }

  const { current, future, past, unscheduled } = categorizeTrips(trips);
  const lockedTripIds = new Set<string>();
  const recentTripId = trips[0]?.id ?? null;
  const recentChatHref = recentTripId ? `/trip/${encodeURIComponent(recentTripId)}/ai-chat` : null;

  return (
    <main className="page-shell space-y-12 pb-16 md:space-y-16 md:pb-20">
      <OnboardingNudge hasTrips={trips.length > 0} />

      <header className="flex flex-col gap-6 border-b border-slate-200/90 pb-10 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 max-w-2xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Dashboard</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 md:text-4xl">Tus viajes</h1>
          <p className="text-base leading-relaxed text-slate-600 md:text-lg">
            Un solo camino: <span className="font-semibold text-slate-800">crear el viaje</span>, dejar que el{" "}
            <span className="font-semibold text-slate-800">asistente personal</span> proponga plan y rutas (Premium), y{" "}
            <span className="font-semibold text-slate-800">editar</span> cuando quieras en Plan, Rutas o Gastos.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-2 md:justify-end">
          {isAdmin ? (
            <Link
              href="/dashboard/admin"
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 transition hover:bg-amber-100"
            >
              Admin
            </Link>
          ) : null}
          <Link
            href="/pricing"
            className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Precios
          </Link>
          <Link
            href="/account"
            className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Cuenta
          </Link>
          <SignOutButton />
        </nav>
      </header>

      <section className="rounded-[28px] border border-slate-200/90 bg-white px-6 py-10 shadow-sm md:px-12 md:py-12">
        <ol className="mb-8 flex flex-wrap gap-6 text-sm text-slate-500 md:gap-10">
          <li className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white">
              1
            </span>
            <span className="font-medium text-slate-800">Crear viaje</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-slate-50 text-xs font-bold text-slate-600">
              2
            </span>
            <span>Asistente (borrador)</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-slate-50 text-xs font-bold text-slate-600">
              3
            </span>
            <span>Editar a tu gusto</span>
          </li>
        </ol>

        <div className="mx-auto max-w-xl space-y-4">
          <a
            href="#create-trip"
            className="flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-slate-950 px-6 py-4 text-center text-lg font-bold text-white shadow-md transition hover:bg-slate-800 md:min-h-[64px] md:text-xl"
          >
            Crear viaje
          </a>
          <p className="text-center text-xs text-slate-500">Nombre obligatorio; destino y fechas cuando quieras.</p>
        </div>

        <div className="mx-auto mt-10 max-w-2xl border-t border-slate-100 pt-10">
          <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-violet-700">Asistente personal</p>
          <p className="mx-auto mt-2 max-w-lg text-center text-sm text-slate-600">
            Tras crear el viaje, el asistente te guía con propuestas. También puedes abrirlo en cualquier viaje desde la
            pestaña del mismo nombre.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
            {isPremium ? (
              <>
                <a
                  href="#create-trip"
                  className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border-2 border-violet-300 bg-violet-50/80 px-4 py-3 text-center text-sm font-semibold text-violet-950 shadow-sm transition hover:bg-violet-50 sm:min-w-[220px] sm:flex-none"
                  title="Al guardar, abrimos el asistente para montar el viaje"
                >
                  ✨ Crear viaje con asistente personal
                </a>
                {recentChatHref ? (
                  <>
                    <Link
                      href={recentChatHref}
                      className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 sm:min-w-[200px] sm:flex-none"
                    >
                      Optimizar viaje
                    </Link>
                    <Link
                      href={recentChatHref}
                      className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 sm:min-w-[220px] sm:flex-none"
                    >
                      Añadir planes automáticamente
                    </Link>
                  </>
                ) : (
                  <p className="w-full text-center text-sm text-slate-500">
                    Crea un viaje y estos atajos usarán tu último viaje para abrir el asistente con contexto.
                  </p>
                )}
              </>
            ) : (
              <Link
                href="/account?upgrade=premium&focus=premium#premium-plans"
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-950 transition hover:bg-amber-100 sm:w-auto sm:min-w-[280px]"
              >
                ✨ Crear con asistente personal (Premium)
              </Link>
            )}
          </div>
        </div>
      </section>

      {!isPremium ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-50/80 px-6 py-5 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">Plan gratuito:</span> hasta 3 viajes. Premium desbloquea el
          asistente personal y el análisis de documentos.
        </section>
      ) : null}

      <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            Resumen por estado
            <span className="text-xs font-normal text-slate-500 group-open:hidden">en curso, futuros…</span>
          </span>
        </summary>
        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 px-5 pb-6 pt-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/90 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">En curso</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{current.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/90 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Futuros</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{future.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/90 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pasados</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{past.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/90 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sin fecha</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{unscheduled.length}</p>
          </div>
        </div>
      </details>

      <section id="create-trip" className="rounded-[28px] border border-slate-200/90 bg-white px-6 py-8 shadow-sm md:px-10 md:py-10">
        <h2 className="text-xl font-bold text-slate-950 md:text-2xl">Datos del viaje</h2>
        <p className="mt-2 text-sm text-slate-600">
          Rellena el formulario y guarda. Si tienes Premium, después te llevamos al asistente para generar o pulir el
          plan.
        </p>
        <div className="mt-8">
          <CreateTripSection isPremium={isPremium} tripCount={trips.length} startWithFormOpen={trips.length === 0} />
        </div>
      </section>

      {trips.length === 0 ? null : (
        <div className="space-y-14">
          <TripSection
            title="En curso"
            subtitle="Lo que estás viviendo ahora."
            trips={current}
            badge="En curso"
            accent="from-emerald-100 to-teal-50 border-emerald-200"
            lockedTripIds={lockedTripIds}
          />
          <TripSection
            title="Próximos"
            subtitle="Viajes con fecha futura."
            trips={future}
            badge="Próximo"
            accent="from-sky-100 to-cyan-50 border-sky-200"
            lockedTripIds={lockedTripIds}
          />
          <TripSection
            title="Pasados"
            subtitle="Viajes ya cerrados en el calendario."
            trips={past}
            badge="Finalizado"
            accent="from-slate-100 to-slate-50 border-slate-200"
            lockedTripIds={lockedTripIds}
          />
          {unscheduled.length > 0 ? (
            <TripSection
              title="Sin fechas cerradas"
              subtitle="Define inicio y fin cuando puedas."
              trips={unscheduled}
              badge="Pendiente"
              accent="from-amber-100 to-orange-50 border-amber-200"
              lockedTripIds={lockedTripIds}
            />
          ) : null}
        </div>
      )}
    </main>
  );
}
