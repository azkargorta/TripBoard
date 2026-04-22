/**
 * Cliente OSRM público (misma lógica que POST /api/osrm/route) para uso en servidor
 * sin depender de fetch al propio origen (evita fallos con URL interna / self-call).
 */

export type OsrmProfile = "driving" | "walking" | "cycling";

export type OsrmRouteResult = {
  points: { lat: number; lng: number }[];
  distanceMeters: number | null;
  durationSeconds: number | null;
};

function coord(lng: number, lat: number) {
  return `${lng},${lat}`;
}

export async function fetchProjectOsrmRoute(params: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  profile?: OsrmProfile;
}): Promise<OsrmRouteResult> {
  const profile: OsrmProfile =
    params.profile === "walking" || params.profile === "cycling" || params.profile === "driving"
      ? params.profile
      : "driving";

  const coords = [coord(params.origin.lng, params.origin.lat), coord(params.destination.lng, params.destination.lat)].join(
    ";"
  );

  const url = new URL(`https://router.project-osrm.org/route/v1/${profile}/${coords}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "false");
  url.searchParams.set("alternatives", "false");

  const resp = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const payload: any = await resp.json().catch(() => null);
  if (!resp.ok) {
    return { points: [], distanceMeters: null, durationSeconds: null };
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

  return {
    points: points.map((p) => ({ lat: p.lat, lng: p.lng })),
    distanceMeters,
    durationSeconds,
  };
}
