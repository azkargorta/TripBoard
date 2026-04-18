import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTripWeatherByDestination } from "@/lib/trip-weather";
import { primaryTripPlace } from "@/lib/trip-places";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();

  const { data: trip, error } = await supabase.from("trips").select("destination").eq("id", id).maybeSingle();

  if (error || !trip?.destination) {
    return NextResponse.json(
      { error: "No se ha encontrado un destino válido para este viaje." },
      { status: 400 }
    );
  }

  try {
    const result = await getTripWeatherByDestination(primaryTripPlace(String(trip.destination)));
    if (!result) {
      return NextResponse.json(
        { error: "No se pudo localizar ese destino para obtener el clima." },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (fetchError) {
    console.error("Error cargando clima del viaje:", fetchError);
    return NextResponse.json({ error: "No se pudo consultar el clima ahora mismo." }, { status: 500 });
  }
}
