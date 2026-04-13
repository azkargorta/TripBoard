import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/auth/SignOutButton";
import CreateTripSection from "@/components/dashboard/CreateTripSection";
import TripBoardLogo from "@/components/brand/TripBoardLogo";
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
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
            {badge}
          </div>
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-slate-950">{trip.name}</h3>
            <p className="mt-1 text-sm text-slate-600">{trip.destination || "Destino pendiente"}</p>
          </div>
        </div>

        <div className="rounded-full bg-white/75 px-3 py-1 text-xs font-semibold text-slate-700">
          {locked ? "Premium" : "Entrar"}
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-white/75 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Fechas</p>
        <p className="mt-2 text-sm font-semibold text-slate-900">{formatRange(trip.start_date, trip.end_date)}</p>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <span>{trip.destination || "Viaje"}</span>
        <span className="transition group-hover:translate-x-0.5">→</span>
      </div>
    </>
  );

  if (locked) {
    return (
      <div className={`rounded-3xl border bg-gradient-to-br p-5 opacity-80 ${accent}`}>
        {content}
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
          Viaje guardado. Hazte Premium para acceder.
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/trip/${trip.id}`}
      className={`group block rounded-3xl border bg-gradient-to-br p-5 transition hover:-translate-y-0.5 hover:shadow-lg ${accent}`}
    >
      {content}
    </Link>
  );
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
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
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
  const newestTripId = trips?.[0]?.id ? String(trips[0].id) : null;
  const lockedTripIds = new Set<string>();
  if (!isPremium && newestTripId) {
    for (const t of trips) {
      if (String(t.id) !== newestTripId) lockedTripIds.add(String(t.id));
    }
  }

  return (
    <main className="page-shell space-y-8">
      <section className="card-soft overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-violet-900 p-6 text-white md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
                <TripBoardLogo variant="light" size="sm" withWordmark={false} />
                <span className="text-white/40" aria-hidden>
                  •
                </span>
                <span>Dashboard</span>
              </div>
              <div>
                <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">Tus viajes</h1>
                <p className="mt-2 max-w-2xl text-base text-white/75 md:text-lg">
                  Tu panel principal con la misma línea visual de la portada de cada viaje.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {isAdmin ? (
                <Link
                  href="/dashboard/admin"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-400/20 px-4 py-2 text-sm font-semibold text-amber-50 transition hover:bg-amber-400/30"
                >
                  Administración
                </Link>
              ) : null}
              <Link
                href="/"
                className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Inicio
              </Link>
              <SignOutButton />
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-4 md:p-8">
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
      </section>

      {!isPremium ? (
        <section className="card-soft p-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Plan gratuito</p>
            <p className="text-lg font-bold text-slate-950">
              Tienes 1 viaje activo. Para ver viajes anteriores y usar IA/Mapa, pásate a Premium.
            </p>
            <p className="text-sm text-slate-600">
              Tus viajes anteriores se guardan, pero quedan bloqueados hasta Premium.
            </p>
          </div>
        </section>
      ) : null}

      <section className="card-soft p-6 md:p-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">Crear nuevo viaje</h2>
            <p className="mt-1 text-sm text-slate-600">Añádelo aquí y aparecerá automáticamente en su categoría.</p>
          </div>
        </div>
        <CreateTripSection isPremium={isPremium} hasAnyTrip={Boolean(newestTripId)} />
      </section>

      {trips.length === 0 ? (
        <div className="card-soft p-6 text-slate-600">
          Todavía no tienes viajes creados. Crea tu primer viaje arriba.
        </div>
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
