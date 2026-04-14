import Link from "next/link";
import Script from "next/script";
import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";
import TripTabActions from "@/components/trip/common/TripTabActions";
import TripExploreView from "@/components/trip/explore/TripExploreView";
import { requireTripAccess } from "@/lib/trip-access";
import { createClient } from "@/lib/supabase/server";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";

export default async function ExplorePage({ params }: { params: { id: string } }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const tripId = params.id;

  const access = await requireTripAccess(tripId);
  const supabase = await createClient();
  const isPremium = await isPremiumEnabledForTrip({ supabase, userId: access.userId, tripId });

  if (!isPremium) {
    return (
      <main className="space-y-6">
        <TripBoardPageHeader
          section="Mapa explorador"
          title="Explorar y guardar"
          description="Esta página está reservada a usuarios Premium."
          iconSrc="/brand/tabs/map.png"
          iconAlt="Mapa"
          actions={<TripTabActions tripId={tripId} />}
        />

        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
          <div className="text-sm font-semibold text-amber-950">
            Esta página está reservada a usuarios premium.
          </div>
          <div className="mt-2 text-sm text-amber-900/80">
            Mejora a Premium para buscar lugares con el explorador y guardarlos en carpetas dentro del viaje.
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/account?upgrade=premium&focus=premium#premium-plans"
              className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Mejorar a Premium
            </Link>
            <Link
              href={`/trip/${encodeURIComponent(tripId)}`}
              className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-50"
            >
              Volver al viaje
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <>
      {apiKey ? (
        <Script
          id="google-maps-places-explore"
          src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}`}
          strategy="afterInteractive"
        />
      ) : null}

      <main className="space-y-6">
        <TripBoardPageHeader
          section="Mapa explorador"
          title="Explorar y guardar"
          description="Busca restaurantes, museos y actividades y guárdalos en carpetas dentro del viaje."
          iconSrc="/brand/tabs/map.png"
          iconAlt="Mapa"
          actions={<TripTabActions tripId={tripId} />}
        />

        <TripExploreView tripId={tripId} hasGoogleMapsKey={!!apiKey} />
      </main>
    </>
  );
}

