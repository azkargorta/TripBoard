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
type Poi = {
  name: string;
  lat: number;
  lng: number;
  osm?: { type: string; id: string };
  /** Tags OSM (para priorizar lugares “típicos” y aplicar reglas tipo “sin museos”) */
  tags?: Record<string, string>;
};

type Category =
  | "culture" | "nature" | "viewpoint" | "neighborhood"
  | "market" | "excursion" | "gastro_experience" | "shopping" | "night";

const ALL_CATEGORIES: Category[] = [
  "culture", "nature", "viewpoint", "neighborhood", "market",
  "excursion", "gastro_experience", "shopping", "night",
];

// ─── In-process cache (10 min TTL) ───────────────────────────────────────────

type CacheEntry = { pools: Record<Category, Poi[]>; expiresAt: number };
const POI_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function cacheKey(center: LatLng, r: number) { return `${center.lat.toFixed(4)},${center.lng.toFixed(4)},${r}`; }
function cacheGet(center: LatLng, r: number): Record<Category, Poi[]> | null {
  const e = POI_CACHE.get(cacheKey(center, r));
  if (!e) return null;
  if (Date.now() > e.expiresAt) { POI_CACHE.delete(cacheKey(center, r)); return null; }
  return e.pools;
}
function cacheSet(center: LatLng, r: number, pools: Record<Category, Poi[]>) {
  POI_CACHE.set(cacheKey(center, r), { pools, expiresAt: Date.now() + CACHE_TTL_MS });
  if (POI_CACHE.size > 200) { const now = Date.now(); for (const [k, v] of POI_CACHE) if (now > v.expiresAt) POI_CACHE.delete(k); }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanString(v: unknown) { return String(v ?? "").trim(); }
function isoOk(s: string) { return /^\d{4}-\d{2}-\d{2}$/.test(s); }
function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

function dedupeByName(rows: Poi[]): Poi[] {
  const seen = new Set<string>();
  const out: Poi[] = [];
  for (const r of rows) { const k = r.name.trim().toLowerCase(); if (!k || seen.has(k)) continue; seen.add(k); out.push(r); }
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
  if (count <= 2) return 22000; if (count >= 40) return 7000; if (count >= 18) return 12000; return 18000;
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

// ─── Haversine distance (km) ──────────────────────────────────────────────────

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sin2 = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(sin2));
}

// ─── Smart day distribution ───────────────────────────────────────────────────
//
// Combines three signals:
//  1. Tourist weight   — how many POIs a place has (proxy for richness)
//  2. Distance penalty — places far from their neighbours need transit days
//  3. Preference boost — if user mentioned keywords matching a place's strengths
//
// Returns { stop, nights, reason }[]  — "reason" is shown in the UI

type StayProposal = { stop: string; nights: number; reason: string };

