import type { ReactNode } from "react";
import { requireTripAccess } from "@/lib/trip-access";
import MobileBottomNav from "@/components/mobile/MobileBottomNav";
import TripBoardBrandRail from "@/components/layout/TripBoardBrandRail";
import { createClient } from "@/lib/supabase/server";
import { TripBoardHeaderProvider } from "@/components/layout/TripBoardHeaderContext";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";
import DesktopTripSidebar from "@/components/layout/DesktopTripSidebar";
import TripPageAssistantDock from "@/components/trip/ai/TripPageAssistantDock";
import { formatTripDateRangeHeader } from "@/lib/format-trip-date-range";

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
  const { data: tripMeta } = await supabase
    .from("trips")
    .select("name, start_date, end_date")
    .eq("id", params.id)
    .maybeSingle();
  const tripName = (tripMeta?.name && String(tripMeta.name).trim()) || "Viaje";
  const dateRangeLabel = formatTripDateRangeHeader(
    tripMeta?.start_date ? String(tripMeta.start_date) : null,
    tripMeta?.end_date ? String(tripMeta.end_date) : null
  );
  const isPremium = await isPremiumEnabledForTrip({ supabase, userId: access.userId, tripId: params.id });

  return (
    <>
      <TripBoardHeaderProvider>
        <TripBoardBrandRail tripId={params.id} tripName={tripName} dateRangeLabel={dateRangeLabel} />
        <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-0">
          <div className="page-shell !pt-4 !pb-6 md:!pt-5 md:!pb-10">
            <div className="min-w-0 md:grid md:grid-cols-[200px_1fr] lg:grid-cols-[220px_1fr] md:gap-4">
              <DesktopTripSidebar tripId={params.id} isPremium={isPremium} />
              <div className="min-w-0 max-w-full space-y-6 overflow-x-hidden md:space-y-10">{children}</div>
            </div>
          </div>
        </div>
        <MobileBottomNav tripId={params.id} isPremium={isPremium} />
        <TripPageAssistantDock tripId={params.id} isPremium={isPremium} />
      </TripBoardHeaderProvider>
    </>
  );
}
