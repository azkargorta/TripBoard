import type { ReactNode } from "react";
import { requireTripAccess } from "@/lib/trip-access";
import MobileBottomNav from "@/components/mobile/MobileBottomNav";
import TripBoardBrandRail from "@/components/layout/TripBoardBrandRail";
import { createClient } from "@/lib/supabase/server";

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
  await requireTripAccess(params.id);

  const supabase = await createClient();
  const { data: tripMeta } = await supabase.from("trips").select("name").eq("id", params.id).maybeSingle();
  const tripName = (tripMeta?.name && String(tripMeta.name).trim()) || "Viaje";

  return (
    <>
      <TripBoardBrandRail tripId={params.id} tripName={tripName} />
      <div
        className="pb-24 md:pb-0"
        style={{
          paddingTop: "max(env(safe-area-inset-top), 0px)",
        }}
      >
        <div className="page-shell space-y-8 pb-16 md:space-y-10 md:pb-12">{children}</div>
      </div>
      <MobileBottomNav tripId={params.id} />
    </>
  );
}