function distributeNightsSmart(
  stops: Array<{ label: string; center: LatLng }>,
  poisByStop: Record<string, Record<Category, Poi[]>>,
  totalDays: number,
  freeText: string
): StayProposal[] {
  if (stops.length === 0) return [];
  if (stops.length === 1) return [{ stop: stops[0]!.label, nights: totalDays, reason: `${totalDays} días para explorar a fondo` }];

  const prefs = freeText.toLowerCase();

  // Signal 1: tourist weight (log-scaled to avoid huge cities dominating completely)
  const tourismW = stops.map((s) => {
    const p = poisByStop[s.label];
    const raw = (p?.culture?.length || 0) * 1.2 + (p?.market?.length || 0) + (p?.nature?.length || 0) * 0.9 + (p?.gastro_experience?.length || 0) * 0.8 + (p?.viewpoint?.length || 0) * 0.6;
    return Math.log1p(Math.max(1, raw));
  });

  // Signal 2: distance penalty — each leg adds ~0.5 "virtual days" per 500 km
  const transitPenalty = stops.map((s, i) => {
    if (i === 0) return 0;
    const km = haversineKm(stops[i - 1]!.center, s.center);
    return (km / 500) * 0.5; // 0 for nearby, ~0.5 for 500km, ~1 for 1000km
  });

  // Signal 3: preference boost — match keywords to categories
  const prefBoost = stops.map((s) => {
    const p = poisByStop[s.label];
    let boost = 0;
    const hasNature = (p?.nature?.length || 0) > 5;
    const hasGastro = (p?.gastro_experience?.length || 0) > 2;
    const hasCulture = (p?.culture?.length || 0) > 8;
    if (hasNature && /naturaleza|senderismo|parque|monta[ñn]a|trekking|outdoor|aire libre|paisaje/i.test(prefs)) boost += 0.4;
    if (hasGastro && /gastronom[ií]a|comida|restaurante|vino|bodega|cocina|food/i.test(prefs)) boost += 0.3;
    if (hasCulture && /cultura|historia|museo|arte|arquitectura|patrimonio/i.test(prefs)) boost += 0.3;
    return boost;
  });

  // Combined score per stop
  const scores = stops.map((_, i) => Math.max(0.1, tourismW[i]! + prefBoost[i]!));
  const totalScore = scores.reduce((a, b) => a + b, 0);

  // Total transit "days" needed (fractional)
  const totalTransitFrac = transitPenalty.reduce((a, b) => a + b, 0);
  const availableDays = Math.max(stops.length, totalDays - Math.round(totalTransitFrac));

  // Base allocation proportional to score
  const rawNights = scores.map((s) => (s / totalScore) * availableDays);

  // Floor to minimum 1, then round
  let nights = rawNights.map((n) => Math.max(1, Math.round(n)));

  // Add transit overhead to legs with long distances
  transitPenalty.forEach((pen, i) => {
    if (pen >= 0.5 && i > 0) nights[i] = Math.max(nights[i]!, 2); // at least 2 days if far leg
  });

  // Adjust sum to exactly totalDays
  let sum = nights.reduce((a, b) => a + b, 0);
  // Add days to highest-scoring stops first
  const sortedIdx = scores.map((_, i) => i).sort((a, b) => scores[b]! - scores[a]!);
  while (sum < totalDays) { nights[sortedIdx[sum % sortedIdx.length]!]! += 1; sum++; }
  while (sum > totalDays) {
    const idx = sortedIdx.slice().reverse().find((i) => nights[i]! > 1);
    if (idx === undefined) break;
    nights[idx]! -= 1; sum--;
  }

  // Build reasons
  return stops.map((s, i) => {
    const n = nights[i]!;
    const parts: string[] = [];
    const isBig = tourismW[i]! > Math.log1p(15);
    const isNature = (poisByStop[s.label]?.nature?.length || 0) > (poisByStop[s.label]?.culture?.length || 0);
    const farLeg = transitPenalty[i]! >= 0.5;

    if (isBig) parts.push("ciudad con mucho que ver");
    else if (isNature) parts.push("destino natural");
    else parts.push("ciudad compacta");
    if (farLeg) parts.push("incluye día de traslado");
    if (prefBoost[i]! > 0.3) parts.push("ajustado a tus preferencias");

    return { stop: s.label, nights: n, reason: `${n} día${n !== 1 ? "s" : ""} — ${parts.join(", ")}` };
  });
}

// ─── Viability check ──────────────────────────────────────────────────────────
//
// Returns null if viable, or a { warning, suggestions } object if not.
// Logic: minimum sensible days per stop depends on distance between stops.

export type ViabilityResult = {
  viable: boolean;
  warning: string;
  suggestions: Array<{ stops: string[]; reason: string }>;
};

function checkViability(
  stops: Array<{ label: string; center: LatLng }>,
  totalDays: number,
  poisByStop: Record<string, Record<Category, Poi[]>>
): ViabilityResult | null {
  if (stops.length <= 1) return null;

  // Minimum days needed: 1 per stop + transit days for legs > 300 km
  let minDaysNeeded = stops.length;
  for (let i = 1; i < stops.length; i++) {
    const km = haversineKm(stops[i - 1]!.center, stops[i]!.center);
    if (km > 300) minDaysNeeded += 1;
    if (km > 800) minDaysNeeded += 1;
  }

  if (totalDays >= minDaysNeeded) return null;

  // Build concrete suggestions: best N stops for the available days
  // Score each stop by tourist weight
  const scored = stops.map((s) => {
    const p = poisByStop[s.label];
    const w = (p?.culture?.length || 0) + (p?.nature?.length || 0) + (p?.market?.length || 0);
    return { label: s.label, w };
  }).sort((a, b) => b.w - a.w);

  // Suggest combinations that fit
  const suggestions: ViabilityResult["suggestions"] = [];

  // Option 1: top 1 stop
  if (totalDays >= 2) {
    suggestions.push({
      stops: [scored[0]!.label],
      reason: `${totalDays} días solo en ${scored[0]!.label} — tiempo suficiente para verlo bien`,
    });
  }

  // Option 2: top 2 stops if they're close enough
  if (totalDays >= 3 && scored.length >= 2) {
    const km = haversineKm(
      stops.find((s) => s.label === scored[0]!.label)!.center,
      stops.find((s) => s.label === scored[1]!.label)!.center
    );
    if (km < 600) {
      suggestions.push({
        stops: [scored[0]!.label, scored[1]!.label],
        reason: `${scored[0]!.label} + ${scored[1]!.label} — están relativamente cerca (${Math.round(km)} km)`,
      });
    }
  }

  // Option 3: first + last (if a logical route)
  if (totalDays >= 3 && scored.length >= 3) {
    suggestions.push({
      stops: [scored[0]!.label, scored[scored.length - 1]!.label],
      reason: `Empieza en ${scored[0]!.label} y termina en ${scored[scored.length - 1]!.label}`,
    });
  }

  return {
    viable: false,
    warning: `Con ${totalDays} día${totalDays !== 1 ? "s" : ""} y ${stops.length} destinos, el viaje está muy justo. Se necesitarían mínimo ${minDaysNeeded} días para hacerlo bien.`,
    suggestions: suggestions.slice(0, 3),
  };
}

