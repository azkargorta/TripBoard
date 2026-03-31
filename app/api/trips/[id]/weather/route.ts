import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();

  const { data: trip, error } = await supabase
    .from("trips")
    .select("destination")
    .eq("id", id)
    .maybeSingle();

  if (error || !trip?.destination) {
    return NextResponse.json(
      { error: "No se ha encontrado un destino válido para este viaje." },
      { status: 400 }
    );
  }

  try {
    const destination = String(trip.destination).trim();
    const geoResponse = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1&language=es&format=json`,
      { cache: "no-store" }
    );
    const geoPayload = await geoResponse.json().catch(() => null);

    const result = geoPayload?.results?.[0];
    if (!geoResponse.ok || !result) {
      return NextResponse.json(
        { error: "No se pudo localizar ese destino para obtener el clima." },
        { status: 404 }
      );
    }

    const latitude = result.latitude;
    const longitude = result.longitude;
    const locationLabel = [result.name, result.admin1, result.country].filter(Boolean).join(", ");

    const weatherResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(String(latitude))}&longitude=${encodeURIComponent(String(longitude))}&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=7&timezone=auto`,
      { cache: "no-store" }
    );
    const weatherPayload = await weatherResponse.json().catch(() => null);

    if (!weatherResponse.ok || !weatherPayload?.daily?.time) {
      return NextResponse.json(
        { error: "No se pudo cargar la previsión meteorológica." },
        { status: 502 }
      );
    }

    const days = (weatherPayload.daily.time as string[]).map((date, index) => ({
      date,
      tempMax: typeof weatherPayload.daily.temperature_2m_max?.[index] === "number"
        ? weatherPayload.daily.temperature_2m_max[index]
        : null,
      tempMin: typeof weatherPayload.daily.temperature_2m_min?.[index] === "number"
        ? weatherPayload.daily.temperature_2m_min[index]
        : null,
      code: typeof weatherPayload.daily.weather_code?.[index] === "number"
        ? weatherPayload.daily.weather_code[index]
        : null,
    }));

    return NextResponse.json({
      locationLabel,
      days,
    });
  } catch (fetchError) {
    console.error("Error cargando clima del viaje:", fetchError);
    return NextResponse.json(
      { error: "No se pudo consultar el clima ahora mismo." },
      { status: 500 }
    );
  }
}
