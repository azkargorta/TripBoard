import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";
import TripTabActions from "@/components/trip/common/TripTabActions";
import TripExploreView from "@/components/trip/explore/TripExploreView";
import { requireTripAccess } from "@/lib/trip-access";

export default async function ExplorePage({ params }: { params: { id: string } }) {
  const tripId = params.id;

  await requireTripAccess(tripId);

  return (
    <main className="space-y-6">
      <TripBoardPageHeader
        section="Mapa explorador"
        title="Explorar y guardar"
        description="Busca restaurantes, museos y actividades y guárdalos en carpetas dentro del viaje."
        iconSrc="/brand/tabs/map.png"
        iconAlt="Mapa"
        actions={<TripTabActions tripId={tripId} />}
      />

      <TripExploreView tripId={tripId} />
    </main>
  );
}

