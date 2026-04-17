import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import TripPlanView from "@/components/trip/plan/TripPlanView";
import TripScreenActions from "@/components/trip/common/TripScreenActions";
import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";

export default async function TripPlanPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const access = await requireTripAccess(params.id);
  const supabase = await createClient();
  const isPremium = await isPremiumEnabledForTrip({ supabase, userId: access.userId, tripId: params.id });
  const rawExplore = searchParams?.explore;
  const explore = typeof rawExplore === "string" ? rawExplore : Array.isArray(rawExplore) ? String(rawExplore[0] || "") : "";
  const initialExploreOpen = explore.trim() === "1" || explore.trim().toLowerCase() === "true";

  return (
    <main className="space-y-8">
      <TripBoardPageHeader
        section="Plan del viaje"
        title="Plan"
        description={"Aquí se organiza el viaje: añade planes con fecha/hora y (si quieres) coordenadas para usarlos en el mapa."}
        iconSrc="/brand/tabs/plan.png"
        iconAlt="Plan"
        actions={<TripScreenActions tripId={params.id} />}
      />

      <TripPlanView tripId={params.id} premiumEnabled={isPremium} initialExploreOpen={initialExploreOpen} />
    </main>
  );
}
