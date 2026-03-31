"use client";

import Script from "next/script";
import { useTripData } from "@/hooks/useTripData";
import TripPlanView from "@/components/trip/plan/TripPlanView";
import TripScreenActions from "@/components/trip/common/TripScreenActions";

export default function TripPlanPage({
  params,
}: {
  params: { id: string };
}) {
  const { trip, activities, loading, error, reload } = useTripData(params.id);

  if (loading) {
    return <p style={{ padding: 16 }}>Cargando plan...</p>;
  }

  return (
    <>
      <Script
        id="google-maps-places-plan"
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
        strategy="afterInteractive"
      />

      <main className="page-shell" style={{ display: "grid", gap: 24 }}>
        <section className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
              Plan
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950 md:text-5xl">
              {trip?.name ? `Plan · ${trip.name}` : "Plan"}
            </h1>
            <p className="mt-3 max-w-3xl text-lg text-slate-600">
              Añade lugares, fechas, horas y coordenadas. Todo lo guardado aquí se reutiliza en la pestaña de mapa para crear rutas y organizar el viaje.
            </p>
          </div>

          <TripScreenActions tripId={params.id} />
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <TripPlanView tripId={params.id} activities={activities} reload={reload} />
      </main>
    </>
  );
}
