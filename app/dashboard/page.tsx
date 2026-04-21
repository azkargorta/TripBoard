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
import { surfaceAccentCyan } from "@/components/ui/brandStyles";
import { Sparkles } from "lucide-react";

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

  return (
    <main className="page-shell space-y-4 pb-8 md:space-y-5 md:pb-10">
      <OnboardingNudge hasTrips={trips.length > 0} />

      <DashboardPageHeader isAdmin={isAdmin} />

      <section
        className={`mx-auto max-w-2xl px-4 py-4 md:px-5 md:py-5 ${surfaceAccentCyan} dark:border-slate-700/50 dark:bg-slate-950/40`}
      >
        <DashboardCreateFlowStepper isPremium={isPremium} />

        <div className="mx-auto max-w-md">
          <DashboardCreateTripCta disabled={freeTripLimitReached} />
        </div>

        <div className="mx-auto mt-4 max-w-2xl border-t border-slate-100 pt-4 md:mt-5 md:pt-5 dark:border-slate-700/50">
          {isPremium ? (
            <>
              <p className="text-center text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
                Asistente personal
              </p>
              <p className="mx-auto mt-1 max-w-lg text-center text-xs text-slate-600 md:text-sm dark:text-slate-300">
                Tras crear el viaje, el asistente te guía con propuestas. También puedes abrirlo en cualquier viaje desde
                la pestaña del mismo nombre.
              </p>
              <DashboardAiShortcuts trips={trips} isPremium />
            </>
          ) : (
            <>
              <p className="text-center text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600 dark:text-slate-300">
                Plan gratuito
              </p>
              <p className="mx-auto mt-1 max-w-lg text-center text-xs text-slate-600 md:text-sm dark:text-slate-300">
                Sigue los 6 pasos del recuadro superior. Al pulsar <strong className="text-slate-800">Crear viaje</strong> y abrir el
                formulario verás una guía detallada en el mismo orden.
              </p>
              <div className="mt-4 flex justify-center">
                <Link
                  href="/account?upgrade=premium&focus=premium#premium-plans"
                  className="group inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-amber-100/60 px-3 py-2.5 text-center text-xs font-semibold text-amber-950 shadow-sm ring-1 ring-slate-900/[0.02] transition hover:border-amber-300 hover:shadow-md active:translate-y-[0.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 sm:w-auto sm:min-w-[260px] sm:text-sm"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm ring-1 ring-white/20">
                    <Sparkles className="h-4 w-4" aria-hidden />
                  </span>
                  <span>Asistente personal y más con Premium</span>
                </Link>
              </div>
            </>
          )}
        </div>

        <div
          id="create-trip"
          className="mx-auto mt-4 max-w-2xl scroll-mt-20 border-t border-slate-100 pt-4 md:mt-5 md:pt-5 dark:border-slate-700/50"
        >
          <CreateTripSection isPremium={isPremium} tripCount={trips.length} />
        </div>
      </section>

      {!isPremium ? (
        <section className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-700 md:text-sm dark:border-slate-700/50 dark:bg-slate-950/40 dark:text-slate-200">
          <span className="font-semibold text-slate-900 dark:text-slate-50">Plan gratuito:</span> hasta 3 viajes. Premium desbloquea el
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
            accent="from-violet-100 to-fuchsia-50 border-violet-200"
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
