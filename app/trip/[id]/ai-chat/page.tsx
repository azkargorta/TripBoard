import TripAiChatView from "@/components/trip/ai/TripAiChatView";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { redirect } from "next/navigation";

export default async function Page({ params }: { params: { id: string } }) {
  const access = await requireTripAccess(params.id);
  const supabase = await createClient();
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("is_premium")
    .eq("id", access.userId)
    .maybeSingle();
  if (!Boolean((profileRow as any)?.is_premium)) {
    redirect(`/trip/${params.id}?upgrade=premium&reason=ai_locked`);
  }

  return <TripAiChatView tripId={params.id} />;
}
