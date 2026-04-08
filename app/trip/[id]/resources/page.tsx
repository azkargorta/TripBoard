"use client";

import TripResourcesView from "@/components/trip/resources/TripResourcesView";
import TripScreenActions from "@/components/trip/common/TripScreenActions";
import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";

export default function TripResourcesPage({
  params,
}: {
  params: { id: string };
}) {
  const tripId = params.id;

  return (
    <main className="space-y-6">
      <TripBoardPageHeader
        section="Recursos y reservas"
        title="Documentos del viaje"
        description="Adjunta PDFs o imágenes de reservas, guarda alojamientos y analiza documentos para rellenar formularios automáticamente."
        actions={<TripScreenActions tripId={tripId} />}
      />

      <TripResourcesView tripId={tripId} />
    </main>
  );
}
