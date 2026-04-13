import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import TripPlanView from "@/components/trip/plan/TripPlanView";
import TripScreenActions from "@/components/trip/common/TripScreenActions";
import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";

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

      <TripPlanView tripId={params.id} premiumEnabled={isPremium} />
    </main>
  );
}
