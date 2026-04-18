import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";
import TripAiPostCreateHint from "@/components/trip/ai/TripAiPostCreateHint";
import TripAiChatPageClient from "@/components/trip/ai/TripAiChatPageClient";

function parseRecien(searchParams: Record<string, string | string[] | undefined> | undefined) {
  const raw = searchParams?.recien;
  const v = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  return v === "1" || v.toLowerCase() === "true";
}

export default async function Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const access = await requireTripAccess(params.id);
  const supabase = await createClient();
  const isPremium = await isPremiumEnabledForTrip({ supabase, userId: access.userId, tripId: params.id });
  const recien = parseRecien(searchParams);

  return (
    <>
      {isPremium && recien ? <TripAiPostCreateHint tripId={params.id} enabled /> : null}
      <TripAiChatPageClient tripId={params.id} isPremium={isPremium} />
    </>
  );
}
