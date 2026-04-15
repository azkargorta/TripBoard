import type { ReactNode } from "react";
import { requireTripAccess } from "@/lib/trip-access";
import MobileBottomNav from "@/components/mobile/MobileBottomNav";
import TripBoardBrandRail from "@/components/layout/TripBoardBrandRail";
import { createClient } from "@/lib/supabase/server";
import { TripBoardHeaderProvider } from "@/components/layout/TripBoardHeaderContext";
import Script from "next/script";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";
import DesktopTripSidebar from "@/components/layout/DesktopTripSidebar";

type TripLayoutProps = {
  children: ReactNode;
  params: {
    id: string;
  };
};

export default async function TripLayout({
  children,
  params,
}: TripLayoutProps) {
  const access = await requireTripAccess(params.id);

  const supabase = await createClient();
  const { data: tripMeta } = await supabase.from("trips").select("name").eq("id", params.id).maybeSingle();
  const tripName = (tripMeta?.name && String(tripMeta.name).trim()) || "Viaje";
  const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const isPremium = await isPremiumEnabledForTrip({ supabase, userId: access.userId, tripId: params.id });

  return (
    <>
      <TripBoardHeaderProvider>
        {isPremium && googleApiKey ? (
          <Script
            id="google-maps-places-global"
            src={`https://maps.googleapis.com/maps/api/js?key=${googleApiKey}`}
            strategy="afterInteractive"
          />
        ) : null}
        <TripBoardBrandRail tripId={params.id} tripName={tripName} />
        <div
          className="pb-[calc(5.35rem+env(safe-area-inset-bottom,0px))] md:pb-0"
          style={{
            paddingTop: "max(env(safe-area-inset-top), 0px)",
          }}
        >
          <div className="page-shell pb-6 md:pb-12">
            <div className="md:grid md:grid-cols-[120px_1fr] md:gap-4">
              <DesktopTripSidebar tripId={params.id} isPremium={isPremium} />
              <div className="space-y-6 md:space-y-10">{children}</div>
            </div>
          </div>
        </div>
        <MobileBottomNav tripId={params.id} isPremium={isPremium} />
      </TripBoardHeaderProvider>
    </>
  );
}
