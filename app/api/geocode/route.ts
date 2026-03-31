import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const address = String(body?.address || "").trim();

    if (!address) {
      return NextResponse.json({ error: "Falta la dirección." }, { status: 400 });
    }

    const apiKey =
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
      "";

    if (!apiKey) {
      return NextResponse.json(
        { error: "Falta GOOGLE_MAPS_API_KEY en el entorno." },
        { status: 500 }
      );
    }

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("key", apiKey);

    const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    const payload = await response.json();

    if (!response.ok || payload?.status !== "OK" || !payload?.results?.length) {
      return NextResponse.json(
        {
          error: payload?.error_message || payload?.status || "No se pudo geocodificar la dirección.",
        },
        { status: 400 }
      );
    }

    const first = payload.results[0];
    const location = first?.geometry?.location;

    return NextResponse.json({
      ok: true,
      formattedAddress: first?.formatted_address || address,
      latitude: location?.lat ?? null,
      longitude: location?.lng ?? null,
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
