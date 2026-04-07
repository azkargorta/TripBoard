"use client";

import Script from "next/script";
import TripPlanView from "@/components/trip/plan/TripPlanView";
import TripTabActions from "@/components/trip/common/TripTabActions";
import TripBoardPremiumHero from "@/components/layout/TripBoardPremiumHero";

export default function TripPlanPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <>
      <Script
        id="google-maps-places-plan"
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
        strategy="afterInteractive"
      />

      <main className="space-y-8">
        <TripBoardPremiumHero
          eyebrow="Plan del viaje"
          title="Plan"
          description="Añade lugares, fechas, horas y coordenadas. Todo lo guardado aquí se reutiliza en el mapa para crear rutas y organizar el viaje."
          actions={<TripTabActions tripId={params.id} variant="inverse" />}
        />

        <TripPlanView tripId={params.id} />
      </main>
    </>
  );
}
