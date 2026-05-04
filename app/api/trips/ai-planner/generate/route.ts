import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geocodePhotonPreferred, geocodeTripAnchor, regionHintsFromDestination } from "@/lib/geocoding/photonGeocode";
import { addDaysIso } from "@/lib/trip-ai/tripCreationDates";
import { askGemini } from "@/lib/trip-ai/providers";
import { extractJsonObject } from "@/lib/trip-ai/tripCreationJson";

export const runtime = "nodejs";
export const maxDuration = 120;

// ─── Types ────────────────────────────────────────────────────────────────────

type LatLng = { lat: number; lng: number };
type Poi = { name: string; lat: number; lng: number; osm?: { type: string; id: string } };

type Category =
  | "culture"
  | "nature"
  | "viewpoint"
  | "neighborhood"
  | "market"
  | "excursion"
  | "gastro_experience"
  | "shopping"
  | "night";

const ALL_CATEGORIES: Category[] = [
  "culture", "nature", "viewpoint", "neighborhood", "market",
  "excursion", "gastro_experience", "shopping", "night",
];

// ─── In-process cache (10 min TTL) ───────────────────────────────────────────

type CacheEntry = { pools: Record<Category, Poi[]>; expiresAt: number };
const POI_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function cacheKey(center: LatLng, radiusMeters: number) {
  return `${center.lat.toFixed(4)},${center.lng.toFixed(4)},${radiusMeters}`;
}
function cacheGet(center: LatLng, radiusMeters: number): Record<Category, Poi[]> | null {
  const k = cacheKey(center, radiusMeters);
  const entry = POI_CACHE.get(k);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { POI_CACHE.delete(k); return null; }
  return entry.pools;
}
function cacheSet(center: LatLng, radiusMeters: number, pools: Record<Category, Poi[]>) {
  const k = cacheKey(center, radiusMeters);
  POI_CACHE.set(k, { pools, expiresAt: Date.now() + CACHE_TTL_MS });
  if (POI_CACHE.size > 200) {
    const now = Date.now();
    for (const [key, val] of POI_CACHE.entries()) {
      if (now > val.expiresAt) POI_CACHE.delete(key);
    }
  }
}

// ─── Generic helpers ──────────────────────────────────────────────────────────

function cleanString(v: unknown) { return String(v ?? "").trim(); }
function isoOk(s: string) { return /^\d{4}-\d{2}-\d{2}$/.test(s); }
function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

