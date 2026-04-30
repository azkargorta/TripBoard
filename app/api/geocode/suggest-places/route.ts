import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

  const payload = await fetchOverpassJson(q, 28_000);
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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const body = await req.json().catch(() => null);
    const query = String(body?.query || "").trim();
    const limit = Number(body?.limit) || 18;
    const offset = Number(body?.offset) || 0;
    if (!query) return NextResponse.json({ error: "Falta query." }, { status: 400 });

    // Preferimos Overpass para "país" porque Photon devuelve el país, no sus ciudades.
    const overpassPlaces = await suggestPlacesOverpass(query, limit, offset);
    const places =
      overpassPlaces && overpassPlaces.length
        ? overpassPlaces
        : await suggestPlacesForCountry(query, { limit, offset });

    return NextResponse.json({ ok: true, places });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo sugerir lugares." }, { status: 500 });
  }
}

