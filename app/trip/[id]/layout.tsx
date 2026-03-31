import type { ReactNode } from "react";
import { requireTripAccess } from "@/lib/trip-access";
import MobileBottomNav from "@/components/mobile/MobileBottomNav";

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

  return (
    <>
      <div
        className="pb-24 md:pb-0"
        style={{
          paddingTop: "max(env(safe-area-inset-top), 0px)",
        }}
      >
        {children}
      </div>
      <MobileBottomNav tripId={params.id} />
    </>
  );
}
