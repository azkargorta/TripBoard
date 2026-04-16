import { NextResponse } from "next/server";

export const runtime = "nodejs";

type LatLng = { lat: number; lng: number };

function isLatLng(value: any): value is LatLng {
  return (
    value &&
    typeof value.lat === "number" &&
    Number.isFinite(value.lat) &&
    typeof value.lng === "number" &&
    Number.isFinite(value.lng)
  );
}

function coord(lng: number, lat: number) {
  // OSRM usa "lon,lat"
  return `${lng},${lat}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const origin = body?.origin;
    const destination = body?.destination;
    const stop = body?.stop ?? null;

    if (!isLatLng(origin) || !isLatLng(destination)) {
      return NextResponse.json({ error: "origin y destination deben ser {lat,lng}." }, { status: 400 });
    }
    if (stop != null && !isLatLng(stop)) {
      return NextResponse.json({ error: "stop debe ser {lat,lng} o null." }, { status: 400 });
    }

    const coords = [coord(origin.lng, origin.lat), ...(stop ? [coord(stop.lng, stop.lat)] : []), coord(destination.lng, destination.lat)].join(
      ";"
    );

    const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coords}`);
    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("steps", "false");
    url.searchParams.set("alternatives", "false");

    const resp = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    const payload = await resp.json().catch(() => null);
    if (!resp.ok) {
      return NextResponse.json({ error: "No se pudo calcular la ruta (OSRM)." }, { status: 502 });
    }

    const route0 = payload?.routes?.[0] ?? null;
    const coordsOut: any[] = route0?.geometry?.coordinates;
    const pointsRaw =
      Array.isArray(coordsOut) && coordsOut.length
        ? coordsOut.map((c) => (Array.isArray(c) ? { lng: Number(c[0]), lat: Number(c[1]) } : null))
        : [];

    const points = pointsRaw.filter(
      (p): p is { lat: number; lng: number } => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    );

    const distanceMeters = typeof route0?.distance === "number" && Number.isFinite(route0.distance) ? route0.distance : null;
    const durationSeconds = typeof route0?.duration === "number" && Number.isFinite(route0.duration) ? route0.duration : null;

    // normalizamos a {lat,lng} para el frontend
    return NextResponse.json({
      points: points.map((p) => ({ lat: p.lat, lng: p.lng })),
      distanceMeters,
      durationSeconds,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo calcular la ruta (OSRM)." },
      { status: 500 }
    );
  }
}

