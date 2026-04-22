import { NextResponse } from "next/server";
import { fetchProjectOsrmRoute } from "@/lib/osrm/projectOsrmRoute";

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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const origin = body?.origin;
    const destination = body?.destination;
    const stop = body?.stop ?? null;
    const profileRaw = typeof body?.profile === "string" ? body.profile.trim().toLowerCase() : "";
    const profile =
      profileRaw === "walking" || profileRaw === "cycling" || profileRaw === "driving"
        ? (profileRaw as "driving" | "walking" | "cycling")
        : "driving";

    if (!isLatLng(origin) || !isLatLng(destination)) {
      return NextResponse.json({ error: "origin y destination deben ser {lat,lng}." }, { status: 400 });
    }
    if (stop != null && !isLatLng(stop)) {
      return NextResponse.json({ error: "stop debe ser {lat,lng} o null." }, { status: 400 });
    }

    // stop intermedio: una sola petición OSRM con 3 puntos (misma API pública)
    if (stop) {
      const coords = `${origin.lng},${origin.lat};${stop.lng},${stop.lat};${destination.lng},${destination.lat}`;
      const url = new URL(`https://router.project-osrm.org/route/v1/${profile}/${coords}`);
      url.searchParams.set("overview", "full");
      url.searchParams.set("geometries", "geojson");
      url.searchParams.set("steps", "false");
      url.searchParams.set("alternatives", "false");
      const resp = await fetch(url.toString(), { method: "GET", cache: "no-store" });
      const payload: any = await resp.json().catch(() => null);
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
      return NextResponse.json({
        points: points.map((p) => ({ lat: p.lat, lng: p.lng })),
        distanceMeters,
        durationSeconds,
      });
    }

    const { points, distanceMeters, durationSeconds } = await fetchProjectOsrmRoute({
      origin,
      destination,
      profile,
    });

    return NextResponse.json({
      points,
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

