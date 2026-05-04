import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  geocodePhotonPreferred,
  geocodeTripAnchor,
  regionHintsFromDestination,
} from "@/lib/geocoding/photonGeocode";
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
  tags?: Record<string, string>;
};

type Category =
  | "culture" | "nature" | "viewpoint" | "neighborhood"
  | "market" | "excursion" | "gastro_experience" | "shopping" | "night";

const ALL_CATEGORIES: Category[] = [
  "culture", "nature", "viewpoint", "neighborhood", "market",
  "excursion", "gastro_experience", "shopping", "night",
];

// ─── In-process caches ────────────────────────────────────────────────────────

// POI pool cache (from Overpass / Gemini POI fallback)
type CacheEntry = { pools: Record<Category, Poi[]>; expiresAt: number };
const POI_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function ck(c: LatLng, r: number) { return `${c.lat.toFixed(4)},${c.lng.toFixed(4)},${r}`; }
function cacheGet(c: LatLng, r: number) {
  const e = POI_CACHE.get(ck(c, r));
  if (!e) return null;
  if (Date.now() > e.expiresAt) { POI_CACHE.delete(ck(c, r)); return null; }
  return e.pools;
}
function cacheSet(c: LatLng, r: number, pools: Record<Category, Poi[]>) {
  POI_CACHE.set(ck(c, r), { pools, expiresAt: Date.now() + CACHE_TTL_MS });
  if (POI_CACHE.size > 200) { const now = Date.now(); for (const [k, v] of POI_CACHE) if (now > v.expiresAt) POI_CACHE.delete(k); }
}

// Itinerary cache — keyed by city + nights + notes hash
const ITIN_CACHE = new Map<string, { days: any[]; expiresAt: number }>();

