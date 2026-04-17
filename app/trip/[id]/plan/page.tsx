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

  const rawTab = searchParams?.tab;
  const tabParam =
    typeof rawTab === "string" ? rawTab.trim().toLowerCase() : Array.isArray(rawTab) ? String(rawTab[0] || "").trim().toLowerCase() : "";
  const initialWorkspaceTab = tabParam === "notas" || tabParam === "notes" ? "notes" : "itinerary";

  const { data: tripNoteRow } = await supabase.from("trips").select("description").eq("id", params.id).maybeSingle();
  const rawDesc = (tripNoteRow as { description?: string | null } | null)?.description;
  const tripDescription = typeof rawDesc === "string" ? rawDesc : null;

  const canEditTripNotes = access.role === "owner" || access.can_manage_trip || access.can_manage_plan;

  return (
    <main className="space-y-8">
      <TripBoardPageHeader
        section="Plan del viaje"
        title="Plan"
        description={"Itinerario por días y notas del viaje en la misma pantalla. Las notas son texto libre para el grupo."}
        iconSrc="/brand/tabs/plan.png"
        iconAlt="Plan"
        actions={<TripScreenActions tripId={params.id} />}
      />

      <TripPlanView
        tripId={params.id}
        premiumEnabled={isPremium}
        initialExploreOpen={initialExploreOpen}
        initialTripDescription={tripDescription}
        canEditTripNotes={canEditTripNotes}
        initialWorkspaceTab={initialWorkspaceTab}
      />
    </main>
  );
}
