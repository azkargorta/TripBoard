"use client";

import TripResourcesView from "@/components/trip/resources/TripResourcesView";
import TripScreenActions from "@/components/trip/common/TripScreenActions";
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
        actions={<TripScreenActions tripId={tripId} variant="inverse" />}
      />

      <TripResourcesView tripId={tripId} />
    </main>
  );
}
