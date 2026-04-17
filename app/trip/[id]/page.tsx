import { redirect } from "next/navigation";
import { requireTripAccess } from "@/lib/trip-access";

type TripPageProps = {
  params: {
    id: string;
  };
};

export default async function TripPage({ params }: TripPageProps) {
  const tripId = params.id;
  await requireTripAccess(tripId);
  redirect(`/trip/${encodeURIComponent(tripId)}/plan`);
}

