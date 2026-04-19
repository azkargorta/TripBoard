import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreateTripSection from "@/components/dashboard/CreateTripSection";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import DashboardCreateTripCta from "@/components/dashboard/DashboardCreateTripCta";
import OnboardingNudge from "@/components/dashboard/OnboardingNudge";
import DashboardAiShortcuts from "@/components/dashboard/DashboardAiShortcuts";
import DashboardTripSection from "@/components/dashboard/DashboardTripSection";
import DashboardCreateFlowStepper from "@/components/dashboard/DashboardCreateFlowStepper";
import { isPlatformAdmin } from "@/lib/platform-admin";

type Trip = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  base_currency: string | null;
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
      .select("id, name, destination, start_date, end_date, base_currency, created_at")
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
  const freeTripLimitReached = !isPremium && trips.length >= 3;

  const dashboardIntro = (
    <>
      Un solo camino: <span className="font-semibold text-slate-800">crear el viaje</span>, dejar que el{" "}
      <span className="font-semibold text-slate-800">asistente personal</span> proponga plan y rutas (Premium), y{" "}
      <span className="font-semibold text-slate-800">editar</span> cuando quieras en Plan, Rutas o Gastos.
    </>
  );

  return (
    <main className="page-shell space-y-6 pb-10 md:space-y-8 md:pb-14">
      <OnboardingNudge hasTrips={trips.length > 0} />

      <DashboardPageHeader isAdmin={isAdmin} intro={dashboardIntro} />

      <section className="rounded-2xl border border-slate-200/90 bg-white px-5 py-6 shadow-sm md:rounded-[24px] md:px-8 md:py-7">
        <DashboardCreateFlowStepper isPremium={isPremium} />

        <div className="mx-auto max-w-xl">
          <DashboardCreateTripCta disabled={freeTripLimitReached} />
        </div>

        <div className="mx-auto mt-6 max-w-2xl border-t border-slate-100 pt-6">
          {isPremium ? (
            <>
              <p className="text-center text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700">
                Asistente personal
              </p>
              <p className="mx-auto mt-1 max-w-lg text-center text-xs text-slate-600 md:text-sm">
                Tras crear el viaje, el asistente te guía con propuestas. También puedes abrirlo en cualquier viaje desde
                la pestaña del mismo nombre.
              </p>
              <DashboardAiShortcuts trips={trips} isPremium />
            </>
          ) : (
            <>
              <p className="text-center text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600">Plan gratuito</p>
              <p className="mx-auto mt-1 max-w-lg text-center text-xs text-slate-600 md:text-sm">
                Sigue los 6 pasos del recuadro superior. Al pulsar <strong className="text-slate-800">Crear viaje</strong> y abrir el
                formulario verás una guía detallada en el mismo orden.
              </p>
              <div className="mt-4 flex justify-center">
                <Link
                  href="/account?upgrade=premium&focus=premium#premium-plans"
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border-2 border-amber-200 bg-amber-50 px-3 py-2.5 text-center text-xs font-semibold text-amber-950 transition hover:bg-amber-100 sm:w-auto sm:min-w-[260px] sm:text-sm"
                >
                  ✨ Asistente personal y más con Premium
                </Link>
              </div>
            </>
          )}
        </div>

        <div id="create-trip" className="mx-auto mt-6 max-w-2xl scroll-mt-20 border-t border-slate-100 pt-6">
          <CreateTripSection isPremium={isPremium} tripCount={trips.length} />
        </div>
      </section>

      {!isPremium ? (
        <section className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-700 md:text-sm">
          <span className="font-semibold text-slate-900">Plan gratuito:</span> hasta 3 viajes. Premium desbloquea el
          asistente personal y el análisis de documentos.
        </section>
      ) : null}

      {trips.length === 0 ? null : (
        <div className="space-y-5">
          <DashboardTripSection
            title="En curso"
            subtitle="Lo que estás viviendo ahora."
            trips={current}
            badge="En curso"
            accent="from-emerald-100 to-teal-50 border-emerald-200"
            lockedTripIds={Array.from(lockedTripIds)}
          />
          <DashboardTripSection
            title="Próximos"
            subtitle="Viajes con fecha futura."
            trips={future}
            badge="Próximo"
            accent="from-sky-100 to-cyan-50 border-sky-200"
            lockedTripIds={Array.from(lockedTripIds)}
          />
          <DashboardTripSection
            title="Pasados"
            subtitle="Viajes ya cerrados en el calendario."
            trips={past}
            badge="Finalizado"
            accent="from-slate-100 to-slate-50 border-slate-200"
            lockedTripIds={Array.from(lockedTripIds)}
          />
          {unscheduled.length > 0 ? (
            <DashboardTripSection
              title="Sin fechas cerradas"
              subtitle="Define inicio y fin cuando puedas."
              trips={unscheduled}
              badge="Pendiente"
              accent="from-amber-100 to-orange-50 border-amber-200"
              lockedTripIds={Array.from(lockedTripIds)}
            />
          ) : null}
        </div>
      )}
    </main>
  );
}
