import TripPlanView from "@/components/trip/plan/TripPlanView";
import TripTabActions from "@/components/trip/common/TripTabActions";
import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";
import { requireTripAccess } from "@/lib/trip-access";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";

export default async function TripPlanPage({
  params,
}: {
  params: { id: string };
}) {
  const access = await requireTripAccess(params.id);
  const supabase = await createClient();
  const isPremium = await isPremiumEnabledForTrip({ supabase, userId: access.userId, tripId: params.id });
  if (!isPremium) {
    redirect(`/trip/${params.id}/plan?upgrade=premium&reason=maps_ai_locked`);
  }

  return (
    <main className="space-y-8">
      <TripBoardPageHeader
        section="Plan del viaje"
        title="Plan"
        description="Añade lugares, fechas, horas y coordenadas. Todo lo guardado aquí se reutiliza en el mapa para crear rutas y organizar el viaje."
        iconSrc="/brand/tabs/plan.png"
        iconAlt="Plan"
        actions={<TripTabActions tripId={params.id} />}
      />

      <TripPlanView tripId={params.id} premiumEnabled />
    </main>
  );
}