function itinKey(city: string, nights: number, notes: string) {
  return `${city.toLowerCase().slice(0, 40)}:${nights}:${notes.toLowerCase().slice(0, 80)}`;
}
function itinCacheGet(city: string, nights: number, notes: string) {
  const e = ITIN_CACHE.get(itinKey(city, nights, notes));
  if (!e || Date.now() > e.expiresAt) { if (e) ITIN_CACHE.delete(itinKey(city, nights, notes)); return null; }
  return e.days;
}
function itinCacheSet(city: string, nights: number, notes: string, days: any[]) {
  ITIN_CACHE.set(itinKey(city, nights, notes), { days, expiresAt: Date.now() + CACHE_TTL_MS });
  if (ITIN_CACHE.size > 80) { const now = Date.now(); for (const [k, v] of ITIN_CACHE) if (now > v.expiresAt) ITIN_CACHE.delete(k); }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanString(v: unknown) { return String(v ?? "").trim(); }
function isoOk(s: string) { return /^\d{4}-\d{2}-\d{2}$/.test(s); }
function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function dedupeByName(rows: Poi[]): Poi[] {
  const seen = new Set<string>(); const out: Poi[] = [];
  for (const r of rows) { const k = r.name.trim().toLowerCase(); if (!k || seen.has(k)) continue; seen.add(k); out.push(r); }
  return out;
}
function pickN<T>(arr: T[], n: number): T[] { return arr.slice(0, n); }
function dayCountBetween(start: string, end: string) {
  const a = new Date(`${start}T12:00:00Z`).getTime(), b = new Date(`${end}T12:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 1;
  return Math.max(1, Math.round((b - a) / (86400 * 1000)) + 1);
}
function sumPools(p: Record<Category, Poi[]>) { return ALL_CATEGORIES.reduce((n, k) => n + (p[k]?.length || 0), 0); }
function proposeRadiusMeters(count: number) {
  if (count <= 2) return 22000; if (count >= 40) return 7000; if (count >= 18) return 12000; return 18000;
}

// ─── Notes helpers ────────────────────────────────────────────────────────────

function mergeNotes(freeText: string, rulesRaw: unknown): string {
  const rules = Array.isArray(rulesRaw)
    ? (rulesRaw as any[]).map((x) => cleanString(x)).filter(Boolean)
    : [];
  return [cleanString(freeText), ...rules].filter(Boolean).join(" | ");
}

// ─── Haversine ────────────────────────────────────────────────────────────────

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  return R * 2 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2));
}

// ─── Smart day distribution ───────────────────────────────────────────────────

type StayProposal = { stop: string; nights: number; reason: string };

function distributeNightsSmart(
  stops: Array<{ label: string; center: LatLng }>,
  poisByStop: Record<string, Record<Category, Poi[]>>,
  totalDays: number,
  notes: string
): StayProposal[] {
  if (!stops.length) return [];
  if (stops.length === 1) return [{ stop: stops[0]!.label, nights: totalDays, reason: `${totalDays} días para explorar a fondo` }];
  const prefs = notes.toLowerCase();
  const tourismW = stops.map((s) => { const p = poisByStop[s.label]; const raw = (p?.culture?.length || 0) * 1.2 + (p?.market?.length || 0) + (p?.nature?.length || 0) * 0.9 + (p?.gastro_experience?.length || 0) * 0.8 + (p?.viewpoint?.length || 0) * 0.6; return Math.log1p(Math.max(1, raw)); });
  const transitPenalty = stops.map((s, i) => { if (i === 0) return 0; const km = haversineKm(stops[i - 1]!.center, s.center); return (km / 500) * 0.5; });
  const prefBoost = stops.map((s) => { const p = poisByStop[s.label]; let b = 0; if ((p?.nature?.length || 0) > 5 && /naturaleza|senderismo|parque|monta[ñn]a|trekking|outdoor|aire libre/i.test(prefs)) b += 0.4; if ((p?.gastro_experience?.length || 0) > 2 && /gastronom[ií]a|comida|vino|bodega|cocina/i.test(prefs)) b += 0.3; if ((p?.culture?.length || 0) > 8 && /cultura|historia|museo|arte|arquitectura/i.test(prefs)) b += 0.3; return b; });
  const scores = stops.map((_, i) => Math.max(0.1, tourismW[i]! + prefBoost[i]!));
  const totalScore = scores.reduce((a, b) => a + b, 0);
  const availableDays = Math.max(stops.length, totalDays - Math.round(transitPenalty.reduce((a, b) => a + b, 0)));
  let nights = scores.map((s) => Math.max(1, Math.round((s / totalScore) * availableDays)));
  transitPenalty.forEach((pen, i) => { if (pen >= 0.5 && i > 0) nights[i] = Math.max(nights[i]!, 2); });
  let sum = nights.reduce((a, b) => a + b, 0);
  const sortedIdx = scores.map((_, i) => i).sort((a, b) => scores[b]! - scores[a]!);
  while (sum < totalDays) { nights[sortedIdx[sum % sortedIdx.length]!]! += 1; sum++; }
  while (sum > totalDays) { const idx = sortedIdx.slice().reverse().find((i) => nights[i]! > 1); if (idx === undefined) break; nights[idx]! -= 1; sum--; }
  return stops.map((s, i) => {
    const n = nights[i]!, isBig = tourismW[i]! > Math.log1p(15), isNature = (poisByStop[s.label]?.nature?.length || 0) > (poisByStop[s.label]?.culture?.length || 0), farLeg = transitPenalty[i]! >= 0.5;
    const parts = [isBig ? "ciudad con mucho que ver" : isNature ? "destino natural" : "ciudad compacta", farLeg ? "incluye día de traslado" : "", prefBoost[i]! > 0.3 ? "ajustado a tus preferencias" : ""].filter(Boolean);
    return { stop: s.label, nights: n, reason: `${n} día${n !== 1 ? "s" : ""} — ${parts.join(", ")}` };
  });
}

// ─── Viability check ──────────────────────────────────────────────────────────

export type ViabilityResult = { viable: boolean; warning: string; suggestions: Array<{ stops: string[]; reason: string }> };

function checkViability(stops: Array<{ label: string; center: LatLng }>, totalDays: number, poisByStop: Record<string, Record<Category, Poi[]>>): ViabilityResult | null {
  if (stops.length <= 1) return null;
  let minDaysNeeded = stops.length;
  for (let i = 1; i < stops.length; i++) { const km = haversineKm(stops[i - 1]!.center, stops[i]!.center); if (km > 300) minDaysNeeded++; if (km > 800) minDaysNeeded++; }
  if (totalDays >= minDaysNeeded) return null;
  const scored = stops.map((s) => { const p = poisByStop[s.label]; return { label: s.label, center: s.center, w: (p?.culture?.length || 0) + (p?.nature?.length || 0) + (p?.market?.length || 0) }; }).sort((a, b) => b.w - a.w);
  const suggestions: ViabilityResult["suggestions"] = [];
  if (totalDays >= 2) suggestions.push({ stops: [scored[0]!.label], reason: `${totalDays} días solo en ${scored[0]!.label} — tiempo suficiente para verlo bien` });
  if (totalDays >= 3 && scored.length >= 2) { const km = haversineKm(scored[0]!.center, scored[1]!.center); if (km < 600) suggestions.push({ stops: [scored[0]!.label, scored[1]!.label], reason: `${scored[0]!.label} + ${scored[1]!.label} — cerca (${Math.round(km)} km)` }); }
  if (totalDays >= 3 && scored.length >= 3) suggestions.push({ stops: [scored[0]!.label, scored[scored.length - 1]!.label], reason: `Empieza en ${scored[0]!.label} y termina en ${scored[scored.length - 1]!.label}` });
  return { viable: false, warning: `Con ${totalDays} día${totalDays !== 1 ? "s" : ""} y ${stops.length} destinos, el viaje está muy justo (mínimo ${minDaysNeeded} días recomendados).`, suggestions: suggestions.slice(0, 3) };
}

// ─── Gemini: itinerary for a city block ───────────────────────────────────────
//
// The core of the new approach:
// Ask Gemini "qué ver y hacer en X lugar, Y días" with full user context.
// This produces expert-quality, varied, location-specific plans that improve
// with every chat message the user sends.

function buildCityItineraryPrompt(
  city: string,
  nights: number,
  startDateIso: string,
  notes: string,
  prevCity: string | null
): string {
  // Translate notes into explicit traveller profile
  const profile = notes.trim()
    ? `El viajero ha indicado lo siguiente sobre sus preferencias y estilo de viaje:\n"${notes}"\nTen en cuenta TODO esto al elegir actividades, horarios y ritmo.`
    : "No hay preferencias específicas — crea un plan equilibrado y variado.";

  const transitNote = prevCity
    ? `NOTA: El viajero llega desde ${prevCity}. El primer día puede incluir una actividad de llegada/orientación más ligera, pero el resto deben ser días completos.`
    : "";

  // Build explicit date list so Gemini assigns the right dates
  const dates = Array.from({ length: nights }, (_, i) => addDaysIso(startDateIso, i));
  const dateList = dates.map((d, i) => `  Día ${i + 1}: ${d}`).join("\n");

  return `Eres un experto en viajes y guía turístico local de ${city}. Crea un plan detallado de ${nights} día${nights !== 1 ? "s" : ""} en ${city}.

${profile}
${transitNote}

Fechas exactas del bloque en ${city}:
${dateList}

Devuelve SOLO JSON válido (sin markdown, sin explicaciones, sin texto extra antes o después). Esquema exacto:
{
  "days": [
    {
      "day": 1,
      "date": "${dates[0]}",
      "base": "${city}",
      "items": [
        {
          "title": "Nombre REAL y CONCRETO del lugar o experiencia",
          "description": "Una frase breve con un tip local o dato interesante sobre este lugar",
          "activity_time": "09:30",
          "activity_kind": "culture",
          "place_name": "Nombre exacto del lugar",
          "address": "Dirección o zona, ${city}",
          "latitude": 0.000000,
          "longitude": 0.000000,
          "activity_type": "visit"
        }
      ]
    }
  ]
}

REGLAS CRÍTICAS — sígüelas al pie de la letra:

1. LUGARES REALES: Todos los títulos deben ser nombres propios verificables en Google Maps. PROHIBIDO: "Paseo por el centro", "Zona histórica", "Tiempo libre", "Explorar el barrio", "Almuerzo", "Cena", "Visita panorámica".

2. VARIEDAD DIARIA: Cada día debe tener entre 3 y 5 actividades distribuidas (mañana, mediodía, tarde, noche). Mezcla categorías: cultura, gastronomía, naturaleza, barrios, mercados, vida nocturna.

3. VARIEDAD ENTRE DÍAS: Ningún tipo de actividad debe repetirse dos veces seguidas. El día 2 no puede empezar igual que el día 1. Rota barrios, museos, mercados, excursiones.

4. LOS MÁS ICÓNICOS PRIMERO: Incluye los lugares más famosos y visitados de ${city} — los que un viajero querría ver sí o sí. No uses sitios obscuros ni poco conocidos.

5. COORDENADAS REALES: lat/lng deben ser las coordenadas GPS reales y precisas del lugar. Nunca uses 0.0.

6. HORARIOS REALISTAS: Distribuye las actividades con tiempo suficiente entre ellas. No pongas 4 actividades seguidas a la misma hora.

7. PREFERENCIAS DEL VIAJERO: Si dijo "sin museos" → no pongas museos. Si dijo "gastronomía" → añade al menos una experiencia gastronómica por día. Si dijo "naturaleza" → incluye parques, rutas, miradores. Si dijo "ritmo tranquilo" → máximo 3 actividades por día. Respeta SIEMPRE las preferencias indicadas.

8. GASTRONOMÍA CONCRETA: Para "gastro_experience" usa: bodegas con nombre, mercados gastronómicos específicos, restaurantes icónicos del lugar, catas, talleres de cocina. Nunca solo "Cena en restaurante".

9. DESCRIPCIÓN ÚTIL: La descripción debe aportar un dato concreto, un consejo práctico o una razón para ir ("Mejor vista de la ciudad desde aquí", "Llega antes de las 10 para evitar colas", etc.).

10. activity_kind debe ser uno de: culture, nature, viewpoint, neighborhood, market, excursion, gastro_experience, shopping, night, transport.
`.trim();
}

async function generateCityItinerary(
  city: string,
  nights: number,
  startDateIso: string,
  notes: string,
  prevCity: string | null,
  forceRegen = false
): Promise<any[] | null> {
  // Cache hit — reuse if notes haven't changed and not forced
  if (!forceRegen) {
    const cached = itinCacheGet(city, nights, notes);
    if (cached) return cached;
  }

  try {
    const prompt = buildCityItineraryPrompt(city, nights, startDateIso, notes, prevCity);
    // Token budget scales with nights: more days = more content
    const maxTokens = Math.min(8192, 1200 + nights * 900);
    const raw = await askGemini(prompt, "planning", { maxOutputTokens: maxTokens });

    // Parse and validate
    const parsed = extractJsonObject(raw) as any;
    if (!parsed?.days || !Array.isArray(parsed.days)) return null;

    const days = parsed.days
      .map((d: any, idx: number) => {
        const date = typeof d.date === "string" && isoOk(d.date)
          ? d.date
          : addDaysIso(startDateIso, idx);

        const items = (Array.isArray(d.items) ? d.items : [])
          .map((it: any) => {
            const title = cleanString(it?.title || "");
            if (!title) return null;
            // Reject generic titles
            if (/\b(paseo por|zona hist|tiempo libre|explorar el|almuerzo$|cena$|visita panor)/i.test(title)) return null;
            const lat = typeof it?.latitude === "number" && Math.abs(it.latitude) <= 90 && it.latitude !== 0 ? it.latitude : null;
            const lng = typeof it?.longitude === "number" && Math.abs(it.longitude) <= 180 && it.longitude !== 0 ? it.longitude : null;
            return {
              title,
              description: cleanString(it?.description || "") || null,
              activity_date: date,
              activity_time: cleanString(it?.activity_time || "") || null,
              place_name: cleanString(it?.place_name || title),
              address: cleanString(it?.address || `${title}, ${city}`),
              latitude: lat,
              longitude: lng,
              activity_kind: cleanString(it?.activity_kind || "culture"),
              activity_type: cleanString(it?.activity_type || "visit") || "visit",
              source: "ai_planner",
            };
          })
          .filter(Boolean);

        return {
          day: typeof d.day === "number" ? d.day : idx + 1,
          date,
          base: city,
          items,
        };
      })
      .filter((d: any) => d.items.length > 0);

    if (!days.length) return null;

    itinCacheSet(city, nights, notes, days);
    return days;
  } catch (e) {
    console.error(`[ai-planner] Gemini itinerary failed for "${city}":`, e);
    return null;
  }
}

// ─── Gemini: POI pool (for suggestion chips + smart distribution) ─────────────

function buildGeminiPoiPrompt(city: string, minPerCategory: number): string {
  return `Eres un experto en turismo. Genera puntos de interés REALES con coordenadas GPS precisas para: "${city}".

Devuelve SOLO JSON válido (sin markdown, sin texto extra). Esquema exacto:
{"culture":[{"name":"...","lat":0.0,"lng":0.0}],"nature":[...],"viewpoint":[...],"neighborhood":[...],"market":[...],"excursion":[...],"gastro_experience":[...],"shopping":[...],"night":[...]}

- MÍNIMO ${minPerCategory} ítems por categoría. POIs REALES y CONCRETOS. Coords precisas.
- Si es región o país, usa su ciudad principal Y otras ciudades destacadas.`;
}

async function fetchPoisFromGemini(cityLabel: string, totalDays: number): Promise<Record<Category, Poi[]> | null> {
  const minPerCategory = Math.max(15, Math.ceil((totalDays * 4) / ALL_CATEGORIES.length) + 8);
  try {
    const raw = await askGemini(buildGeminiPoiPrompt(cityLabel, minPerCategory), "planning", { maxOutputTokens: Math.min(8192, 2048 + minPerCategory * 60) });
    const parsed = extractJsonObject(raw) as any;
    if (!parsed || typeof parsed !== "object") return null;
    const pools: Record<Category, Poi[]> = {} as any;
    for (const cat of ALL_CATEGORIES) {
      pools[cat] = dedupeByName((Array.isArray(parsed[cat]) ? parsed[cat] : []).map((item: any) => {
        const name = cleanString(item?.name || ""), lat = typeof item?.lat === "number" ? item.lat : null, lng = typeof item?.lng === "number" ? item.lng : null;
        if (!name || lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
        return { name, lat, lng } as Poi;
      }).filter(Boolean) as Poi[]);
    }
    if ((pools.excursion || []).length < 3) pools.excursion = dedupeByName([...(pools.nature || []), ...(pools.culture || [])]).slice(0, minPerCategory);
    return sumPools(pools) >= 4 ? pools : null;
  } catch { return null; }
}

// ─── Overpass ─────────────────────────────────────────────────────────────────

function buildMultiCategoryQuery(center: LatLng, r: number): string {
  const { lat, lng } = center, a = `(around:${Math.floor(r)},${lat},${lng})`;
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

function parseOverpassResponse(payload: any, limit: number): Record<Category, Poi[]> {
  const pools: Record<Category, Poi[]> = {} as any, seen: Record<Category, Set<string>> = {} as any;
  for (const cat of ALL_CATEGORIES) { pools[cat] = []; seen[cat] = new Set(); }
  for (const el of (Array.isArray(payload?.elements) ? payload.elements : [])) {
    const tags = el?.tags || {}, name = typeof tags?.name === "string" ? tags.name.trim() : "", lat = typeof el?.lat === "number" ? el.lat : (el?.center?.lat ?? null), lng = typeof el?.lon === "number" ? el.lon : (el?.center?.lon ?? null);
    if (!name || lat == null || lng == null) continue;
    const cat = tagToCategory(tags); if (!cat) continue;
    const key = name.toLowerCase(); if (seen[cat].has(key) || pools[cat].length >= limit) continue;
    seen[cat].add(key);
    const tagRecord: Record<string, string> = {};
    for (const [k2, v2] of Object.entries(tags)) if (typeof v2 === "string" && v2.trim()) tagRecord[k2] = v2;
    pools[cat].push({ name, lat, lng, osm: { type: String(el?.type || "node"), id: String(el?.id || "") }, tags: tagRecord });
  }
  const excSeen = new Set<string>(); pools.excursion = [];
  for (const poi of [...(pools.nature || []), ...(pools.culture || [])]) { const k = poi.name.toLowerCase(); if (excSeen.has(k)) continue; excSeen.add(k); pools.excursion.push(poi); if (pools.excursion.length >= limit) break; }
  return pools;
}

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

async function fetchAllPoisFromOverpass(center: LatLng, radiusMeters: number): Promise<Record<Category, Poi[]> | null> {
  const cached = cacheGet(center, radiusMeters); if (cached) return cached;
  const body = `data=${encodeURIComponent(buildMultiCategoryQuery(center, radiusMeters))}`;
  for (const url of OVERPASS_ENDPOINTS) {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 42_000);
    try {
      const resp = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" }, body, cache: "no-store", signal: ctrl.signal });
      const payload = await resp.json().catch(() => null);
      if (resp.ok && payload) { const pools = parseOverpassResponse(payload, 60); cacheSet(center, radiusMeters, pools); return pools; }
      if (resp.status === 400) break;
    } catch { /* next */ } finally { clearTimeout(t); }
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
          const radius = proposeRadiusMeters(sumPools(capRough));
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
  const geminiPools = await fetchPoisFromGemini(stop.label, totalDays);
  if (geminiPools && sumPools(geminiPools) >= 4) { cacheSet(center, 3500, geminiPools); return { pools: geminiPools, source: "gemini" }; }
  return { pools: null, err: `No he encontrado lugares suficientes para "${stop.label}". Prueba con una ciudad concreta.` };
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

    // Merge initial preferences + all chat messages into a single context string
    // This is what feeds Gemini — every chat message the user sends enriches the plan
    const mergedNotes = mergeNotes(freeText, body?.rules);

    const selectedByStop = (body?.selectedPoisByStop && typeof body.selectedPoisByStop === "object") ? body.selectedPoisByStop : null;
    const staysInput = Array.isArray(body?.stays) ? body.stays : null;
    const planOnly = Boolean(body?.planOnly);
    const targetDayNums: number[] | null = Array.isArray(body?.targetDayNums) ? body.targetDayNums.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n >= 1) : null;

    if (!destinations.length) return NextResponse.json({ error: "Faltan destinos." }, { status: 400 });
    if (!isoOk(startDate) || !isoOk(endDate)) return NextResponse.json({ error: "Fechas inválidas." }, { status: 400 });

    const totalDays = dayCountBetween(startDate, endDate);
    const destinationLabel = destinations.join(" · ");
    const anchor = await geocodeTripAnchor(destinationLabel);
    const regionHints = regionHintsFromDestination(destinationLabel);

    // ── 1. Geocode stops ──────────────────────────────────────────────────────
    const stopGeo = await Promise.all(destinations.map(async (label) => {
      const g = await geocodePhotonPreferred(label, { anchor, regionHints, maxDistanceKm: 50000 });
      return { label, geo: g };
    }));
    const stops = stopGeo.map((s) => ({ label: s.label, center: s.geo ? ({ lat: s.geo.lat, lng: s.geo.lng } as LatLng) : null, resolvedLabel: s.geo?.label || s.label })).filter((s) => Boolean(s.center)) as Array<{ label: string; resolvedLabel: string; center: LatLng }>;
    if (!stops.length) return NextResponse.json({ error: "No se pudieron geocodificar los destinos." }, { status: 400 });

    // ── 2. Load POI pools (for distribution weights + suggestion chips) ───────
    const stopResults = await Promise.all(stops.map((stop) => loadPoisForStop(stop, anchor, regionHints, totalDays)));
    const poisByStop: Record<string, Record<Category, Poi[]>> = {};
    for (let i = 0; i < stops.length; i++) {
      const result = stopResults[i]!;
      if (!result.pools) return NextResponse.json({ error: (result as any).err }, { status: 400 });
      poisByStop[stops[i]!.label] = result.pools;
    }

    // ── 3. Viability check ────────────────────────────────────────────────────
    const viability = checkViability(stops, totalDays, poisByStop);

    // ── 4. Stay distribution ──────────────────────────────────────────────────
    let stays: Array<{ stop: string; nights: number; reason?: string }>;
    if (staysInput?.length) {
      stays = staysInput.map((x: any) => ({ stop: cleanString(x?.stop), nights: clamp(Number(x?.nights) || 1, 1, 60), reason: x?.reason })).filter((x: any) => Boolean(x.stop));
    } else {
      stays = distributeNightsSmart(stops, poisByStop, totalDays, mergedNotes);
    }

    // ── 5. planOnly: return proposal without itinerary ────────────────────────
    if (planOnly) {
      return NextResponse.json({ ok: true, planOnly: true, totalDays, startDate, endDate, destinations, stops: stops.map((s) => ({ key: s.label, label: s.resolvedLabel, center: s.center })), stays, viability });
    }

    // ── 6. City-per-day map ───────────────────────────────────────────────────
    const baseByDay: string[] = [];
    for (const s of stays) for (let i = 0; i < s.nights; i++) baseByDay.push(s.stop);
    while (baseByDay.length < totalDays) baseByDay.push(stays[stays.length - 1]?.stop || stops[0]!.label);
    baseByDay.splice(totalDays);

    // ── 7. Build city blocks for Gemini ──────────────────────────────────────
    //
    // Each consecutive run of days in the same city = one Gemini call.
    // We pass the full mergedNotes (initial prefs + all chat messages) so every
    // refinement the user makes via chat is reflected in the regenerated plan.

    type CityBlock = { city: string; startDayNum: number; nights: number; startDateIso: string; prevCity: string | null };
    const blocks: CityBlock[] = [];
    for (const s of stays) {
      const prev = blocks[blocks.length - 1];
      const startDayNum = prev ? prev.startDayNum + prev.nights : 1;
      blocks.push({
        city: s.stop,
        startDayNum,
        nights: s.nights,
        startDateIso: addDaysIso(startDate, startDayNum - 1),
        prevCity: prev?.city ?? null,
      });
    }

    // If chat refinement is happening (mergedNotes has content), always regenerate
    // so the plan reflects the latest preferences. Otherwise cache is fine.
    const forceRegen = mergedNotes.trim().length > 0;

    // Generate all city blocks in parallel
    const blockResults = await Promise.all(
      blocks.map((block) => {
        // If targetDayNums restricts which days to regen, skip blocks not affected
        if (Array.isArray(targetDayNums) && targetDayNums.length > 0) {
          const blockDays = Array.from({ length: block.nights }, (_, i) => block.startDayNum + i);
          if (!blockDays.some((d) => targetDayNums.includes(d))) return Promise.resolve(null);
        }
        return generateCityItinerary(block.city, block.nights, block.startDateIso, mergedNotes, block.prevCity, forceRegen);
      })
    );

    // Existing days map (for partial regeneration)
    const existingDaysMap = new Map<number, any>();
    if (Array.isArray(body?.days)) for (const d of body.days) if (typeof d?.day === "number") existingDaysMap.set(d.day, d);

    // ── 8. Merge blocks into flat days array ──────────────────────────────────
    const daysOut: any[] = [];

    for (let bi = 0; bi < blocks.length; bi++) {
      const block = blocks[bi]!;
      const generatedDays = blockResults[bi];

      for (let di = 0; di < block.nights; di++) {
        const globalDayNum = block.startDayNum + di;
        const dayDate = addDaysIso(startDate, globalDayNum - 1);

        if (generatedDays && generatedDays[di]) {
          // Use Gemini-generated day, fix dates and day numbers
          const gemDay = generatedDays[di];
          let items: any[] = (gemDay.items || []).map((it: any) => ({ ...it, activity_date: dayDate }));

          // Insert transit activity at start of first day if city changed
          if (di === 0 && block.prevCity) {
            const transitItem = {
              title: `Traslado ${block.prevCity} → ${block.city}`,
              description: "Traslado entre ciudades. Ajusta el medio de transporte según tu viaje.",
              activity_date: dayDate,
              activity_time: "08:30",
              place_name: `${block.prevCity} → ${block.city}`,
              address: `${block.prevCity} → ${block.city}`,
              latitude: null, longitude: null,
              activity_kind: "transport", activity_type: "general", source: "ai_planner",
            };
            items = [transitItem, ...items.slice(0, 3)];
          }

          daysOut.push({ day: globalDayNum, date: dayDate, base: block.city, items });
        } else if (existingDaysMap.has(globalDayNum)) {
          // Keep existing day (partial regen)
          daysOut.push({ ...existingDaysMap.get(globalDayNum), day: globalDayNum, date: dayDate });
        } else {
          // Gemini failed — empty fallback day
          const items: any[] = [];
          if (di === 0 && block.prevCity) {
            items.push({ title: `Traslado ${block.prevCity} → ${block.city}`, description: "Traslado entre ciudades.", activity_date: dayDate, activity_time: "08:30", place_name: `${block.prevCity} → ${block.city}`, address: `${block.prevCity} → ${block.city}`, latitude: null, longitude: null, activity_kind: "transport", activity_type: "general", source: "ai_planner" });
          }
          daysOut.push({ day: globalDayNum, date: dayDate, base: block.city, items });
        }
      }
    }

    // Pad to totalDays if needed
    while (daysOut.length < totalDays) {
      daysOut.push({ day: daysOut.length + 1, date: addDaysIso(startDate, daysOut.length), base: stays[stays.length - 1]?.stop || stops[0]!.label, items: [] });
    }

    // ── 9. Suggestion chips ───────────────────────────────────────────────────
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
      stays, baseCityByDay: baseByDay, suggestions, days: daysOut, viability,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo generar el borrador." }, { status: 500 });
  }
}
