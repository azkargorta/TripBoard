"use client";

import TripResourcesView from "@/components/trip/resources/TripResourcesView";
import TripScreenActions from "@/components/trip/common/TripScreenActions";

export default function TripResourcesPage({
  params,
}: {
  params: { id: string };
}) {
  const tripId = params.id;

  return (
    <main className="page-shell space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">
            Recursos y reservas
          </div>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Documentos del viaje</h1>
          <p className="mt-2 text-sm text-slate-600">
            Adjunta PDFs o imágenes de reservas, guarda alojamientos y analiza documentos para rellenar formularios automáticamente.
          </p>
        </div>
        <TripScreenActions tripId={tripId} />
      </section>

      <TripResourcesView tripId={tripId} />
    </main>
  );
}