function dedupeByName(rows: Poi[]): Poi[] {
  const seen = new Set<string>();
  const out: Poi[] = [];
  for (const r of rows) {
    const key = r.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function pickN<T>(arr: T[], n: number): T[] { return arr.slice(0, n); }

function dayCountBetween(start: string, end: string) {
  const a = new Date(`${start}T12:00:00Z`).getTime();
  const b = new Date(`${end}T12:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 1;
  return Math.max(1, Math.round((b - a) / (86400 * 1000)) + 1);
}

function sumPools(pools: Record<Category, Poi[]>): number {
  return ALL_CATEGORIES.reduce((n, k) => n + (pools[k]?.length || 0), 0);
}

function proposeRadiusMeters(count: number): number {
  if (count <= 2) return 22000;
  if (count >= 40) return 7000;
  if (count >= 18) return 12000;
  return 18000;
}

function inferBadDay(day: any, ctx: { minItems: number; requireEvening: boolean }) {
  const items = Array.isArray(day?.items) ? day.items : [];
  if (items.length < ctx.minItems) return true;
  if (items.some((it: any) => it?.latitude == null || it?.longitude == null)) return true;
  const titles = items.map((it: any) => String(it?.title || "").toLowerCase());
  if (titles.some((t: string) => /\b(paseo por la ciudad|zona animada|ambiente local|tiempo libre|visita panor[aá]mica)\b/i.test(t))) return true;
  if (titles.some((t: string) => /\b(almuerzo|cena)\b/i.test(t) && !/\b(bodega|cata|taller|tour|mercado)\b/i.test(t))) return true;
  if (ctx.requireEvening) {
    const times = items.map((it: any) => String(it?.activity_time || "")).filter(Boolean);
    const last = times.sort().slice(-1)[0] || "";
    if (last && last < "18:00") return true;
  }
  return false;
}

// ─── Gemini POI fallback ──────────────────────────────────────────────────────
//
// When Overpass is saturated, we ask Gemini to generate real POIs with
// accurate coordinates. Same pool structure — rest of the code is unchanged.

function buildGeminiPoiPrompt(city: string): string {
  return `Eres un experto en turismo. Genera puntos de interés REALES con coordenadas GPS precisas para: "${city}".

Devuelve SOLO JSON válido (sin markdown, sin texto extra). Esquema exacto:
{
  "culture": [{"name":"...","lat":0.0,"lng":0.0}],
  "nature": [{"name":"...","lat":0.0,"lng":0.0}],
  "viewpoint": [{"name":"...","lat":0.0,"lng":0.0}],
  "neighborhood": [{"name":"...","lat":0.0,"lng":0.0}],
  "market": [{"name":"...","lat":0.0,"lng":0.0}],
  "excursion": [{"name":"...","lat":0.0,"lng":0.0}],
  "gastro_experience": [{"name":"...","lat":0.0,"lng":0.0}],
  "shopping": [{"name":"...","lat":0.0,"lng":0.0}],
  "night": [{"name":"...","lat":0.0,"lng":0.0}]
}

Reglas:
- Mínimo 10 ítems por categoría.
- Todos los POIs deben ser REALES y CONCRETOS (nombre propio real, no inventado).
- PROHIBIDO: "Paseo por el centro", "Zona histórica", nombres genéricos o inventados.
- Coordenadas lat/lng reales y precisas para ese POI.
- culture: museos, teatros, monumentos, sitios históricos con nombre propio.
- nature: parques, reservas, picos, playas, cascadas con nombre real.
- viewpoint: miradores con nombre propio.
- neighborhood: barrios concretos (La Boca, Palermo, Gracia, etc.).
- market: mercados con nombre propio.
- excursion: excursiones de día desde la ciudad, destino concreto.
- gastro_experience: bodegas, cervecerías, mercados gastronómicos, clases de cocina.
- shopping: centros comerciales o zonas de compras con nombre propio.
- night: bares, pubs, cines, clubes con nombre propio.
- Si es una región o país, usa su ciudad principal como referencia geográfica.`;
}

async function fetchPoisFromGemini(cityLabel: string): Promise<Record<Category, Poi[]> | null> {
  try {
    const raw = await askGemini(buildGeminiPoiPrompt(cityLabel), "planning", { maxOutputTokens: 4096 });
    const parsed = extractJsonObject(raw) as any;
    if (!parsed || typeof parsed !== "object") return null;

    const pools: Record<Category, Poi[]> = {} as any;
    for (const cat of ALL_CATEGORIES) {
      const arr = Array.isArray(parsed[cat]) ? parsed[cat] : [];
      pools[cat] = dedupeByName(
        arr
          .map((item: any) => {
            const name = cleanString(item?.name || "");
            const lat = typeof item?.lat === "number" ? item.lat : null;
            const lng = typeof item?.lng === "number" ? item.lng : null;
            if (!name || lat === null || lng === null) return null;
            if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
            return { name, lat, lng } as Poi;
          })
          .filter(Boolean) as Poi[]
      );
    }

    // Excursion pool from nature + culture if sparse
    if ((pools.excursion || []).length < 3) {
      pools.excursion = dedupeByName([...(pools.nature || []), ...(pools.culture || [])]).slice(0, 12);
    }

    return sumPools(pools) >= 4 ? pools : null;
  } catch (e) {
    console.error("[ai-planner] Gemini POI fallback failed:", e);
    return null;
  }
}

// ─── Overpass: single multi-category query ────────────────────────────────────

function buildMultiCategoryQuery(center: LatLng, radiusMeters: number): string {
  const r = Math.floor(radiusMeters);
  const { lat, lng } = center;
  const a = `(around:${r},${lat},${lng})`;
  return `
[out:json][timeout:45];
(node["tourism"="museum"]${a};way["tourism"="museum"]${a};
 node["tourism"="attraction"]${a};way["tourism"="attraction"]${a};
 node["amenity"="theatre"]${a};way["amenity"="theatre"]${a};
 node["amenity"="arts_centre"]${a};
 node["historic"="monument"]${a};way["historic"="monument"]${a};
 node["historic"="castle"]${a};way["historic"="castle"]${a};
 node["historic"="archaeological_site"]${a};)->.culture;
(node["leisure"="park"]${a};way["leisure"="park"]${a};
 relation["boundary"="national_park"]${a};
 node["leisure"="nature_reserve"]${a};way["leisure"="nature_reserve"]${a};
 node["natural"="peak"]${a};node["natural"="waterfall"]${a};
 node["natural"="beach"]${a};way["natural"="beach"]${a};
 node["natural"="bay"]${a};)->.nature;
(node["tourism"="viewpoint"]${a};way["tourism"="viewpoint"]${a};)->.viewpoint;
(node["place"="neighbourhood"]${a};way["place"="neighbourhood"]${a};
 node["place"="suburb"]${a};way["place"="suburb"]${a};)->.neighborhood;
(node["amenity"="marketplace"]${a};way["amenity"="marketplace"]${a};
 relation["amenity"="marketplace"]${a};)->.market;
(node["tourism"="wine_cellar"]${a};node["craft"="winery"]${a};
 node["craft"="brewery"]${a};node["amenity"="cooking_school"]${a};)->.gastro;
(node["shop"="department_store"]${a};way["shop"="department_store"]${a};
 node["shop"="mall"]${a};way["shop"="mall"]${a};)->.shopping;
(node["amenity"="bar"]${a};way["amenity"="bar"]${a};
 node["amenity"="pub"]${a};node["amenity"="nightclub"]${a};
 node["amenity"="cinema"]${a};)->.night;
(.culture;.nature;.viewpoint;.neighborhood;.market;.gastro;.shopping;.night;);
out center tags 600;`.trim();
}

function tagToCategory(tags: Record<string, string>): Category | null {
  const { tourism: t, amenity: a, historic: h, natural: n, leisure: l, place: p, boundary: b, shop: s, craft: c } = tags;
  if (a === "bar" || a === "pub" || a === "nightclub" || a === "cinema") return "night";
  if (t === "museum" || a === "arts_centre" || a === "theatre" || h === "monument" || h === "castle" || h === "archaeological_site") return "culture";
  if (l === "park" || l === "nature_reserve" || b === "national_park" || n === "peak" || n === "waterfall" || n === "beach" || n === "bay") return "nature";
  if (t === "viewpoint") return "viewpoint";
  if (a === "marketplace") return "market";
  if (t === "wine_cellar" || c === "winery" || c === "brewery" || a === "cooking_school") return "gastro_experience";
  if (s === "department_store" || s === "mall") return "shopping";
  if (p === "neighbourhood" || p === "suburb") return "neighborhood";
  if (t === "attraction") return "culture";
  return null;
}

function parseOverpassResponse(payload: any, limitPerCat: number): Record<Category, Poi[]> {
  const pools: Record<Category, Poi[]> = {} as any;
  const seen: Record<Category, Set<string>> = {} as any;
  for (const cat of ALL_CATEGORIES) { pools[cat] = []; seen[cat] = new Set(); }

  for (const el of (Array.isArray(payload?.elements) ? payload.elements : [])) {
    const tags = el?.tags && typeof el.tags === "object" ? el.tags : {};
    const name = typeof tags?.name === "string" ? String(tags.name).trim() : "";
    const lat = typeof el?.lat === "number" ? el.lat : (el?.center?.lat ?? null);
    const lng = typeof el?.lon === "number" ? el.lon : (el?.center?.lon ?? null);
    if (!name || lat == null || lng == null) continue;
    const cat = tagToCategory(tags);
    if (!cat) continue;
    const key = name.toLowerCase();
    if (seen[cat].has(key) || pools[cat].length >= limitPerCat) continue;
    seen[cat].add(key);
    pools[cat].push({ name, lat, lng, osm: { type: String(el?.type || "node"), id: String(el?.id || "") } });
  }

  // Build excursion from nature + culture
  const excSeen = new Set<string>();
  pools.excursion = [];
  for (const poi of [...(pools.nature || []), ...(pools.culture || [])]) {
    const k = poi.name.toLowerCase();
    if (excSeen.has(k)) continue;
    excSeen.add(k);
    pools.excursion.push(poi);
    if (pools.excursion.length >= limitPerCat) break;
  }
  return pools;
}

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

// Returns null when ALL mirrors fail (infra down), {} when query returned 0 results
async function fetchAllPoisFromOverpass(center: LatLng, radiusMeters: number): Promise<Record<Category, Poi[]> | null> {
  const cached = cacheGet(center, radiusMeters);
  if (cached) return cached;

  const query = buildMultiCategoryQuery(center, radiusMeters);
  const body = `data=${encodeURIComponent(query)}`;

  for (const url of OVERPASS_ENDPOINTS) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 42_000);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body,
        cache: "no-store",
        signal: ctrl.signal,
      });
      const payload = await resp.json().catch(() => null);
      if (resp.ok && payload) {
        const pools = parseOverpassResponse(payload, 60);
        cacheSet(center, radiusMeters, pools);
        return pools;
      }
      if (resp.status === 400) break; // malformed query, stop
    } catch {
      // timeout or network error → try next mirror
    } finally {
      clearTimeout(t);
    }
  }
  return null; // all mirrors failed
}

// ─── Main POI loader: Overpass with Gemini fallback ───────────────────────────

type PoiLoadResult =
  | { pools: Record<Category, Poi[]>; source: "overpass" | "gemini" }
  | { pools: null; err: string };

async function loadPoisForStop(
  stop: { label: string; center: LatLng },
  anchor: any,
  regionHints: any
): Promise<PoiLoadResult> {
  let center: LatLng = stop.center;

  // Quick density probe (small radius, single call)
  const rough = await fetchAllPoisFromOverpass(center, 3500);

  if (rough !== null) {
    const roughCount = sumPools(rough);

    // Country-level input: recenter to capital
    if (roughCount <= 2) {
      const cap = await geocodePhotonPreferred(`${stop.label} capital`, { anchor, regionHints, maxDistanceKm: 50000 });
      if (cap) {
        center = { lat: cap.lat, lng: cap.lng };
        const capRough = await fetchAllPoisFromOverpass(center, 3500);
        if (capRough !== null) {
          const capCount = sumPools(capRough);
          const radius = proposeRadiusMeters(capCount);
          const full = radius !== 3500
            ? await fetchAllPoisFromOverpass(center, radius)
            : capRough;
          if (full !== null) return { pools: full, source: "overpass" };
          // Capital full-radius failed → fall through to Gemini
        }
        // Capital rough failed → fall through to Gemini
      }
      // No capital geocode → fall through to Gemini
    } else {
      // Normal city: use adaptive radius
      const radius = proposeRadiusMeters(roughCount);
      if (radius === 3500) return { pools: rough, source: "overpass" };
      const full = await fetchAllPoisFromOverpass(center, radius);
      if (full !== null) return { pools: full, source: "overpass" };
      // Full-radius failed → fall through to Gemini
    }
  }

  // ── Gemini fallback ───────────────────────────────────────────────────────
  console.warn(`[ai-planner] Overpass unavailable for "${stop.label}", using Gemini fallback`);
  const geminiPools = await fetchPoisFromGemini(stop.label);
  if (geminiPools && sumPools(geminiPools) >= 4) {
    // Cache so chat refinements reuse this without extra Gemini calls
    cacheSet(center, 3500, geminiPools);
    return { pools: geminiPools, source: "gemini" };
  }

  return {
    pools: null,
    err: `No he encontrado lugares suficientes para "${stop.label}". Prueba con una ciudad concreta (ej. "Buenos Aires", "Mendoza", "Bariloche").`,
  };
}

// ─── Day planning ─────────────────────────────────────────────────────────────

function proposeMinItems(type: "big_city" | "small_city" | "nature") {
  return type === "nature" ? 2 : type === "small_city" ? 3 : 4;
}

function classifyDayType(pools: Record<Category, Poi[]>): "big_city" | "small_city" | "nature" {
  const culture = pools.culture?.length || 0;
  const nature = pools.nature?.length || 0;
  const market = pools.market?.length || 0;
  if (nature >= Math.max(10, culture + market)) return "nature";
  return (culture + market) >= 25 ? "big_city" : "small_city";
}

function slotTemplate(type: "big_city" | "small_city" | "nature") {
  if (type === "nature") return [
    { time: "09:00", cats: ["nature", "excursion"] as Category[] },
    { time: "16:30", cats: ["viewpoint", "nature"] as Category[] },
    { time: "20:30", cats: ["gastro_experience", "culture"] as Category[] },
  ];
  if (type === "small_city") return [
    { time: "10:00", cats: ["culture", "neighborhood"] as Category[] },
    { time: "13:30", cats: ["market", "culture"] as Category[] },
    { time: "17:00", cats: ["viewpoint", "culture"] as Category[] },
    { time: "20:30", cats: ["gastro_experience", "night"] as Category[] },
  ];
  return [
    { time: "09:30", cats: ["culture"] as Category[] },
    { time: "12:30", cats: ["market", "neighborhood"] as Category[] },
    { time: "16:30", cats: ["culture", "viewpoint"] as Category[] },
    { time: "20:30", cats: ["gastro_experience", "night"] as Category[] },
  ];
}

function ensureNoGenericTitle(title: string) {
  return !/\b(paseo|zona animada|ambiente local|tiempo libre|explorar)\b/i.test(title.toLowerCase());
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const body = await req.json().catch(() => null);
    const destinationsRaw = Array.isArray(body?.destinations) ? body.destinations
      : Array.isArray(body?.places) ? body.places : [];
    const destinations = (destinationsRaw as any[]).map((x) => cleanString(x)).filter(Boolean).slice(0, 10);
    const startDate = cleanString(body?.start_date || body?.startDate);
    const endDate = cleanString(body?.end_date || body?.endDate);
    const selectedByStop = (body?.selectedPoisByStop && typeof body.selectedPoisByStop === "object") ? body.selectedPoisByStop : null;
    const staysInput = Array.isArray(body?.stays) ? body.stays : null;
    const regenerateBadOnly = Boolean(body?.regenerateBadOnly);
    const badDayNums: number[] | null = Array.isArray(body?.badDayNums)
      ? body.badDayNums.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n >= 1) : null;
    const targetDayNums: number[] | null = Array.isArray(body?.targetDayNums)
      ? body.targetDayNums.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n >= 1) : null;

    if (!destinations.length) return NextResponse.json({ error: "Faltan destinos." }, { status: 400 });
    if (!isoOk(startDate) || !isoOk(endDate)) return NextResponse.json({ error: "Fechas inválidas." }, { status: 400 });

    const totalDays = dayCountBetween(startDate, endDate);
    const destinationLabel = destinations.join(" · ");
    const anchor = await geocodeTripAnchor(destinationLabel);
    const regionHints = regionHintsFromDestination(destinationLabel);

    // ── 1. Geocode all stops in parallel ─────────────────────────────────────
    const stopGeo = await Promise.all(
      destinations.map(async (label) => {
        const g = await geocodePhotonPreferred(label, { anchor, regionHints, maxDistanceKm: 50000 });
        return { label, geo: g };
      })
    );
    const stops = stopGeo
      .map((s) => ({
        label: s.label,
        center: s.geo ? ({ lat: s.geo.lat, lng: s.geo.lng } as LatLng) : null,
        resolvedLabel: s.geo?.label || s.label,
      }))
      .filter((s) => Boolean(s.center)) as Array<{ label: string; resolvedLabel: string; center: LatLng }>;

    if (!stops.length) return NextResponse.json({ error: "No se pudieron geocodificar los destinos." }, { status: 400 });

    // ── 2. Load POIs for all stops in parallel (Overpass → Gemini fallback) ──
    const stopResults = await Promise.all(
      stops.map((stop) => loadPoisForStop(stop, anchor, regionHints))
    );

    const poisByStop: Record<string, Record<Category, Poi[]>> = {};
    for (let i = 0; i < stops.length; i++) {
      const result = stopResults[i]!;
      if (!result.pools) {
        return NextResponse.json({ error: (result as any).err }, { status: 400 });
      }
      poisByStop[stops[i]!.label] = result.pools;
    }

    // ── 3. Distribute nights ─────────────────────────────────────────────────
    const weights = stops.map((s) => {
      const p = poisByStop[s.label];
      return { stop: s.label, w: Math.max(1, (p?.culture?.length || 0) + (p?.market?.length || 0) + (p?.nature?.length || 0) * 0.9) };
    });
    const sumW = weights.reduce((a, b) => a + b.w, 0) || 1;

    let stays: Array<{ stop: string; nights: number }> = [];
    if (staysInput?.length) {
      stays = staysInput
        .map((x: any) => ({ stop: cleanString(x?.stop), nights: clamp(Number(x?.nights) || 1, 1, 60) }))
        .filter((x: any) => Boolean(x.stop));
    } else {
      stays = weights.map(({ stop, w }) => ({ stop, nights: Math.max(1, Math.round((w / sumW) * totalDays)) }));
      let sum = stays.reduce((a, b) => a + b.nights, 0);
      while (sum > totalDays) {
        const idx = stays.findIndex((s) => s.nights > 1);
        if (idx < 0) break;
        stays[idx]!.nights -= 1; sum -= 1;
      }
      while (sum < totalDays) {
        const best = weights.slice().sort((a, b) => b.w - a.w)[0]?.stop;
        const idx = Math.max(0, stays.findIndex((s) => s.stop === best));
        stays[idx]!.nights += 1; sum += 1;
      }
    }

    // ── 4. City-per-day map ───────────────────────────────────────────────────
    const baseByDay: string[] = [];
    for (const s of stays) for (let i = 0; i < s.nights; i++) baseByDay.push(s.stop);
    while (baseByDay.length < totalDays) baseByDay.push(stays[stays.length - 1]?.stop || stops[0]!.label);
    baseByDay.splice(totalDays);

    // ── 5. User-selected POIs ────────────────────────────────────────────────
    const selectedNamesByStop: Record<string, Set<string>> = {};
    if (selectedByStop) {
      for (const k of Object.keys(selectedByStop)) {
        const arr = Array.isArray((selectedByStop as any)[k]) ? (selectedByStop as any)[k] : [];
        selectedNamesByStop[k] = new Set(
          arr.map((x: any) => cleanString(x?.name || x)).filter(Boolean).map((x: string) => x.toLowerCase())
        );
      }
    }

    // ── 6. Build itinerary days ───────────────────────────────────────────────
    const usedNames = new Set<string>();

    const makeDay = (dayNum: number, stop: string) => {
      const pools = poisByStop[stop];
      const type = classifyDayType(pools);
      const minItems = proposeMinItems(type);
      const requireEvening = type !== "nature";
      const slots = slotTemplate(type);

      const pickFromCats = (cats: Category[]): Poi | null => {
        for (const cat of cats) {
          const pool = pools?.[cat] || [];
          const sel = selectedNamesByStop[stop];
          if (sel?.size) {
            const hit = pool.find((p) => sel.has(p.name.toLowerCase()) && !usedNames.has(p.name.toLowerCase()));
            if (hit) return hit;
          }
          const hit2 = pool.find((p) => !usedNames.has(p.name.toLowerCase()));
          if (hit2) return hit2;
        }
        return null;
      };

      const items: any[] = [];
      for (const s of slots) {
        const poi = pickFromCats(s.cats);
        if (!poi) continue;
        const title = poi.name.trim();
        if (!ensureNoGenericTitle(title)) continue;
        usedNames.add(title.toLowerCase());
        items.push({ title, activity_kind: s.cats[0] || "visit", activity_type: "general", place_name: poi.name, address: `${poi.name}, ${stop}`, latitude: poi.lat, longitude: poi.lng, activity_time: s.time, source: "ai_planner" });
      }

      const fillerCats: Category[] = type === "nature"
        ? ["nature", "viewpoint", "excursion"]
        : ["culture", "market", "viewpoint", "neighborhood"];

      while (items.length < minItems) {
        const poi = pickFromCats(fillerCats);
        if (!poi) break;
        const title = poi.name.trim();
        if (!ensureNoGenericTitle(title)) continue;
        usedNames.add(title.toLowerCase());
        const time = ["10:00", "13:30", "17:00", "20:30"][Math.min(items.length, 3)]!;
        items.push({ title, activity_kind: fillerCats[0], activity_type: "general", place_name: poi.name, address: `${poi.name}, ${stop}`, latitude: poi.lat, longitude: poi.lng, activity_time: time, source: "ai_planner" });
      }

      if (requireEvening) {
        const last = items.map((it) => String(it.activity_time || "")).sort().slice(-1)[0] || "";
        if (last && last < "18:00") {
          const poi = pickFromCats(["gastro_experience", "night", "culture"]);
          if (poi && ensureNoGenericTitle(poi.name) && !usedNames.has(poi.name.toLowerCase())) {
            usedNames.add(poi.name.toLowerCase());
            items.push({ title: poi.name.trim(), activity_kind: "gastro_experience", activity_type: "general", place_name: poi.name, address: `${poi.name}, ${stop}`, latitude: poi.lat, longitude: poi.lng, activity_time: "20:30", source: "ai_planner" });
          }
        }
      }

      items.sort((a, b) => String(a.activity_time || "").localeCompare(String(b.activity_time || "")));
      return { day: dayNum, date: addDaysIso(startDate, dayNum - 1), base: stop, minItems, requireEvening, items };
    };

    // ── 7. Decide which days to (re)generate ─────────────────────────────────
    const incomingDays = Array.isArray(body?.days) ? body.days : null;
    const incomingMap = new Map<number, any>();
    if (incomingDays) for (const d of incomingDays) if (typeof d?.day === "number") incomingMap.set(d.day, d);

    const daysOut: any[] = [];
    for (let i = 0; i < totalDays; i++) {
      const dayNum = i + 1;
      const stop = baseByDay[i] || stays[stays.length - 1]?.stop || stops[0]!.label;
      const pools = poisByStop[stop];
      const type = classifyDayType(pools);
      const minItems = proposeMinItems(type);
      const requireEvening = type !== "nature";

      const existing = incomingMap.get(dayNum);
      const isBad = existing ? inferBadDay(existing, { minItems, requireEvening }) : true;
      const shouldRegen =
        (Array.isArray(targetDayNums) && targetDayNums.includes(dayNum)) ||
        (!incomingDays && !regenerateBadOnly) ||
        (regenerateBadOnly ? isBad : true) ||
        (Array.isArray(badDayNums) ? badDayNums.includes(dayNum) : false);

      if (!shouldRegen && existing) { daysOut.push(existing); continue; }

      const prev = i >= 1 ? baseByDay[i - 1] : "";
      const isChange = i >= 1 && prev && prev !== stop;
      const day = makeDay(dayNum, stop);

      if (isChange) {
        day.items.unshift({
          title: `Traslado ${prev} → ${stop}`, activity_kind: "transport", activity_type: "general",
          place_name: `${prev} → ${stop}`, address: `${prev} → ${stop}`,
          latitude: null, longitude: null, activity_time: "08:30", source: "ai_planner",
          description: "Bloque de traslado entre ciudades base. Ajusta el medio/hora según tu viaje real.",
        });
        if (day.items.length > 3) day.items.splice(3);
      }

      daysOut.push({
        day: day.day, date: day.date, base: day.base,
        items: day.items.map((it: any) => ({
          title: it.title, description: it.description || null,
          activity_date: day.date, activity_time: it.activity_time,
          place_name: it.place_name || it.title,
          address: it.address || `${it.title}, ${stop}`,
          latitude: typeof it.latitude === "number" ? it.latitude : null,
          longitude: typeof it.longitude === "number" ? it.longitude : null,
          activity_kind: it.activity_kind, activity_type: it.activity_type || "general",
          source: it.source || "ai_planner",
        })),
      });
    }

    // ── 8. Suggestion chips ───────────────────────────────────────────────────
    const suggestions: Record<string, Array<{ category: Category; pois: Poi[] }>> = {};
    for (const stop of stops) {
      const p = poisByStop[stop.label];
      suggestions[stop.label] = [
        { category: "culture", pois: pickN(p.culture || [], 18) },
        { category: "nature", pois: pickN(p.nature || [], 18) },
        { category: "market", pois: pickN(p.market || [], 12) },
        { category: "viewpoint", pois: pickN(p.viewpoint || [], 12) },
        { category: "neighborhood", pois: pickN(p.neighborhood || [], 12) },
        { category: "gastro_experience", pois: pickN(p.gastro_experience || [], 12) },
      ];
    }

    return NextResponse.json({
      ok: true, totalDays, startDate, endDate, destinations,
      stops: stops.map((s) => ({ key: s.label, label: s.resolvedLabel, center: s.center })),
      stays, baseCityByDay: baseByDay, suggestions, days: daysOut,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo generar el borrador." },
      { status: 500 }
    );
  }
}
