import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { geocodePhotonPreferred, geocodeTripAnchor, regionHintsFromDestination } from "@/lib/geocoding/photonGeocode";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const body = await request.json();
    const address = String(body?.address || "").trim();
    const tripId = typeof body?.tripId === "string" ? body.tripId : "";

    if (!address) {
      return NextResponse.json({ error: "Falta la dirección." }, { status: 400 });
    }

    if (tripId) {
      await requireTripAccess(tripId);
    }

    let tripDestination: string | null = null;
    if (tripId) {
      const { data: tripRow } = await supabase.from("trips").select("destination").eq("id", tripId).maybeSingle();
      tripDestination = typeof tripRow?.destination === "string" ? tripRow.destination : null;
    }

    const regionHints = regionHintsFromDestination(tripDestination);
    const anchor = await geocodeTripAnchor(tripDestination);

    const g = await geocodePhotonPreferred(address, {
      anchor,
      regionHints,
      // En API usamos filtro por país/hints; el radio amplio evita descartar multi-ciudad.
      maxDistanceKm: 50000,
    });

    const latitude = g ? g.lat : null;
    const longitude = g ? g.lng : null;
    const formattedAddress = g?.label || address;

    return NextResponse.json({
      ok: true,
      formattedAddress,
      latitude: Number.isFinite(latitude as any) ? latitude : null,
      longitude: Number.isFinite(longitude as any) ? longitude : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo geocodificar.",
      },
      { status: 500 }
    );
  }
}
