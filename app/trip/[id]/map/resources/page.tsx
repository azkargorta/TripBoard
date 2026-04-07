"use client";

import TripResourcesView from "@/components/trip/resources/TripResourcesView";
import TripTabActions from "@/components/trip/common/TripTabActions";
import TripBoardPremiumHero from "@/components/layout/TripBoardPremiumHero";

export default function TripResourcesPage({
  params,
}: {
  params: { id: string };
}) {
  const tripId = params.id;

  return (
    <main className="space-y-6">
      <TripBoardPremiumHero
        eyebrow="Recursos y reservas"
        title="Documentos del viaje"
        description="Adjunta PDFs o imágenes de reservas, guarda alojamientos y analiza documentos para rellenar formularios automáticamente."
        actions={<TripTabActions tripId={tripId} variant="inverse" />}
      />

      <TripResourcesView tripId={tripId} />
    </main>
  );
}
