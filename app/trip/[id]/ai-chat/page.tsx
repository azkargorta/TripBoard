import TripAiChatView from "@/components/trip/ai/TripAiChatView";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";

export default async function Page({ params }: { params: { id: string } }) {
  const access = await requireTripAccess(params.id);
  const supabase = await createClient();
  const isPremium = await isPremiumEnabledForTrip({ supabase, userId: access.userId, tripId: params.id });

  return <TripAiChatView tripId={params.id} isPremium={isPremium} />;
}
