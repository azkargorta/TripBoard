import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import TripPlanView from "@/components/trip/plan/TripPlanView";
import TripScreenActions from "@/components/trip/common/TripScreenActions";
import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";
import Link from "next/link";

export default async function TripPlanPage({
  params,
}: {
  params: { id: string };
}) {
  const access = await requireTripAccess(params.id);
  const supabase = await createClient();
  const isPremium = await isPremiumEnabledForTrip({ supabase, userId: access.userId, tripId: params.id });

  return (
    <main className="space-y-8">
      <TripBoardPageHeader
        section="Plan del viaje"
        title="Plan"
        description={
          isPremium
            ? "Añade lugares, fechas, horas y coordenadas. Todo lo guardado aquí se reutiliza en el mapa para crear rutas y organizar el viaje."
            : "Plan gratuito: añade lugares y horarios manualmente. Sin autocompletar, sin coordenadas y sin mapa."
        }
        actions={<TripScreenActions tripId={params.id} />}
      />

      {!isPremium ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-amber-950">
                Autocompletar, coordenadas y mapa interactivo solo en la versión premium.
              </div>
              <div className="mt-1 text-sm text-amber-900/80">
                Puedes seguir usando el plan en modo manual, o mejorar a Premium para desbloquear mapas y rutas interactivas.
              </div>
            </div>
            <Link
              href="/account?upgrade=premium&focus=premium#premium-plans"
              className="inline-flex min-h-[40px] items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Mejorar a Premium
            </Link>
          </div>
        </section>
      ) : null}

      <TripPlanView tripId={params.id} premiumEnabled={isPremium} />
    </main>
  );
}
