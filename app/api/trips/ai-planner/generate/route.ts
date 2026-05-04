import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geocodePhotonPreferred, geocodeTripAnchor, regionHintsFromDestination } from "@/lib/geocoding/photonGeocode";
import { addDaysIso } from "@/lib/trip-ai/tripCreationDates";

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
  "culture",
  "nature",
  "viewpoint",
  "neighborhood",
  "market",
  "excursion",
  "gastro_experience",
  "shopping",
  "night",
];

// ─── In-process cache ─────────────────────────────────────────────────────────
// Key: "<lat>,<lng>,<radiusMeters>" → alle POIs grouped by category.
// TTL: 10 minutes. Avoids hammering Overpass on retries or chat refinements.

type CacheEntry = { pools: Record<Category, Poi[]>; expiresAt: number };
const POI_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

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
  // Evict entries older than TTL to avoid unbounded growth
  if (POI_CACHE.size > 200) {
    const now = Date.now();
    for (const [key, val] of POI_CACHE.entries()) {
      if (now > val.expiresAt) POI_CACHE.delete(key);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanString(v: unknown) {
  return String(v ?? "").trim();
}

function isoOk(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function dedupeByName(rows: Poi[]): Poi[] {
  const seen = new Set<string>();
  const out: Poi[] = [];
  for (const r of rows) {
    const key = r.name.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function pickN<T>(arr: T[], n: number): T[] {
  const out: T[] = [];
  for (const it of arr) {
    out.push(it);
    if (out.length >= n) break;
  }
  return out;
}

function dayCountBetween(start: string, end: string) {
  const a = new Date(`${start}T12:00:00Z`).getTime();
  const b = new Date(`${end}T12:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 1;
  return Math.max(1, Math.round((b - a) / (86400 * 1000)) + 1);
}

function inferBadDay(day: any, ctx: { minItems: number; requireEvening: boolean }) {
  const items = Array.isArray(day?.items) ? day.items : [];
  if (items.length < ctx.minItems) return true;
  if (items.some((it: any) => it?.latitude == null || it?.longitude == null)) return true;
  const titles = items.map((it: any) => String(it?.title || "").toLowerCase());
  const hasGeneric = titles.some((t: string) =>
    /\b(paseo por la ciudad|paseo por el centro|zona animada|ambiente local|tiempo libre|explorar el centro|visita panor[aá]mica)\b/i.test(t)
  );
  if (hasGeneric) return true;
  const hasBadFood = titles.some(
    (t: string) => /\b(almuerzo|cena)\b/i.test(t) && !/\b(bodega|cata|taller|tour|curso|mercado)\b/i.test(t)
  );
  if (hasBadFood) return true;
  if (ctx.requireEvening) {
    const times = items.map((it: any) => String(it?.activity_time || "")).filter(Boolean);
    const last = times.sort().slice(-1)[0] || "";
    if (last && last < "18:00") return true;
  }
  return false;
}

// ─── Overpass: single multi-category query ────────────────────────────────────
//
// KEY CHANGE: instead of 10 sequential requests (one per category), we fire
// ONE Overpass query with named "sets" for each category, return all elements,
// and split them client-side by the set they matched.  This reduces N round-trips
// to Overpass to just 1, making saturation errors ~10× less likely.

function buildMultiCategoryQuery(center: LatLng, radiusMeters: number): string {
  const r = Math.floor(radiusMeters);
  const lat = center.lat;
  const lng = center.lng;
  const around = `(around:${r},${lat},${lng})`;

  // Each category gets a named output set (.culture, .nature, …)
  // We union node+way+relation for each tag combination.
  return `
[out:json][timeout:45];

// CULTURE
(
  node["tourism"="museum"]${around};
  way["tourism"="museum"]${around};
  relation["tourism"="museum"]${around};
  node["tourism"="attraction"]${around};
  way["tourism"="attraction"]${around};
  node["amenity"="theatre"]${around};
  way["amenity"="theatre"]${around};
  node["amenity"="arts_centre"]${around};
  way["amenity"="arts_centre"]${around};
  node["historic"="monument"]${around};
  way["historic"="monument"]${around};
  node["historic"="castle"]${around};
  way["historic"="castle"]${around};
  node["historic"="archaeological_site"]${around};
  way["historic"="archaeological_site"]${around};
)->.culture;

// NATURE
(
  node["leisure"="park"]${around};
  way["leisure"="park"]${around};
  node["boundary"="national_park"]${around};
  way["boundary"="national_park"]${around};
  relation["boundary"="national_park"]${around};
  node["leisure"="nature_reserve"]${around};
  way["leisure"="nature_reserve"]${around};
  node["natural"="peak"]${around};
  node["natural"="waterfall"]${around};
  node["natural"="beach"]${around};
  way["natural"="beach"]${around};
  node["natural"="bay"]${around};
)->.nature;

// VIEWPOINT
(
  node["tourism"="viewpoint"]${around};
  way["tourism"="viewpoint"]${around};
)->.viewpoint;

// NEIGHBORHOOD
(
  node["place"="neighbourhood"]${around};
  way["place"="neighbourhood"]${around};
  node["place"="suburb"]${around};
  way["place"="suburb"]${around};
)->.neighborhood;

// MARKET
(
  node["amenity"="marketplace"]${around};
  way["amenity"="marketplace"]${around};
  relation["amenity"="marketplace"]${around};
)->.market;

// EXCURSION (shares some tags with culture/nature but kept separate for slot logic)
(
  node["tourism"="attraction"]${around};
  way["tourism"="attraction"]${around};
  node["natural"="waterfall"]${around};
  node["natural"="peak"]${around};
  node["boundary"="national_park"]${around};
  way["boundary"="national_park"]${around};
  relation["boundary"="national_park"]${around};
)->.excursion;

// GASTRO
(
  node["tourism"="wine_cellar"]${around};
  way["tourism"="wine_cellar"]${around};
  node["craft"="winery"]${around};
  way["craft"="winery"]${around};
  node["craft"="brewery"]${around};
  way["craft"="brewery"]${around};
  node["amenity"="cooking_school"]${around};
  way["amenity"="cooking_school"]${around};
)->.gastro;

// SHOPPING
(
  node["shop"="department_store"]${around};
  way["shop"="department_store"]${around};
  node["shop"="mall"]${around};
  way["shop"="mall"]${around};
  node["tourism"="gift_shop"]${around};
  way["tourism"="gift_shop"]${around};
)->.shopping;

// NIGHT
(
  node["amenity"="bar"]${around};
  way["amenity"="bar"]${around};
  node["amenity"="pub"]${around};
  way["amenity"="pub"]${around};
  node["amenity"="nightclub"]${around};
  way["amenity"="nightclub"]${around};
  node["amenity"="cinema"]${around};
  way["amenity"="cinema"]${around};
)->.night;

// Output everything from all named sets
(
  .culture;
  .nature;
  .viewpoint;
  .neighborhood;
  .market;
  .excursion;
  .gastro;
  .shopping;
  .night;
);
out center tags 600;
`.trim();
}

// Map OSM tags back to our Category enum so we can split the unified result
function tagToCategory(tags: Record<string, string>): Category | null {
  const t = tags.tourism;
  const a = tags.amenity;
  const h = tags.historic;
  const n = tags.natural;
  const l = tags.leisure;
  const p = tags.place;
  const b = tags.boundary;
  const s = tags.shop;
  const c = tags.craft;

  // Night (check before generic amenity)
  if (a === "bar" || a === "pub" || a === "nightclub" || a === "cinema") return "night";
  // Culture
  if (t === "museum" || a === "arts_centre" || a === "theatre" || h === "monument" || h === "castle" || h === "archaeological_site") return "culture";
  // Nature
  if (l === "park" || l === "nature_reserve" || b === "national_park" || n === "peak" || n === "waterfall" || n === "beach" || n === "bay") return "nature";
  // Viewpoint
  if (t === "viewpoint") return "viewpoint";
  // Market
  if (a === "marketplace") return "market";
  // Gastro
  if (t === "wine_cellar" || c === "winery" || c === "brewery" || a === "cooking_school") return "gastro_experience";
  // Shopping
  if (s === "department_store" || s === "mall" || t === "gift_shop") return "shopping";
  // Neighborhood
  if (p === "neighbourhood" || p === "suburb") return "neighborhood";
  // Excursion / attraction (after more specific checks)
  if (t === "attraction") return "culture"; // attraction goes to culture first, excursion pool is built from culture
  // Fallback
  return null;
}

// Parse Overpass JSON response into pools grouped by category
function parseOverpassResponse(payload: any, limitPerCat: number): Record<Category, Poi[]> {
  const pools: Record<Category, Poi[]> = {} as any;
  for (const cat of ALL_CATEGORIES) pools[cat] = [];

  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  const seenByCategory: Record<Category, Set<string>> = {} as any;
  for (const cat of ALL_CATEGORIES) seenByCategory[cat] = new Set();

  for (const el of elements) {
    const tags = el?.tags && typeof el.tags === "object" ? el.tags : {};
    const name = typeof tags?.name === "string" ? String(tags.name).trim() : "";
    const lat = typeof el?.lat === "number" ? el.lat : typeof el?.center?.lat === "number" ? el.center.lat : null;
    const lng = typeof el?.lon === "number" ? el.lon : typeof el?.center?.lon === "number" ? el.center.lon : null;
    if (!name || lat == null || lng == null) continue;

    const cat = tagToCategory(tags);
    if (!cat) continue;

    const key = name.toLowerCase();
    if (seenByCategory[cat].has(key)) continue;
    if ((pools[cat] || []).length >= limitPerCat) continue;

    seenByCategory[cat].add(key);
    pools[cat].push({
      name,
      lat,
      lng,
      osm: { type: String(el?.type || "node"), id: String(el?.id || "") },
    });
  }

  // Excursion pool = union of nature peaks/waterfalls + culture attractions (already in their pools)
  // Build it from existing pools so we don't need a separate query
  const excursionSources: Poi[] = [
    ...(pools.nature || []).filter((p) => p.name),
    ...(pools.culture || []).filter((p) => p.name),
  ];
  const excSeen = new Set<string>();
  pools.excursion = [];
  for (const p of excursionSources) {
    const k = p.name.toLowerCase();
    if (excSeen.has(k)) continue;
    excSeen.add(k);
    pools.excursion.push(p);
    if (pools.excursion.length >= limitPerCat) break;
  }

  return pools;
}

// ─── Overpass fetch with fallback mirrors ─────────────────────────────────────

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

async function fetchAllPois(center: LatLng, radiusMeters: number): Promise<Record<Category, Poi[]> | null> {
  // Cache hit — no Overpass call needed
  const cached = cacheGet(center, radiusMeters);
  if (cached) return cached;

  const query = buildMultiCategoryQuery(center, radiusMeters);
  const body = `data=${encodeURIComponent(query)}`;

  const tryEndpoint = async (url: string, timeoutMs: number) => {
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
      const payload = await resp.json().catch(() => null);
      return { ok: resp.ok, status: resp.status, payload };
    } catch {
      return { ok: false, status: 0, payload: null };
    } finally {
      clearTimeout(t);
    }
  };

  let lastWasInfraFailure = false;
  for (const url of OVERPASS_ENDPOINTS) {
    const res = await tryEndpoint(url, 42_000); // 42s — well within maxDuration:120
    if (res.ok && res.payload) {
      const pools = parseOverpassResponse(res.payload, 60);
      cacheSet(center, radiusMeters, pools);
      return pools;
    }
    if (res.status === 400) break; // Bad query — no point retrying other mirrors
    if (res.status === 0 || res.status === 429 || res.status >= 500) {
      lastWasInfraFailure = true;
    }
  }

  return lastWasInfraFailure ? null : {} as Record<Category, Poi[]>;
}

// ─── Radius heuristic ─────────────────────────────────────────────────────────

function proposeRadiusMeters(poiCountEstimate: number): number {
  if (poiCountEstimate <= 2) return 22000;
  if (poiCountEstimate >= 40) return 7000;
  if (poiCountEstimate >= 18) return 12000;
  return 18000;
}

function sumPools(pools: Record<Category, Poi[]>): number {
  let n = 0;
  for (const k of ALL_CATEGORIES) n += Array.isArray(pools[k]) ? pools[k]!.length : 0;
  return n;
}

// ─── Day planning logic ───────────────────────────────────────────────────────

function proposeMinItems(dayType: "big_city" | "small_city" | "nature"): number {
  if (dayType === "nature") return 2;
  if (dayType === "small_city") return 3;
  return 4;
}

function classifyDayType(pools: Record<Category, Poi[]>): "big_city" | "small_city" | "nature" {
  const culture = pools.culture?.length || 0;
  const nature = pools.nature?.length || 0;
  const market = pools.market?.length || 0;
  if (nature >= Math.max(10, culture + market)) return "nature";
  const score = culture + market;
  if (score >= 25) return "big_city";
  return "small_city";
}

function slotTemplate(dayType: "big_city" | "small_city" | "nature") {
  if (dayType === "nature") {
    return [
      { time: "09:00", cats: ["nature", "excursion"] as Category[] },
      { time: "16:30", cats: ["viewpoint", "nature"] as Category[] },
      { time: "20:30", cats: ["gastro_experience", "culture"] as Category[] },
    ];
  }
  if (dayType === "small_city") {
    return [
      { time: "10:00", cats: ["culture", "neighborhood"] as Category[] },
      { time: "13:30", cats: ["market", "culture"] as Category[] },
      { time: "17:00", cats: ["viewpoint", "culture"] as Category[] },
      { time: "20:30", cats: ["gastro_experience", "night"] as Category[] },
    ];
  }
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
    const destinationsRaw = Array.isArray(body?.destinations)
      ? body.destinations
      : Array.isArray(body?.places) ? body.places : [];
    const destinations = (destinationsRaw as any[]).map((x) => cleanString(x)).filter(Boolean).slice(0, 10);
    const startDate = cleanString(body?.start_date || body?.startDate);
    const endDate = cleanString(body?.end_date || body?.endDate);
    const selectedByStop = (body?.selectedPoisByStop && typeof body.selectedPoisByStop === "object")
      ? body.selectedPoisByStop : null;
    const staysInput = Array.isArray(body?.stays) ? body.stays : null;
    const regenerateBadOnly = Boolean(body?.regenerateBadOnly);
    const badDayNums = Array.isArray(body?.badDayNums)
      ? body.badDayNums.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n >= 1) : null;
    const targetDayNums = Array.isArray(body?.targetDayNums)
      ? body.targetDayNums.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n >= 1) : null;

    if (!destinations.length) return NextResponse.json({ error: "Faltan destinos." }, { status: 400 });
    if (!isoOk(startDate) || !isoOk(endDate)) return NextResponse.json({ error: "Fechas inválidas." }, { status: 400 });

    const totalDays = dayCountBetween(startDate, endDate);
    const destinationLabel = destinations.join(" · ");
    const anchor = await geocodeTripAnchor(destinationLabel);
    const regionHints = regionHintsFromDestination(destinationLabel);

    // ── 1. Geocode all stops in parallel ────────────────────────────────────
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

    // ── 2. Fetch POIs for all stops IN PARALLEL (one query per stop) ─────────
    //
    // Before: 10 sequential Overpass calls per stop (one per category).
    // After:  1 Overpass call per stop, all stops fired in parallel.
    //
    // For N stops: was N×10 sequential round-trips → now N parallel round-trips.

    const poisByStop: Record<string, Record<Category, Poi[]>> = {};

    const stopResults = await Promise.all(
      stops.map(async (stop) => {
        let center: LatLng = stop.center;

        // Quick probe: fetch with small radius to estimate density
        // (single call now because we use multi-category query)
        const rough = await fetchAllPois(center, 3500);
        if (rough === null) return { stop, pools: null, err: "overpass_down" };

        const roughCount = sumPools(rough);

        // Country-level input → re-center to capital city
        if (roughCount <= 2) {
          const cap = await geocodePhotonPreferred(`${stop.label} capital`, { anchor, regionHints, maxDistanceKm: 50000 });
          if (cap) {
            center = { lat: cap.lat, lng: cap.lng };
            const rough2 = await fetchAllPois(center, 3500);
            if (rough2 === null) return { stop, pools: null, err: "overpass_down" };
            const count2 = sumPools(rough2);
            // Use adaptive radius based on capital density
            const radius = proposeRadiusMeters(count2);
            if (radius !== 3500) {
              const full = await fetchAllPois(center, radius);
              if (full === null) return { stop, pools: null, err: "overpass_down" };
              return { stop, pools: full, err: null };
            }
            return { stop, pools: rough2, err: null };
          }
        }

        // Normal city: use adaptive radius with full query
        const radius = proposeRadiusMeters(roughCount);
        if (radius !== 3500) {
          // Cache may already have this; fetchAllPois checks internally
          const full = await fetchAllPois(center, radius);
          if (full === null) return { stop, pools: null, err: "overpass_down" };
          return { stop, pools: full, err: null };
        }

        return { stop, pools: rough, err: null };
      })
    );

    // Check for errors
    for (const result of stopResults) {
      if (result.err === "overpass_down") {
        return NextResponse.json(
          { error: "OSM/Overpass está saturado o no responde ahora mismo. Reintenta en unos segundos." },
          { status: 503 }
        );
      }
      if (!result.pools || sumPools(result.pools) < 4) {
        return NextResponse.json(
          {
            error:
              `No he encontrado suficientes lugares concretos cerca de "${result.stop.label}". ` +
              `Parece un destino demasiado amplio. Prueba a poner una ciudad o región (ej. "Buenos Aires", "Mendoza", "Bariloche").`,
          },
          { status: 400 }
        );
      }
      poisByStop[result.stop.label] = result.pools;
    }

    // ── 3. Distribute nights across stops ────────────────────────────────────

    const weights = stops.map((s) => {
      const pools = poisByStop[s.label];
      const w = (pools?.culture?.length || 0) + (pools?.market?.length || 0) + (pools?.nature?.length || 0) * 0.9;
      return { stop: s.label, w: Math.max(1, w) };
    });
    const sumW = weights.reduce((a, b) => a + b.w, 0) || 1;

    let stays: Array<{ stop: string; nights: number }> = [];
    if (staysInput && staysInput.length) {
      stays = staysInput
        .map((x: any) => ({ stop: cleanString(x?.stop), nights: clamp(Number(x?.nights) || 1, 1, 60) }))
        .filter((x: { stop: string; nights: number }) => Boolean(x.stop));
    } else {
      stays = weights.map(({ stop, w }) => ({ stop, nights: Math.max(1, Math.round((w / sumW) * totalDays)) }));
      let sum = stays.reduce((a, b) => a + b.nights, 0);
      while (sum > totalDays && stays.length) {
        const idx = stays.findIndex((s) => s.nights > 1);
        if (idx < 0) break;
        stays[idx]!.nights -= 1;
        sum -= 1;
      }
      while (sum < totalDays && stays.length) {
        const best = weights.slice().sort((a, b) => b.w - a.w)[0]?.stop;
        const idx = stays.findIndex((s) => s.stop === best) >= 0 ? stays.findIndex((s) => s.stop === best) : 0;
        stays[idx]!.nights += 1;
        sum += 1;
      }
    }

    // ── 4. Build day-by-day city map ─────────────────────────────────────────

    const baseByDay: string[] = [];
    for (const s of stays) for (let i = 0; i < s.nights; i++) baseByDay.push(s.stop);
    while (baseByDay.length < totalDays) baseByDay.push(stays[stays.length - 1]?.stop || stops[0]!.label);
    baseByDay.splice(totalDays);

    // ── 5. Selected POIs (user picks) ────────────────────────────────────────

    const selectedNamesByStop: Record<string, Set<string>> = {};
    if (selectedByStop && typeof selectedByStop === "object") {
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
          const selected = selectedNamesByStop[stop];
          if (selected && selected.size) {
            const hit = pool.find((p) => selected.has(p.name.toLowerCase()) && !usedNames.has(p.name.toLowerCase()));
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
        items.push({
          title,
          activity_kind: s.cats[0] || "visit",
          activity_type: "general",
          place_name: poi.name,
          address: `${poi.name}, ${stop}`,
          latitude: poi.lat,
          longitude: poi.lng,
          activity_time: s.time,
          source: "ai_planner",
        });
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
        const time =
          items.length === 0 ? "10:00" :
          items.length === 1 ? "13:30" :
          items.length === 2 ? "17:00" : "20:30";
        items.push({
          title,
          activity_kind: fillerCats[0],
          activity_type: "general",
          place_name: poi.name,
          address: `${poi.name}, ${stop}`,
          latitude: poi.lat,
          longitude: poi.lng,
          activity_time: time,
          source: "ai_planner",
        });
      }

      if (requireEvening) {
        const last = items.map((it) => String(it.activity_time || "")).sort().slice(-1)[0] || "";
        if (last && last < "18:00") {
          const poi = pickFromCats(["gastro_experience", "night", "culture"]);
          if (poi) {
            const title = poi.name.trim();
            if (ensureNoGenericTitle(title) && !usedNames.has(title.toLowerCase())) {
              usedNames.add(title.toLowerCase());
              items.push({
                title,
                activity_kind: "gastro_experience",
                activity_type: "general",
                place_name: poi.name,
                address: `${poi.name}, ${stop}`,
                latitude: poi.lat,
                longitude: poi.lng,
                activity_time: "20:30",
                source: "ai_planner",
              });
            }
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

      if (!shouldRegen && existing) {
        daysOut.push(existing);
        continue;
      }

      const prev = i >= 1 ? baseByDay[i - 1] : "";
      const isChange = i >= 1 && prev && prev !== stop;
      const day = makeDay(dayNum, stop);

      if (isChange) {
        day.items.unshift({
          title: `Traslado ${prev} → ${stop}`,
          activity_kind: "transport",
          activity_type: "general",
          place_name: `${prev} → ${stop}`,
          address: `${prev} → ${stop}`,
          latitude: null,
          longitude: null,
          activity_time: "08:30",
          source: "ai_planner",
          description: "Bloque de traslado entre ciudades base. Ajusta el medio/hora según tu viaje real.",
        });
        if (day.items.length > 3) day.items.splice(3);
      }

      daysOut.push({
        day: day.day,
        date: day.date,
        base: day.base,
        items: day.items.map((it: any) => ({
          title: it.title,
          description: it.description || null,
          activity_date: day.date,
          activity_time: it.activity_time,
          place_name: it.place_name || it.title,
          address: it.address || `${it.title}, ${stop}`,
          latitude: typeof it.latitude === "number" ? it.latitude : null,
          longitude: typeof it.longitude === "number" ? it.longitude : null,
          activity_kind: it.activity_kind,
          activity_type: it.activity_type || "general",
          source: it.source || "ai_planner",
        })),
      });
    }

    // ── 8. Suggestions chips ──────────────────────────────────────────────────

    const suggestions: Record<string, Array<{ category: Category; pois: Poi[] }>> = {};
    for (const stop of stops) {
      const pools = poisByStop[stop.label];
      suggestions[stop.label] = [
        { category: "culture", pois: pickN(pools.culture || [], 18) },
        { category: "nature", pois: pickN(pools.nature || [], 18) },
        { category: "market", pois: pickN(pools.market || [], 12) },
        { category: "viewpoint", pois: pickN(pools.viewpoint || [], 12) },
        { category: "neighborhood", pois: pickN(pools.neighborhood || [], 12) },
        { category: "gastro_experience", pois: pickN(pools.gastro_experience || [], 12) },
      ];
    }

    return NextResponse.json({
      ok: true,
      totalDays,
      startDate,
      endDate,
      destinations,
      stops: stops.map((s) => ({ key: s.label, label: s.resolvedLabel, center: s.center })),
      stays,
      baseCityByDay: baseByDay,
      suggestions,
      days: daysOut,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo generar el borrador." },
      { status: 500 }
    );
  }
}
