import { NextResponse } from "next/server";
import { suggestPlacesForCountry } from "@/lib/geocoding/photonGeocode";

export const runtime = "nodejs";

type PlaceRow = { name: string; lat: number; lng: number };

function dedupeByName(rows: PlaceRow[]): PlaceRow[] {
  const seen = new Set<string>();
  const out: PlaceRow[] = [];
  for (const r of rows) {
    const key = String(r.name || "").trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

async function fetchOverpassJson(query: string, timeoutMs: number): Promise<any | null> {
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
  ];
  const body = `data=${encodeURIComponent(query)}`;

  const tryOne = async (url: string) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body,
        cache: "no-store",
        signal: ctrl.signal,
      });
        const json: any = await resp.json().catch(() => null);
      if (!resp.ok) return null;
      return json;
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  };

  for (const url of endpoints) {
    const j = await tryOne(url);
    if (j) return j;
  }
  return null;
}

async function photonCountryOsmRelationId(countryName: string): Promise<number | null> {
  const q = String(countryName || "").trim();
  if (!q) return null;
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "8");
  const resp = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const payload: any = await resp.json().catch(() => null);
  if (!resp.ok) return null;
  const feats = Array.isArray(payload?.features) ? payload.features : [];
  for (const f of feats) {
    const p = f?.properties && typeof f.properties === "object" ? f.properties : {};
    const type = String(p?.type || "").toLowerCase();
    const osmValue = String(p?.osm_value || "").toLowerCase();
    const osmType = String(p?.osm_type || "").toLowerCase();
    const osmId = Number(p?.osm_id);
    if (!Number.isFinite(osmId)) continue;
    if (osmType !== "r") continue; // relation
    if (type === "country" || osmValue === "country") {
      return osmId;
    }
  }
  return null;
}

async function suggestPlacesOverpassByAreaId(areaId: number, limit: number, offset: number): Promise<PlaceRow[] | null> {
  const outLimit = Math.max(600, (limit + offset) * 40);
  const q = `
[out:json][timeout:60];
(
  node["place"="city"](area:${areaId});
  way["place"="city"](area:${areaId});
  relation["place"="city"](area:${areaId});
  node["place"="town"](area:${areaId});
  way["place"="town"](area:${areaId});
  relation["place"="town"](area:${areaId});
);
out center tags ${outLimit};
`.trim();

  const payload = await fetchOverpassJson(q, 45_000);
  if (!payload) return null;
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  const rows: PlaceRow[] = [];
  for (const el of elements) {
    const tags = el?.tags && typeof el.tags === "object" ? el.tags : {};
    const name = typeof tags?.name === "string" ? String(tags.name).trim() : "";
    const lat =
      typeof el?.lat === "number"
        ? el.lat
        : typeof el?.center?.lat === "number"
          ? el.center.lat
          : null;
    const lng =
      typeof el?.lon === "number"
        ? el.lon
        : typeof el?.center?.lon === "number"
          ? el.center.lon
          : null;
    if (!name || lat == null || lng == null) continue;
    rows.push({ name, lat, lng });
  }
  const deduped = dedupeByName(rows);
  return deduped.slice(offset, offset + limit);
}

async function suggestPlacesOverpass(countryName: string, limit: number, offset: number): Promise<PlaceRow[] | null> {
  const outLimit = Math.max(400, (limit + offset) * 30);
  const q = `
[out:json][timeout:60];
area["name"="${countryName}"]["boundary"="administrative"]["admin_level"="2"]->.a;
(
  node["place"="city"](area.a);
  way["place"="city"](area.a);
  relation["place"="city"](area.a);
  node["place"="town"](area.a);
  way["place"="town"](area.a);
  relation["place"="town"](area.a);
);
out center tags ${outLimit};
`.trim();

  const payload = await fetchOverpassJson(q, 45_000);
  if (!payload) return null;
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  const rows: PlaceRow[] = [];
  for (const el of elements) {
    const tags = el?.tags && typeof el.tags === "object" ? el.tags : {};
    const name = typeof tags?.name === "string" ? String(tags.name).trim() : "";
    const lat =
      typeof el?.lat === "number"
        ? el.lat
        : typeof el?.center?.lat === "number"
          ? el.center.lat
          : null;
    const lng =
      typeof el?.lon === "number"
        ? el.lon
        : typeof el?.center?.lon === "number"
          ? el.center.lon
          : null;
    if (!name || lat == null || lng == null) continue;
    rows.push({ name, lat, lng });
  }
  const deduped = dedupeByName(rows);
  return deduped.slice(offset, offset + limit);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const query = String(body?.query || "").trim();
    const limit = Number(body?.limit) || 18;
    const offset = Number(body?.offset) || 0;
    if (!query) return NextResponse.json({ error: "Falta query." }, { status: 400 });

    // Preferimos Overpass para "país" porque Photon devuelve el país, no sus ciudades.
    // 1) Intento por area[name=...] (rápido pero frágil)
    let overpassPlaces = await suggestPlacesOverpass(query, limit, offset);
    // 2) Si viene pobre, calculamos areaId exacto del país (relation) y repetimos
    if (!overpassPlaces || overpassPlaces.length < Math.min(6, limit)) {
      const relId = await photonCountryOsmRelationId(query);
      if (relId) {
        const areaId = 3600000000 + relId; // Overpass area id for relation
        const byId = await suggestPlacesOverpassByAreaId(areaId, limit, offset);
        if (byId && byId.length) overpassPlaces = byId;
      }
    }
    const places =
      overpassPlaces && overpassPlaces.length
        ? overpassPlaces
        : await suggestPlacesForCountry(query, { limit, offset });

    return NextResponse.json({ ok: true, places });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo sugerir lugares." }, { status: 500 });
  }
}