// ─── Gemini POI fallback ──────────────────────────────────────────────────────

function buildGeminiPoiPrompt(city: string, minPerCategory: number): string {
  return `Eres un experto en turismo. Genera puntos de interés REALES con coordenadas GPS precisas para: "${city}".

Devuelve SOLO JSON válido (sin markdown, sin texto extra). Esquema exacto:
{"culture":[{"name":"...","lat":0.0,"lng":0.0}],"nature":[...],"viewpoint":[...],"neighborhood":[...],"market":[...],"excursion":[...],"gastro_experience":[...],"shopping":[...],"night":[...]}

Reglas:
- MÍNIMO ${minPerCategory} ítems por categoría. Más es mejor.
- POIs REALES y CONCRETOS (nombre propio verificable). PROHIBIDO nombres genéricos.
- Coordenadas lat/lng reales y precisas para ese POI.
- Si es región o país, usa su ciudad principal Y otras ciudades destacadas distribuyendo ítems entre ellas.`;
}

async function fetchPoisFromGemini(cityLabel: string, totalDays: number): Promise<Record<Category, Poi[]> | null> {
  const minPerCategory = Math.max(15, Math.ceil((totalDays * 4) / ALL_CATEGORIES.length) + 8);
  const tokenBudget = Math.min(8192, 2048 + minPerCategory * 60);
  try {
    const raw = await askGemini(buildGeminiPoiPrompt(cityLabel, minPerCategory), "planning", { maxOutputTokens: tokenBudget });
    const parsed = extractJsonObject(raw) as any;
    if (!parsed || typeof parsed !== "object") return null;
    const pools: Record<Category, Poi[]> = {} as any;
    for (const cat of ALL_CATEGORIES) {
      const arr = Array.isArray(parsed[cat]) ? parsed[cat] : [];
      pools[cat] = dedupeByName(arr.map((item: any) => {
        const name = cleanString(item?.name || "");
        const lat = typeof item?.lat === "number" ? item.lat : null;
        const lng = typeof item?.lng === "number" ? item.lng : null;
        if (!name || lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
        return { name, lat, lng } as Poi;
      }).filter(Boolean) as Poi[]);
    }
    if ((pools.excursion || []).length < 3) pools.excursion = dedupeByName([...(pools.nature || []), ...(pools.culture || [])]).slice(0, minPerCategory);
    return sumPools(pools) >= 4 ? pools : null;
  } catch (e) { console.error("[ai-planner] Gemini POI fallback failed:", e); return null; }
}

// ─── Overpass ─────────────────────────────────────────────────────────────────

function buildMultiCategoryQuery(center: LatLng, radiusMeters: number): string {
  const r = Math.floor(radiusMeters);
  const { lat, lng } = center;
  const a = `(around:${r},${lat},${lng})`;
  return `[out:json][timeout:45];
(node["tourism"="museum"]${a};way["tourism"="museum"]${a};node["tourism"="attraction"]${a};way["tourism"="attraction"]${a};node["amenity"="theatre"]${a};way["amenity"="theatre"]${a};node["amenity"="arts_centre"]${a};node["historic"="monument"]${a};way["historic"="monument"]${a};node["historic"="castle"]${a};way["historic"="castle"]${a};node["historic"="archaeological_site"]${a};)->.culture;
(node["leisure"="park"]${a};way["leisure"="park"]${a};relation["boundary"="national_park"]${a};node["leisure"="nature_reserve"]${a};way["leisure"="nature_reserve"]${a};node["natural"="peak"]${a};node["natural"="waterfall"]${a};node["natural"="beach"]${a};way["natural"="beach"]${a};node["natural"="bay"]${a};)->.nature;
(node["tourism"="viewpoint"]${a};way["tourism"="viewpoint"]${a};)->.viewpoint;
(node["place"="neighbourhood"]${a};way["place"="neighbourhood"]${a};node["place"="suburb"]${a};way["place"="suburb"]${a};)->.neighborhood;
(node["amenity"="marketplace"]${a};way["amenity"="marketplace"]${a};relation["amenity"="marketplace"]${a};)->.market;
(node["tourism"="wine_cellar"]${a};node["craft"="winery"]${a};node["craft"="brewery"]${a};node["amenity"="cooking_school"]${a};)->.gastro;
(node["shop"="department_store"]${a};way["shop"="department_store"]${a};node["shop"="mall"]${a};way["shop"="mall"]${a};)->.shopping;
(node["amenity"="bar"]${a};way["amenity"="bar"]${a};node["amenity"="pub"]${a};node["amenity"="nightclub"]${a};node["amenity"="cinema"]${a};)->.night;
(.culture;.nature;.viewpoint;.neighborhood;.market;.gastro;.shopping;.night;);
out center tags 600;`;
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
    const tagRecord: Record<string, string> = {};
    for (const [k2, v2] of Object.entries(tags)) {
      if (typeof v2 === "string" && v2.trim()) tagRecord[k2] = v2;
    }
    pools[cat].push({
      name,
      lat,
      lng,
      osm: { type: String(el?.type || "node"), id: String(el?.id || "") },
      tags: tagRecord,
    });
  }
  const excSeen = new Set<string>();
  pools.excursion = [];
  for (const poi of [...(pools.nature || []), ...(pools.culture || [])]) {
    const k = poi.name.toLowerCase();
    if (excSeen.has(k)) continue; excSeen.add(k); pools.excursion.push(poi);
    if (pools.excursion.length >= limitPerCat) break;
  }
  sortPoolsByIconicity(pools);
  return pools;
}

