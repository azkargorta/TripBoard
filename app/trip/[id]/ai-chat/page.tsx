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
  const tripId = params.id;
  const access = await requireTripAccess(tripId);
  const supabase = await createClient();
  const isPremium = await isPremiumEnabledForTrip({ supabase, userId: access.userId, tripId });
  const recien = parseRecien(searchParams);

  let autoBootstrapItinerary = false;
  if (isPremium && recien) {
    const [{ data: tripMeta }, activityCountRes] = await Promise.all([
      supabase.from("trips").select("destination, start_date, end_date").eq("id", tripId).maybeSingle(),
      supabase.from("trip_activities").select("id", { count: "exact", head: true }).eq("trip_id", tripId),
    ]);

    const destOk = Boolean(tripMeta?.destination && String(tripMeta.destination).trim());
    const sd = tripMeta?.start_date ? String(tripMeta.start_date) : "";
    const ed = tripMeta?.end_date ? String(tripMeta.end_date) : "";
    const rangeOk = Boolean(sd && ed && sd <= ed);
    const richEnough = destOk || rangeOk;

    const n = activityCountRes.count;
    const planEmpty = typeof n === "number" ? n === 0 : true;

    autoBootstrapItinerary = richEnough && planEmpty;
  }

  return (
    <>
      {isPremium && recien ? (
        <TripAiPostCreateHint tripId={tripId} enabled autoBootstrap={autoBootstrapItinerary} />
      ) : null}
      <TripAiChatPageClient tripId={tripId} isPremium={isPremium} autoBootstrapItinerary={autoBootstrapItinerary} />
    </>
  );
}
