import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/auth/SignOutButton";
import CreateTripSection from "@/components/dashboard/CreateTripSection";
import TripBoardLogo from "@/components/brand/TripBoardLogo";
import { isPlatformAdmin } from "@/lib/platform-admin";
import TripCardItem from "@/components/dashboard/TripCardItem";
import OnboardingNudge from "@/components/dashboard/OnboardingNudge";
import DashboardQuickActions from "@/components/dashboard/DashboardQuickActions";

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

function formatRange(start: string | null, end: string | null) {
  if (!start && !end) return "Fechas por definir";
  if (start && end) return `${formatDate(start)} — ${formatDate(end)}`;
  return start ? `Desde ${formatDate(start)}` : `Hasta ${formatDate(end)}`;
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
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-slate-950 sm:text-2xl">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>
        <div className="shrink-0 self-start rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 sm:self-auto">
          {trips.length} viaje{trips.length === 1 ? "" : "s"}
        </div>
      </div>

      {trips.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-5 text-sm text-slate-600">
          No hay viajes en esta categoría.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
  // Nota: en plan gratuito se permite abrir/ver todos los viajes; solo se limita la creación (API/UI).

  return (
    <main className="page-shell space-y-8">
      <OnboardingNudge hasTrips={trips.length > 0} />
      <section className="card-soft overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-900 p-4 text-white sm:p-6 md:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-3 sm:space-y-4">
              <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/85 backdrop-blur sm:px-4 sm:text-sm sm:tracking-[0.18em]">
                <TripBoardLogo variant="light" size="md" withWordmark />
                <span className="text-white/35" aria-hidden>
                  ·
                </span>
                <span className="opacity-90">Dashboard</span>
              </div>
              <div className="min-w-0">
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">Tus viajes</h1>
                <p className="mt-2 max-w-2xl text-sm text-white/75 sm:text-base md:text-lg">
                  Itinerario, mapa, gastos y rutas en un solo panel. Crea un viaje o abre el asistente personal si tienes Premium.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 sm:gap-3">
              {isAdmin ? (
                <Link
                  href="/dashboard/admin"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-400/20 px-4 py-2 text-sm font-semibold text-amber-50 transition hover:bg-amber-400/30"
                >
                  Administración
                </Link>
              ) : null}
              <Link
                href="/pricing"
                className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Precios
              </Link>
              <Link
                href="/account"
                className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Cuenta
              </Link>
              <SignOutButton />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/40 p-4 sm:p-6 md:p-8">
          <DashboardQuickActions isPremium={isPremium} recentTripId={recentTripId} />
        </div>

        <details className="group border-t border-slate-200 bg-white">
          <summary className="cursor-pointer list-none px-4 py-4 text-sm font-semibold text-slate-800 marker:content-none sm:px-6 md:px-8 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-2">
              Ver conteo por estado
              <span className="text-xs font-normal text-slate-500 group-open:hidden">(en curso, futuros…)</span>
            </span>
          </summary>
          <div className="grid grid-cols-2 gap-3 px-4 pb-6 sm:grid-cols-2 sm:gap-4 sm:px-6 md:grid-cols-4 md:px-8">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">En curso</p>
              <p className="mt-2 text-3xl font-bold text-slate-950">{current.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Futuros</p>
              <p className="mt-2 text-3xl font-bold text-slate-950">{future.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Pasados</p>
              <p className="mt-2 text-3xl font-bold text-slate-950">{past.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Sin fecha cerrada</p>
              <p className="mt-2 text-3xl font-bold text-slate-950">{unscheduled.length}</p>
            </div>
          </div>
        </details>
      </section>

      {!isPremium ? (
        <section className="card-soft p-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Plan gratuito</p>
            <p className="text-lg font-bold text-slate-950">
              Puedes crear hasta 3 viajes. Para usar el asistente personal y el análisis de documentos, pásate a Premium.
            </p>
            <p className="text-sm text-slate-600">
              Tus viajes se guardan y puedes acceder a todos. Premium añade el asistente personal y funciones avanzadas.
            </p>
          </div>
        </section>
      ) : null}

      <section id="create-trip" className="card-soft p-6 md:p-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">Crear nuevo viaje</h2>
            <p className="mt-1 text-sm text-slate-600">Añádelo aquí y aparecerá automáticamente en su categoría.</p>
          </div>
        </div>
              <CreateTripSection isPremium={isPremium} tripCount={trips.length} />
      </section>

      {trips.length === 0 ? (
        <section className="card-soft p-6 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Primeros pasos
              </p>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-950">
                Crea tu primer viaje y empieza a organizarlo
              </h2>
              <p className="text-sm text-slate-600">
                Consejo: solo el nombre es obligatorio. Lo demás puedes rellenarlo más tarde.
              </p>
            </div>
            <a
              href="#create-trip"
              className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Ir a crear viaje
            </a>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">1) Crea el viaje</p>
              <p className="mt-1 text-sm text-slate-600">Nombre + destino opcional.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">2) Invita a tu grupo</p>
              <p className="mt-1 text-sm text-slate-600">Comparte el enlace y listo.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">3) Añade gastos y plan</p>
              <p className="mt-1 text-sm text-slate-600">Todo en el mismo panel.</p>
            </div>
          </div>
        </section>
      ) : (
        <div className="space-y-8">
          <TripSection
            title="Viajes en curso"
            subtitle="Lo que estás viviendo ahora mismo."
            trips={current}
            badge="En curso"
            accent="from-emerald-100 to-teal-50 border-emerald-200"
            lockedTripIds={lockedTripIds}
          />
          <TripSection
            title="Viajes futuros"
            subtitle="Lo próximo que tienes preparado."
            trips={future}
            badge="Próximo"
            accent="from-sky-100 to-cyan-50 border-sky-200"
            lockedTripIds={lockedTripIds}
          />
          <TripSection
            title="Viajes pasados"
            subtitle="Tus viajes ya finalizados."
            trips={past}
            badge="Finalizado"
            accent="from-slate-100 to-slate-50 border-slate-200"
            lockedTripIds={lockedTripIds}
          />
          {unscheduled.length > 0 ? (
            <TripSection
              title="Viajes sin fecha cerrada"
              subtitle="Pendientes de definir o completar."
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