function poiIconicityScore(tags: Record<string, string> | undefined): number {
  if (!tags) return 0;
  const t = (tags.tourism || "").toLowerCase();
  const a = (tags.amenity || "").toLowerCase();
  const h = (tags.historic || "").toLowerCase();
  const n = (tags.natural || "").toLowerCase();
  let s = 0;
  if (tags.wikidata) s += 12;
  if (tags.wikipedia) s += 8;
  if (tags.wikimedia_commons) s += 2;
  if (tags["heritage:operator"] || tags.heritage) s += 4;
  if (t === "attraction") s += 10;
  if (t === "museum") s += 6;
  if (t === "viewpoint") s += 5;
  if (a === "theatre" || a === "arts_centre") s += 5;
  if (h === "castle" || h === "monument" || h === "archaeological_site") s += 6;
  if (n === "peak" || n === "waterfall" || n === "bay") s += 5;
  const pop = Number(tags.population);
  if (Number.isFinite(pop) && pop > 0) s += Math.min(6, Math.log10(pop + 1));
  return s;
}

function sortPoolsByIconicity(pools: Record<Category, Poi[]>) {
  for (const cat of ALL_CATEGORIES) {
    const arr = pools[cat] || [];
    arr.sort((a, b) => {
      const sa = poiIconicityScore(a.tags) - poiIconicityScore(b.tags);
      if (sa !== 0) return sa;
      return a.name.localeCompare(b.name);
    });
  }
}

function mergeNotes(freeText: string, rulesRaw: unknown): string {
  const rules = Array.isArray(rulesRaw) ? (rulesRaw as any[]).map((x) => cleanString(x)).filter(Boolean) : [];
  return [cleanString(freeText), ...rules].filter(Boolean).join(" | ");
}

function wantsNoMuseums(notes: string) {
  return /\b(sin museo|sin museos|no museo|no museos|evita museos|evitar museos)\b/i.test(notes);
}

function wantsMoreNature(notes: string) {
  return /\b(m[aá]s naturaleza|naturaleza|senderismo|trekking|parques?|monta[ñn]a|aire libre)\b/i.test(notes);
}

function wantsNoNight(notes: string) {
  return /\b(sin vida nocturna|no vida nocturna|no bares|sin bares|no discoteca|sin discoteca)\b/i.test(notes);
}

function isMuseumPoi(p: Poi): boolean {
  const tg = p.tags || {};
  const t = (tg.tourism || "").toLowerCase();
  const a = (tg.amenity || "").toLowerCase();
  return t === "museum" || a === "museum";
}

function filterPoolsForNotes(pools: Record<Category, Poi[]>, notes: string): Record<Category, Poi[]> {
  const out: Record<Category, Poi[]> = {} as any;
  for (const c of ALL_CATEGORIES) out[c] = [...(pools[c] || [])];
  if (wantsNoMuseums(notes)) {
    out.culture = (out.culture || []).filter((p) => !isMuseumPoi(p));
    out.excursion = (out.excursion || []).filter((p) => !isMuseumPoi(p));
  }
  return out;
}

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

async function fetchAllPoisFromOverpass(center: LatLng, radiusMeters: number): Promise<Record<Category, Poi[]> | null> {
  const cached = cacheGet(center, radiusMeters);
  if (cached) return cached;
  const query = buildMultiCategoryQuery(center, radiusMeters);
  const body = `data=${encodeURIComponent(query)}`;
  for (const url of OVERPASS_ENDPOINTS) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 42_000);
    try {
      const resp = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" }, body, cache: "no-store", signal: ctrl.signal });
      const payload = await resp.json().catch(() => null);
      if (resp.ok && payload) { const pools = parseOverpassResponse(payload, 60); cacheSet(center, radiusMeters, pools); return pools; }
      if (resp.status === 400) break;
    } catch { /* next mirror */ } finally { clearTimeout(t); }
  }
  return null;
}

type PoiLoadResult = { pools: Record<Category, Poi[]>; source: "overpass" | "gemini" } | { pools: null; err: string };

