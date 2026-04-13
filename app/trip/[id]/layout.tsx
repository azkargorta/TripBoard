import type { ReactNode } from "react";
import { requireTripAccess } from "@/lib/trip-access";
import MobileBottomNav from "@/components/mobile/MobileBottomNav";
import TripBoardBrandRail from "@/components/layout/TripBoardBrandRail";
import { createClient } from "@/lib/supabase/server";
import { TripBoardHeaderProvider } from "@/components/layout/TripBoardHeaderContext";
import Script from "next/script";

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

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("is_premium")
    .eq("id", access.userId)
    .maybeSingle();
  const isPremium = Boolean((profileRow as any)?.is_premium);

  return (
    <>
      <TripBoardHeaderProvider>
        {isPremium && googleApiKey ? (
          <Script
            id="google-maps-places-global"
            src={`https://maps.googleapis.com/maps/api/js?key=${googleApiKey}&libraries=places`}
            strategy="afterInteractive"
          />
        ) : null}
        <TripBoardBrandRail tripId={params.id} tripName={tripName} />
        <div
          className="pb-24 md:pb-0"
          style={{
            paddingTop: "max(env(safe-area-inset-top), 0px)",
          }}
        >
          <div className="page-shell space-y-8 pb-16 md:space-y-10 md:pb-12">{children}</div>
        </div>
        <MobileBottomNav tripId={params.id} isPremium={isPremium} />
      </TripBoardHeaderProvider>
    </>
  );
}
