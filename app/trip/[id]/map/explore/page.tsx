import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";
import TripTabActions from "@/components/trip/common/TripTabActions";
import { requireTripAccess } from "@/lib/trip-access";
import { redirect } from "next/navigation";

export default async function ExplorePage({ params }: { params: { id: string } }) {
  const tripId = params.id;

  await requireTripAccess(tripId);

  // Explorar ahora vive dentro de /plan.
  redirect(`/trip/${encodeURIComponent(tripId)}/plan?explore=1`);
}