async function loadPoisForStop(stop: { label: string; center: LatLng }, anchor: any, regionHints: any, totalDays: number): Promise<PoiLoadResult> {
  let center: LatLng = stop.center;
  const rough = await fetchAllPoisFromOverpass(center, 3500);
  if (rough !== null) {
    const roughCount = sumPools(rough);
    if (roughCount <= 2) {
      const cap = await geocodePhotonPreferred(`${stop.label} capital`, { anchor, regionHints, maxDistanceKm: 50000 });
      if (cap) {
        center = { lat: cap.lat, lng: cap.lng };
        const capRough = await fetchAllPoisFromOverpass(center, 3500);
        if (capRough !== null) {
          const capCount = sumPools(capRough);
          const radius = proposeRadiusMeters(capCount);
          const full = radius !== 3500 ? await fetchAllPoisFromOverpass(center, radius) : capRough;
          if (full !== null) return { pools: full, source: "overpass" };
        }
      }
    } else {
      const radius = proposeRadiusMeters(roughCount);
      if (radius === 3500) return { pools: rough, source: "overpass" };
      const full = await fetchAllPoisFromOverpass(center, radius);
      if (full !== null) return { pools: full, source: "overpass" };
    }
  }
  console.warn(`[ai-planner] Overpass unavailable for "${stop.label}", using Gemini fallback`);
  const geminiPools = await fetchPoisFromGemini(stop.label, totalDays);
  if (geminiPools && sumPools(geminiPools) >= 4) { cacheSet(center, 3500, geminiPools); return { pools: geminiPools, source: "gemini" }; }
  return { pools: null, err: `No he encontrado lugares suficientes para "${stop.label}". Prueba con una ciudad concreta.` };
}

// ─── Day planning ─────────────────────────────────────────────────────────────

function proposeMinItems(type: "big_city" | "small_city" | "nature") { return type === "nature" ? 2 : type === "small_city" ? 3 : 4; }
function classifyDayType(pools: Record<Category, Poi[]>): "big_city" | "small_city" | "nature" {
  const c = pools.culture?.length || 0, n = pools.nature?.length || 0, m = pools.market?.length || 0;
  if (n >= Math.max(10, c + m)) return "nature"; return (c + m) >= 25 ? "big_city" : "small_city";
}

type SlotDef = { time: string; cats: Category[] };

function slotTemplateForDay(type: "big_city" | "small_city" | "nature", dayOrdinalInStop: number, notes: string): SlotDef[] {
  const rot = Math.max(0, dayOrdinalInStop - 1) % 3;
  const natureHeavy = wantsMoreNature(notes);

  if (type === "nature") {
    const base: SlotDef[][] = [
      [
        { time: "09:00", cats: ["nature", "excursion"] },
        { time: "16:30", cats: ["viewpoint", "nature"] },
        { time: "20:30", cats: ["gastro_experience", "culture"] },
      ],
      [
        { time: "09:30", cats: ["excursion", "nature"] },
        { time: "15:30", cats: ["viewpoint", "excursion"] },
        { time: "20:30", cats: ["night", "gastro_experience"] },
      ],
      [
        { time: "10:00", cats: ["nature", "viewpoint"] },
        { time: "16:00", cats: ["excursion", "nature"] },
        { time: "20:30", cats: ["gastro_experience", "shopping"] },
      ],
    ];
    return base[rot]!;
  }

  if (type === "small_city") {
    const base: SlotDef[][] = [
      [
        { time: "10:00", cats: ["culture", "neighborhood"] },
        { time: "13:30", cats: ["market", "culture"] },
        { time: "17:00", cats: ["viewpoint", "culture"] },
        { time: "20:30", cats: ["gastro_experience", "night"] },
      ],
      [
        { time: "10:00", cats: ["neighborhood", "market"] },
        { time: "13:30", cats: ["culture", "viewpoint"] },
        { time: "17:00", cats: ["shopping", "culture"] },
        { time: "20:30", cats: ["gastro_experience", "night"] },
      ],
      [
        { time: "10:00", cats: ["viewpoint", "culture"] },
        { time: "13:30", cats: ["market", "neighborhood"] },
        { time: "17:00", cats: ["culture", "shopping"] },
        { time: "20:30", cats: ["night", "gastro_experience"] },
      ],
    ];
    let slots = base[rot]!;
    if (natureHeavy) {
      slots = slots.map((s) => ({ ...s, cats: s.cats.map((c) => (c === "shopping" ? "nature" : c)) as Category[] }));
    }
    return slots;
  }

  // big_city
  const base: SlotDef[][] = [
    [
      { time: "09:30", cats: ["culture"] },
      { time: "12:30", cats: ["market", "neighborhood"] },
      { time: "16:30", cats: ["culture", "viewpoint"] },
      { time: "20:30", cats: ["gastro_experience", "night"] },
    ],
    [
      { time: "09:30", cats: ["viewpoint", "culture"] },
      { time: "12:30", cats: ["culture", "market"] },
      { time: "16:30", cats: ["neighborhood", "culture"] },
      { time: "20:30", cats: ["gastro_experience", "night"] },
    ],
    [
      { time: "09:30", cats: ["market", "culture"] },
      { time: "12:30", cats: ["culture", "viewpoint"] },
      { time: "16:30", cats: ["shopping", "culture"] },
      { time: "20:30", cats: ["night", "gastro_experience"] },
    ],
  ];
  let slots = base[rot]!;
  if (natureHeavy) {
    slots = slots.map((s) => ({ ...s, cats: s.cats.map((c) => (c === "shopping" ? "nature" : c)) as Category[] }));
  }
  return slots;
}

