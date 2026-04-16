import type { ReactNode } from "react";
import { requireTripAccess } from "@/lib/trip-access";
import MobileBottomNav from "@/components/mobile/MobileBottomNav";
import TripBoardBrandRail from "@/components/layout/TripBoardBrandRail";
import { createClient } from "@/lib/supabase/server";
import { TripBoardHeaderProvider } from "@/components/layout/TripBoardHeaderContext";
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
  const isPremium = await isPremiumEnabledForTrip({ supabase, userId: access.userId, tripId: params.id });

  return (
    <>
      <TripBoardHeaderProvider>
        <TripBoardBrandRail tripId={params.id} tripName={tripName} />
        <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-0">
          <div className="page-shell pb-6 md:pb-12">
            <div className="min-w-0 md:grid md:grid-cols-[120px_1fr] md:gap-4">
              <DesktopTripSidebar tripId={params.id} isPremium={isPremium} />
              <div className="min-w-0 space-y-6 md:space-y-10">{children}</div>
            </div>
          </div>
        </div>
        <MobileBottomNav tripId={params.id} isPremium={isPremium} />
      </TripBoardHeaderProvider>
    </>
  );
}
