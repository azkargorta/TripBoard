"use client";

import Script from "next/script";
import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";
import TripTabActions from "@/components/trip/common/TripTabActions";
import TripExploreView from "@/components/trip/explore/TripExploreView";

export default function ExplorePage({ params }: { params: { id: string } }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  return (
    <>
      {apiKey ? (
        <Script
          id="google-maps-places-explore"
          src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`}
          strategy="afterInteractive"
        />
      ) : null}

      <main className="space-y-6">
        <TripBoardPageHeader
          section="Mapa explorador"
          title="Explorar y guardar"
          description="Busca restaurantes, museos y actividades y guárdalos en carpetas dentro del viaje."
          actions={<TripTabActions tripId={params.id} />}
        />

        <TripExploreView tripId={params.id} hasGoogleMapsKey={!!apiKey} />
      </main>
    </>
  );
}

