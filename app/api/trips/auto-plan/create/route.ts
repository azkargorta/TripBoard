import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureUserCanCreateTrip } from "@/lib/trips/tripCreationLimits";
import { createTripWithOwner } from "@/lib/trips/createTripWithOwner";
import type { ExecutableItineraryPayload, TripCreationIntent } from "@/lib/trip-ai/tripCreationTypes";
import { executePlanOnTrip } from "@/lib/trip-ai/executePlanOnTrip";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) return NextResponse.json({ error: userError.message }, { status: 401 });
    if (!user) return NextResponse.json({ error: "No hay sesión activa." }, { status: 401 });

    const body = await req.json().catch(() => null);
    const trip = body?.trip || null;
    const itinerary = body?.itinerary as ExecutableItineraryPayload | undefined;
    const intent = body?.intent as TripCreationIntent | undefined;
    if (!trip) return NextResponse.json({ error: "Falta trip." }, { status: 400 });
    if (!itinerary) return NextResponse.json({ error: "Falta itinerary." }, { status: 400 });
    if (!intent) return NextResponse.json({ error: "Falta intent." }, { status: 400 });

    const { data: profileRow } = await supabase.from("profiles").select("is_premium").eq("id", user.id).maybeSingle();
    if (!Boolean((profileRow as any)?.is_premium)) {
      return NextResponse.json({ error: "Necesitas cuenta Premium para crear viajes automáticos.", code: "PREMIUM_REQUIRED" }, { status: 402 });
    }

    const gate = await ensureUserCanCreateTrip(supabase, user.id);
    if ("error" in gate) return NextResponse.json({ error: gate.error, code: gate.code }, { status: 402 });

    const name = typeof trip?.name === "string" ? trip.name.trim() : "";
    const destination = typeof trip?.destination === "string" ? trip.destination.trim() : "";
    const start_date = typeof trip?.start_date === "string" ? trip.start_date : null;
    const end_date = typeof trip?.end_date === "string" ? trip.end_date : null;
    const base_currency = typeof trip?.base_currency === "string" ? trip.base_currency.trim().toUpperCase() : "EUR";
    if (!name) return NextResponse.json({ error: "El nombre del viaje es obligatorio." }, { status: 400 });
    if (start_date && end_date && start_date > end_date) {
      return NextResponse.json({ error: "La fecha de fin no puede ser anterior a la fecha de inicio." }, { status: 400 });
    }

    const created = await createTripWithOwner(supabase, user, {
      name,
      destination: destination || null,
      start_date,
      end_date,
      base_currency: /^[A-Z]{3}$/.test(base_currency) ? base_currency : "EUR",
    });
    if ("error" in created) return NextResponse.json({ error: created.error }, { status: 400 });

    const exec = await executePlanOnTrip({
      supabase,
      tripId: created.tripId,
      itinerary,
      conflictResolution: "replace",
      access: { userId: user.id, can_manage_map: false },
      tripDestination: destination || null,
      generateRoutes: false,
    });
    if (!exec.ok) return NextResponse.json({ error: exec.error }, { status: 400 });

    return NextResponse.json({ tripId: created.tripId, createdActivities: exec.created });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo crear el viaje automáticamente." }, { status: 500 });
  }
}

