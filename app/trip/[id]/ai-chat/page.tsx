import TripAiChatView from "@/components/trip/ai/TripAiChatView";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { redirect } from "next/navigation";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";

export default async function Page({ params }: { params: { id: string } }) {
  const access = await requireTripAccess(params.id);
  const supabase = await createClient();
  const isPremium = await isPremiumEnabledForTrip({ supabase, userId: access.userId, tripId: params.id });
  if (!isPremium) {
    redirect(`/trip/${params.id}?upgrade=premium&reason=ai_locked`);
  }

  return <TripAiChatView tripId={params.id} />;
}
