import { NextResponse } from "next/server";

export const runtime = "nodejs";

type PhotonFeature = {
  type: "Feature";
  geometry?: { type: "Point"; coordinates?: [number, number] };
  properties?: Record<string, unknown>;
};

function buildLabel(props: Record<string, unknown>) {
  const name = typeof props.name === "string" ? props.name.trim() : "";
  const street = typeof props.street === "string" ? props.street.trim() : "";
  const city =
    typeof props.city === "string"
      ? props.city.trim()
      : typeof props.town === "string"
        ? props.town.trim()
        : typeof props.village === "string"
          ? props.village.trim()
          : "";
  const state = typeof props.state === "string" ? props.state.trim() : "";
  const country = typeof props.country === "string" ? props.country.trim() : "";

  const parts = [name, street, city, state, country].filter(Boolean);
  const label = parts.join(", ");
  return label || name || city || country || "Lugar";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = String(searchParams.get("q") || "").trim();
    const limit = Math.max(1, Math.min(8, Number(searchParams.get("limit") || 6)));

    if (q.length < 2) {
      return NextResponse.json({ ok: true, places: [] }, { status: 200 });
    }

    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("lang", "es");

    const resp = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    const payload = await resp.json().catch(() => null);
    if (!resp.ok) {
      return NextResponse.json({ error: "No se pudo buscar el lugar." }, { status: 502 });
    }

    const features: PhotonFeature[] = Array.isArray(payload?.features) ? payload.features : [];
    const places = features
      .map((f) => {
        const props = (f?.properties && typeof f.properties === "object" ? (f.properties as any) : {}) as Record<
          string,
          unknown
        >;
        const coords = f?.geometry?.coordinates;
        const lon = Array.isArray(coords) ? Number(coords[0]) : NaN;
        const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
        const label = buildLabel(props);
        const idRaw =
          typeof props.osm_id === "number" || typeof props.osm_id === "string"
            ? String(props.osm_id)
            : label;
        const osmType = typeof props.osm_type === "string" ? props.osm_type : "osm";
        return {
          id: `${osmType}:${idRaw}:${String(lat)}:${String(lon)}`,
          label,
          latitude: Number.isFinite(lat) ? lat : null,
          longitude: Number.isFinite(lon) ? lon : null,
        };
      })
      .filter((p) => typeof p.label === "string" && p.label.trim());

    return NextResponse.json({ ok: true, places }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo buscar el lugar." },
      { status: 500 }
    );
  }
}

