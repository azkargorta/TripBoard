import TripPlanView from "@/components/trip/plan/TripPlanView";
import TripTabActions from "@/components/trip/common/TripTabActions";
import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";
import { requireTripAccess } from "@/lib/trip-access";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function TripPlanPage({
  params,
}: {
  params: { id: string };
}) {
  const access = await requireTripAccess(params.id);
  const supabase = await createClient();
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("is_premium")
    .eq("id", access.userId)
    .maybeSingle();
  const isPremium = Boolean((profileRow as any)?.is_premium);
  if (!isPremium) {
    redirect(`/trip/${params.id}/plan?upgrade=premium&reason=maps_ai_locked`);
  }

  return (
    <main className="space-y-8">
      <TripBoardPageHeader
        section="Plan del viaje"
        title="Plan"
        description="Añade lugares, fechas, horas y coordenadas. Todo lo guardado aquí se reutiliza en el mapa para crear rutas y organizar el viaje."
        actions={<TripTabActions tripId={params.id} />}
      />

      <TripPlanView tripId={params.id} premiumEnabled />
    </main>
  );
}
