import { NextResponse } from "next/server";

export const runtime = "nodejs";

type WeatherCodeInfo = {
  label: string;
};

const WEATHER_CODE_MAP: Record<number, WeatherCodeInfo> = {
  0: { label: "Despejado" },
  1: { label: "Mayormente despejado" },
  2: { label: "Parcialmente nuboso" },
  3: { label: "Cubierto" },
  45: { label: "Niebla" },
  48: { label: "Niebla con escarcha" },
  51: { label: "Llovizna ligera" },
  53: { label: "Llovizna" },
  55: { label: "Llovizna intensa" },
  56: { label: "Llovizna helada ligera" },
  57: { label: "Llovizna helada" },
  61: { label: "Lluvia ligera" },
  63: { label: "Lluvia" },
  65: { label: "Lluvia intensa" },
  66: { label: "Lluvia helada ligera" },
  67: { label: "Lluvia helada intensa" },
  71: { label: "Nieve ligera" },
  73: { label: "Nieve" },
  75: { label: "Nieve intensa" },
  77: { label: "Granos de nieve" },
  80: { label: "Chubascos ligeros" },
  81: { label: "Chubascos" },
  82: { label: "Chubascos intensos" },
  85: { label: "Nevadas ligeras" },
  86: { label: "Nevadas intensas" },
  95: { label: "Tormenta" },
  96: { label: "Tormenta con granizo ligero" },
  99: { label: "Tormenta con granizo intenso" },
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const location = String(searchParams.get("location") || "").trim();

    if (!location) {
      return NextResponse.json({ error: "Falta la ubicación." }, { status: 400 });
    }

    const geocodeUrl = new URL("https://photon.komoot.io/api/");
    geocodeUrl.searchParams.set("q", location);
    geocodeUrl.searchParams.set("limit", "1");
    geocodeUrl.searchParams.set("lang", "es");

    const geocodeResponse = await fetch(geocodeUrl.toString(), { method: "GET", cache: "no-store" });
    const geocodePayload: any = await geocodeResponse.json().catch(() => null);
    const feature = Array.isArray(geocodePayload?.features) ? geocodePayload.features[0] : null;
    const coords = feature?.geometry?.coordinates;
    const longitude = Array.isArray(coords) ? Number(coords[0]) : NaN;
    const latitude = Array.isArray(coords) ? Number(coords[1]) : NaN;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json(
        { error: "No se pudieron obtener coordenadas válidas para el clima." },
        { status: 400 }
      );
    }

    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
    weatherUrl.searchParams.set("latitude", String(latitude));
    weatherUrl.searchParams.set("longitude", String(longitude));
    weatherUrl.searchParams.set(
      "daily",
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max"
    );
    weatherUrl.searchParams.set("forecast_days", "7");
    weatherUrl.searchParams.set("timezone", "auto");

    const weatherResponse = await fetch(weatherUrl.toString(), {
      method: "GET",
      cache: "no-store",
    });
    const weatherPayload = await weatherResponse.json();

    if (!weatherResponse.ok || !weatherPayload?.daily?.time?.length) {
      return NextResponse.json(
        { error: "No se pudo obtener la previsión meteorológica." },
        { status: 400 }
      );
    }

    const daily = weatherPayload.daily;
    const days = (daily.time as string[]).map((date, index) => {
      const code = Number(daily.weather_code?.[index] ?? -1);
      return {
        date,
        weatherCode: code,
        weatherLabel: WEATHER_CODE_MAP[code]?.label || "Condición no disponible",
        tempMax: daily.temperature_2m_max?.[index] ?? null,
        tempMin: daily.temperature_2m_min?.[index] ?? null,
        precipitation: daily.precipitation_sum?.[index] ?? null,
        windMax: daily.wind_speed_10m_max?.[index] ?? null,
      };
    });

    return NextResponse.json({
      resolvedLocation:
        (feature?.properties && typeof feature.properties === "object"
          ? [feature.properties.name, feature.properties.city, feature.properties.country].filter(Boolean).join(", ")
          : "") || location,
      latitude,
      longitude,
      days,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo cargar el clima." },
      { status: 500 }
    );
  }
}
