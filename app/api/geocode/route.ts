import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";

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

    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", address);
    url.searchParams.set("limit", "1");
    const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    const payload: any = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json({ error: "No se pudo geocodificar la dirección." }, { status: 502 });
    }
    const feature = Array.isArray(payload?.features) ? payload.features[0] : null;
    const coords = feature?.geometry?.coordinates;
    const longitude = Array.isArray(coords) ? Number(coords[0]) : null;
    const latitude = Array.isArray(coords) ? Number(coords[1]) : null;
    const formattedAddress =
      (feature?.properties && typeof feature.properties === "object"
        ? [feature.properties.name, feature.properties.street, feature.properties.city, feature.properties.country]
            .filter(Boolean)
            .join(", ")
        : "") || address;

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