function ensureNoGenericTitle(title: string) { return !/\b(paseo|zona animada|ambiente local|tiempo libre|explorar)\b/i.test(title.toLowerCase()); }

function pickPoiForSlot(params: {
  pools: Record<Category, Poi[]>;
  cats: Category[];
  selected: Set<string> | undefined;
  usedToday: Set<string>;
  usedInStop: Set<string>;
  dayOrdinalInStop: number;
  slotIndex: number;
  notes: string;
}): { poi: Poi; kind: Category } | null {
  const { pools, cats, selected, usedToday, usedInStop, dayOrdinalInStop, slotIndex, notes } = params;
  const noMuseum = wantsNoMuseums(notes);

  const collect = (allowReuseInStop: boolean) => {
    const cands: Array<{ poi: Poi; kind: Category }> = [];
    const seen = new Set<string>();
    for (const cat of cats) {
      const pool = pools[cat] || [];
      for (const p of pool) {
        const key = p.name.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        if (usedToday.has(key)) continue;
        if (!allowReuseInStop && usedInStop.has(key)) continue;
        if (noMuseum && isMuseumPoi(p)) continue;
        cands.push({ poi: p, kind: cat });
      }
    }

    // Prioriza selección del usuario
    if (selected && selected.size) {
      cands.sort((a, b) => {
        const as = selected.has(a.poi.name.toLowerCase()) ? 1 : 0;
        const bs = selected.has(b.poi.name.toLowerCase()) ? 1 : 0;
        if (as !== bs) return bs - as;
        const ia = poiIconicityScore(a.poi.tags) - poiIconicityScore(b.poi.tags);
        if (ia !== 0) return ia;
        return a.poi.name.localeCompare(b.poi.name);
      });
    } else {
      cands.sort((a, b) => {
        const ia = poiIconicityScore(a.poi.tags) - poiIconicityScore(b.poi.tags);
        if (ia !== 0) return ia;
        return a.poi.name.localeCompare(b.poi.name);
      });
    }

    const offset = ((dayOrdinalInStop - 1) * 7 + slotIndex * 3) % Math.max(1, cands.length);
    return cands.length ? cands[offset]! : null;
  };

  let picked = collect(false);
  if (!picked) picked = collect(true);
  return picked;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const body = await req.json().catch(() => null);
    const destinationsRaw = Array.isArray(body?.destinations) ? body.destinations : Array.isArray(body?.places) ? body.places : [];
    const destinations = (destinationsRaw as any[]).map((x) => cleanString(x)).filter(Boolean).slice(0, 10);
    const startDate = cleanString(body?.start_date || body?.startDate);
    const endDate = cleanString(body?.end_date || body?.endDate);
    const freeText = cleanString(body?.freeText || "");
    const mergedNotes = mergeNotes(freeText, body?.rules);
    const selectedByStop = (body?.selectedPoisByStop && typeof body.selectedPoisByStop === "object") ? body.selectedPoisByStop : null;
    const staysInput = Array.isArray(body?.stays) ? body.stays : null;
    const regenerateBadOnly = Boolean(body?.regenerateBadOnly);
    const badDayNums: number[] | null = Array.isArray(body?.badDayNums) ? body.badDayNums.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n >= 1) : null;
    const targetDayNums: number[] | null = Array.isArray(body?.targetDayNums) ? body.targetDayNums.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n >= 1) : null;
    // New: if planOnly=true, return just the proposed stay plan (no itinerary)
    const planOnly = Boolean(body?.planOnly);

    if (!destinations.length) return NextResponse.json({ error: "Faltan destinos." }, { status: 400 });
    if (!isoOk(startDate) || !isoOk(endDate)) return NextResponse.json({ error: "Fechas inválidas." }, { status: 400 });

    const totalDays = dayCountBetween(startDate, endDate);

    // ── 1. Geocode stops in parallel ──────────────────────────────────────────
    const destinationLabel = destinations.join(" · ");
    const anchor = await geocodeTripAnchor(destinationLabel);
    const regionHints = regionHintsFromDestination(destinationLabel);
    const stopGeo = await Promise.all(destinations.map(async (label) => {
      const g = await geocodePhotonPreferred(label, { anchor, regionHints, maxDistanceKm: 50000 });
      return { label, geo: g };
    }));
    const stops = stopGeo.map((s) => ({ label: s.label, center: s.geo ? ({ lat: s.geo.lat, lng: s.geo.lng } as LatLng) : null, resolvedLabel: s.geo?.label || s.label })).filter((s) => Boolean(s.center)) as Array<{ label: string; resolvedLabel: string; center: LatLng }>;
    if (!stops.length) return NextResponse.json({ error: "No se pudieron geocodificar los destinos." }, { status: 400 });

    // ── 2. Load POIs for all stops in parallel ────────────────────────────────
    const stopResults = await Promise.all(stops.map((stop) => loadPoisForStop(stop, anchor, regionHints, totalDays)));
    const poisByStop: Record<string, Record<Category, Poi[]>> = {};
    for (let i = 0; i < stops.length; i++) {
      const result = stopResults[i]!;
      if (!result.pools) return NextResponse.json({ error: (result as any).err }, { status: 400 });
      poisByStop[stops[i]!.label] = result.pools;
    }

    // ── 3. Viability check ────────────────────────────────────────────────────
    const viability = checkViability(stops, totalDays, poisByStop);

    // ── 4. Smart stay distribution ────────────────────────────────────────────
    let stays: Array<{ stop: string; nights: number; reason?: string }>;
    if (staysInput?.length) {
      stays = staysInput.map((x: any) => ({ stop: cleanString(x?.stop), nights: clamp(Number(x?.nights) || 1, 1, 60), reason: x?.reason })).filter((x: any) => Boolean(x.stop));
    } else {
      const proposals = distributeNightsSmart(stops, poisByStop, totalDays, mergedNotes);
      stays = proposals;
    }

    // ── 5. If planOnly, return the proposal without building the full itinerary ─
    if (planOnly) {
      return NextResponse.json({
        ok: true,
        planOnly: true,
        totalDays,
        startDate,
        endDate,
        destinations,
        stops: stops.map((s) => ({ key: s.label, label: s.resolvedLabel, center: s.center })),
        stays,
        viability,
      });
    }

    // ── 6. City-per-day map ───────────────────────────────────────────────────
    const baseByDay: string[] = [];
    for (const s of stays) for (let i = 0; i < s.nights; i++) baseByDay.push(s.stop);
    while (baseByDay.length < totalDays) baseByDay.push(stays[stays.length - 1]?.stop || stops[0]!.label);
    baseByDay.splice(totalDays);

    // ── 7. User-selected POIs ─────────────────────────────────────────────────
    const selectedNamesByStop: Record<string, Set<string>> = {};
    if (selectedByStop) {
      for (const k of Object.keys(selectedByStop)) {
        const arr = Array.isArray((selectedByStop as any)[k]) ? (selectedByStop as any)[k] : [];
        selectedNamesByStop[k] = new Set(arr.map((x: any) => cleanString(x?.name || x)).filter(Boolean).map((x: string) => x.toLowerCase()));
      }
    }

    // Ordinal dentro de cada parada (día 1..N en esa ciudad) para rotar plantillas y evitar repetición
    const ordinalInStopByDayIndex: number[] = new Array(totalDays).fill(1);
    const seenCount: Record<string, number> = {};
    for (let i = 0; i < totalDays; i++) {
      const stop = baseByDay[i] || stays[stays.length - 1]?.stop || stops[0]!.label;
      seenCount[stop] = (seenCount[stop] || 0) + 1;
      ordinalInStopByDayIndex[i] = seenCount[stop]!;
    }

    // Evita repetir los mismos POIs en todos los días de un mismo destino
    const usedPoiInStop: Record<string, Set<string>> = {};
    for (const s of stops) usedPoiInStop[s.label] = new Set();

    // ── 8. Build itinerary days ───────────────────────────────────────────────
    const makeDay = (dayNum: number, stop: string, dayOrdinalInStop: number) => {
      const usedNamesThisDay = new Set<string>();
      const rawPools = poisByStop[stop];
      const pools = filterPoolsForNotes(rawPools, mergedNotes);
      const type = classifyDayType(pools);
      const minItems = proposeMinItems(type);
      const requireEvening = type !== "nature" && !wantsNoNight(mergedNotes);
      const slots = slotTemplateForDay(type, dayOrdinalInStop, mergedNotes);
      const sel = selectedNamesByStop[stop];
      const usedStop = usedPoiInStop[stop] || new Set<string>();

      const items: any[] = [];
      slots.forEach((slot, slotIdx) => {
        const picked = pickPoiForSlot({
          pools,
          cats: slot.cats,
          selected: sel,
          usedToday: usedNamesThisDay,
          usedInStop: usedStop,
          dayOrdinalInStop,
          slotIndex: slotIdx,
          notes: mergedNotes,
        });
        if (!picked) return;
        const { poi, kind } = picked;
        const title = poi.name.trim();
        if (!ensureNoGenericTitle(title)) return;
        const key = title.toLowerCase();
        usedNamesThisDay.add(key);
        usedStop.add(key);
        items.push({
          title,
          activity_kind: kind,
          activity_type: "general",
          place_name: poi.name,
          address: `${poi.name}, ${stop}`,
          latitude: poi.lat,
          longitude: poi.lng,
          activity_time: slot.time,
          source: "ai_planner",
        });
      });

      const fillerCats: Category[] =
        type === "nature" ? ["nature", "viewpoint", "excursion"] : wantsMoreNature(mergedNotes) ? ["nature", "viewpoint", "excursion", "culture"] : ["culture", "market", "viewpoint", "neighborhood"];
      let fillerIdx = 0;
      while (items.length < minItems) {
        const picked = pickPoiForSlot({
          pools,
          cats: fillerCats,
          selected: sel,
          usedToday: usedNamesThisDay,
          usedInStop: usedStop,
          dayOrdinalInStop,
          slotIndex: slots.length + fillerIdx,
          notes: mergedNotes,
        });
        fillerIdx++;
        if (!picked) break;
        const { poi, kind } = picked;
        const title = poi.name.trim();
        if (!ensureNoGenericTitle(title)) continue;
        const key = title.toLowerCase();
        if (usedNamesThisDay.has(key)) continue;
        usedNamesThisDay.add(key);
        usedStop.add(key);
        const time = ["10:00", "13:30", "17:00", "20:30"][Math.min(items.length, 3)]!;
        items.push({
          title,
          activity_kind: kind,
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
        const last = items.map((it) => String(it.activity_time || "")).filter(Boolean).sort().slice(-1)[0] || "";
        if (last && last < "18:00") {
          const eveningCats: Category[] = wantsNoNight(mergedNotes) ? ["gastro_experience", "culture", "shopping"] : ["gastro_experience", "night", "culture"];
          const picked = pickPoiForSlot({
            pools,
            cats: eveningCats,
            selected: sel,
            usedToday: usedNamesThisDay,
            usedInStop: usedStop,
            dayOrdinalInStop,
            slotIndex: slots.length + fillerIdx + 3,
            notes: mergedNotes,
          });
          if (picked && ensureNoGenericTitle(picked.poi.name)) {
            const poi = picked.poi;
            const key = poi.name.trim().toLowerCase();
            if (!usedNamesThisDay.has(key)) {
              usedNamesThisDay.add(key);
              usedStop.add(key);
              items.push({
                title: poi.name.trim(),
                activity_kind: picked.kind,
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
      const requireEvening = type !== "nature" && !wantsNoNight(mergedNotes);
      const existing = incomingMap.get(dayNum);
      const isBad = existing ? inferBadDay(existing, { minItems, requireEvening }) : true;
      const shouldRegen = (Array.isArray(targetDayNums) && targetDayNums.includes(dayNum)) || (!incomingDays && !regenerateBadOnly) || (regenerateBadOnly ? isBad : true) || (Array.isArray(badDayNums) ? badDayNums.includes(dayNum) : false);
      if (!shouldRegen && existing) { daysOut.push(existing); continue; }

      const prev = i >= 1 ? baseByDay[i - 1] : "";
      const isChange = i >= 1 && prev && prev !== stop;
      const ord = ordinalInStopByDayIndex[i] || 1;
      const day = makeDay(dayNum, stop, ord);
      if (isChange) {
        day.items.unshift({ title: `Traslado ${prev} → ${stop}`, activity_kind: "transport", activity_type: "general", place_name: `${prev} → ${stop}`, address: `${prev} → ${stop}`, latitude: null, longitude: null, activity_time: "08:30", source: "ai_planner", description: "Bloque de traslado entre ciudades base. Ajusta el medio/hora según tu viaje real." });
        if (day.items.length > 3) day.items.splice(3);
      }
      daysOut.push({ day: day.day, date: day.date, base: day.base, items: day.items.map((it: any) => ({ title: it.title, description: it.description || null, activity_date: day.date, activity_time: it.activity_time, place_name: it.place_name || it.title, address: it.address || `${it.title}, ${stop}`, latitude: typeof it.latitude === "number" ? it.latitude : null, longitude: typeof it.longitude === "number" ? it.longitude : null, activity_kind: it.activity_kind, activity_type: it.activity_type || "general", source: it.source || "ai_planner" })) });
    }

    // ── 9. Suggestion chips ───────────────────────────────────────────────────
    const suggestions: Record<string, Array<{ category: Category; pois: Poi[] }>> = {};
    for (const stop of stops) {
      const p = poisByStop[stop.label];
      suggestions[stop.label] = [{ category: "culture", pois: pickN(p.culture || [], 18) }, { category: "nature", pois: pickN(p.nature || [], 18) }, { category: "market", pois: pickN(p.market || [], 12) }, { category: "viewpoint", pois: pickN(p.viewpoint || [], 12) }, { category: "neighborhood", pois: pickN(p.neighborhood || [], 12) }, { category: "gastro_experience", pois: pickN(p.gastro_experience || [], 12) }];
    }

    return NextResponse.json({ ok: true, totalDays, startDate, endDate, destinations, stops: stops.map((s) => ({ key: s.label, label: s.resolvedLabel, center: s.center })), stays, baseCityByDay: baseByDay, suggestions, days: daysOut, viability });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo generar el borrador." }, { status: 500 });
  }
}
