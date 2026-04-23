import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";
import { executePlanOnTrip } from "@/lib/trip-ai/executePlanOnTrip";
import type { ExecutableItineraryPayload } from "@/lib/trip-ai/tripCreationTypes";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const tripId = typeof body?.tripId === "string" ? body.tripId : "";
    const itinerary = body?.itinerary as ExecutableItineraryPayload | null;
    const conflictResolution = body?.conflictResolution === "replace" ? "replace" : "add";

    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
    if (!itinerary || itinerary.version !== 1 || !Array.isArray(itinerary.days)) {
      return NextResponse.json({ error: "Itinerario inválido." }, { status: 400 });
    }

    const access = await requireTripAccess(tripId);
    if (!access.can_manage_plan) {
      return NextResponse.json({ error: "No tienes permisos para ejecutar el plan." }, { status: 403 });
    }

    const supabase = await createClient();

    const isPremium = await isPremiumEnabledForTrip({ supabase, userId: access.userId, tripId });
    if (!isPremium) {
      return NextResponse.json(
        { error: "Necesitas Premium (o un participante Premium en este viaje) para usar el asistente personal.", code: "PREMIUM_REQUIRED" },
        { status: 402 }
      );
    }

    const { data: tripRow } = await supabase.from("trips").select("destination").eq("id", tripId).single();
    const tripDestination = typeof tripRow?.destination === "string" ? tripRow.destination : null;

    const result = await executePlanOnTrip({
      supabase,
      tripId,
      itinerary,
      conflictResolution,
      access: { userId: access.userId, can_manage_map: access.can_manage_map },
      tripDestination,
      // En ejecución manual, generamos rutas por defecto.
      generateRoutes: true,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      created: result.created,
      routesCreated: result.routesCreated,
      ...(result.routesNote ? { routesNote: result.routesNote } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo ejecutar el plan." },
      { status: 500 }
    );
  }
}
