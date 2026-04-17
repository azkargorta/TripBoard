import TripResourcesView from "@/components/trip/resources/TripResourcesView";
import TripScreenActions from "@/components/trip/common/TripScreenActions";
import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";
import { requireTripAccess } from "@/lib/trip-access";
import { createClient } from "@/lib/supabase/server";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";

export default async function TripResourcesPage({
  params,
}: {
  params: { id: string };
}) {
  const tripId = params.id;

  // Nota: esta página NO está gated por premium, pero usamos el flag para habilitar el asistente personal si el viaje lo permite.
  // (Si no, el endpoint del asistente también lo rechazará.)
  const access = await requireTripAccess(tripId);
  const supabase = await createClient();
  const aiEnabled = await isPremiumEnabledForTrip({ supabase, userId: access.userId, tripId });

  return (
    <main className="space-y-6">
      <TripBoardPageHeader
        section="Recursos y reservas"
        title="Documentos del viaje"
        description="Adjunta PDFs o imágenes de reservas, guarda alojamientos y analiza documentos para rellenar formularios automáticamente."
        iconSrc="/brand/tabs/resources.png"
        iconAlt="Recursos"
        actions={<TripScreenActions tripId={tripId} />}
      />

      <TripResourcesView tripId={tripId} aiEnabled={aiEnabled} />
    </main>
  );
}
