import { askTripAIWithUsage } from "@/lib/trip-ai/providers";
import type { TripAiUsage } from "@/lib/trip-ai/providers";
import type { ExecutableItineraryPayload } from "@/lib/trip-ai/tripCreationTypes";
import type { ResolvedTripCreation } from "@/lib/trip-ai/tripCreationResolve";
import { extractJsonObject } from "@/lib/trip-ai/tripCreationJson";
import { addDaysIso } from "@/lib/trip-ai/tripCreationDates";
import { geocodePhotonPreferred, geocodeTripAnchor, regionHintsFromDestination } from "@/lib/geocoding/photonGeocode";
import type { TripAutoConfig } from "@/lib/trip-ai/tripAutoConfig";
import { DEFAULT_TRIP_AUTO_CONFIG } from "@/lib/trip-ai/tripAutoConfig";
import { sanityCheckItinerary, sanityCheckPlaceholders } from "@/lib/trip-ai/itinerarySanity";
import { deriveRouteStructure, type RouteStructure } from "@/lib/trip-ai/routeStructure";

const ITIN_PROMPT = `Genera un itinerario JSON para la app Kaviro. Devuelve SOLO JSON válido (sin markdown).
Esquema exacto (puedes incluir campos extra, pero estos deben existir):
{
  "version": 1,
  "title": string breve en español,
  "travelMode": "walking"|"driving"|"cycling",
  "days": [
    {
      "day": number,
      "date": "YYYY-MM-DD",
      "items": [
        {
          "title": string,
          "activity_kind": "visit"|"food"|"museum"|"transport"|"nightlife"|"shopping"|"lodging",
          "place_name": string,
          "address": string con ciudad y país,
          "latitude": number|null,
          "longitude": number|null,
          "start_time": "HH:MM",
          "duration_min": number|null,
          "end_time": "HH:MM"|null,
          "visit_type": string|null,
          "requires_ticket": boolean|null,
          "ticket_notes": string|null,
          "transport_mode": string|null,
          "notes": string|null
        }
      ]
    }
  ]
}

Reglas:
- Cada día: entre 3 y 5 items (salvo días de traslado largo: 2–4), start_time en orden creciente.
- Para cada item, rellena "duration_min" de forma realista (aprox). Si no estás seguro, usa null.
- Si das "end_time", debe ser coherente con start_time + duration_min; si dudas, usa null.
- "visit_type": usa categorías humanas (ej. "gastronomía", "naturaleza", "museo", "ruta panorámica", "barrio", "mercado", "mirador", "cultura").
- "requires_ticket": true si suele requerir entrada/reserva (museos, parques nacionales, shows); false si es paseo libre; null si no estás seguro.
- "ticket_notes": si requiere entrada/reserva, añade 1 frase (dónde o si conviene reservar). Si no, null.
- "transport_mode": solo si activity_kind="transport". Usa: walking | public_transport | taxi | driving | flight | bus | train | ferry.
- Debes devolver SIEMPRE el array "days" con todos los días solicitados (ver sección "Fechas por día"). No omitas días.
- Lugares realistas para el destino indicado.
- Coherencia geográfica (CRÍTICO): en un mismo día, todos los items deben estar en la MISMA ciudad/área (o a <~30 km). No “teletransportes” entre ciudades lejanas o islas.
- Si cambias de ciudad/región, hazlo como máximo 1 vez por día e incluye un item con activity_kind="transport" (tren/coche/ferry) con origen→destino y una address acorde.
- **address (MUY IMPORTANTE):** en cada item debe figurar la **ciudad y el país del viaje** del "Destino principal" (ej. comercio en Venecia → "…, Venecia, Italia"). No uses solo nombres de calle o de establecimiento que puedan existir en otro país (ej. evita "Calle Venecia" sin ciudad/país si el viaje es Italia).
- **País (CRÍTICO):** todos los items deben estar dentro del país del viaje. Si el destino es Croacia, el país en address debe ser "Croacia/Croatia" (nunca Argentina u otro país). Si dudas, usa la ciudad base del día + el país del destino.
- **place_name:** el nombre visible del sitio en la zona del destino (no inventes sucursales en países distintos al del viaje).
- **latitude/longitude (opcional):** si conoces coordenadas reales del lugar, inclúyelas. Si no estás seguro, pon null. No inventes.
- version siempre 1.
- travelMode "walking" si el usuario prefiere andar o ciudad compacta; si no, "driving".
- Si el usuario ha pedido paradas obligatorias (mustSee), DEBES incluirlas como items (title/place_name) repartiéndolas por los días disponibles.
- Si un día incluye "Cambio: A → B" y/o "Parada en ruta", usa ese día para el traslado (item "transport") y coloca la parada intermedia EN ESE DÍA (no como ida/vuelta desde A) manteniendo la "Ciudad base" del día.
- Si un día incluye "Traslado aprox: Xh Ym", incluye un item "transport" con ese tiempo aproximado y reduce actividades ese día (no lo llenes como un día normal).
- NO añadas ciudades “grandes típicas” (p. ej. capital) si no encajan con las paradas obligatorias, salvo que sea un traslado explícito entre dos paradas obligatorias.
`;

function validateItinerary(x: unknown): ExecutableItineraryPayload {
  const o = x as ExecutableItineraryPayload;
  if (!o || o.version !== 1 || !Array.isArray(o.days) || !o.days.length) {
    throw new Error("Itinerario inválido: falta version o days.");
  }
  for (const d of o.days) {
    if (typeof d.day !== "number" || !d.date || !Array.isArray(d.items)) {
      throw new Error("Itinerario inválido: día mal formado.");
    }
  }
  return o;
}

function alignItineraryDates(itinerary: ExecutableItineraryPayload, resolved: ResolvedTripCreation): ExecutableItineraryPayload {
  const days: ExecutableItineraryPayload["days"] = [];
  for (let i = 0; i < resolved.durationDays; i++) {
    const src = itinerary.days[i];
    const items =
      src && Array.isArray(src.items) && src.items.length
        ? src.items
        : [
            {
              title: `Explorar ${resolved.destination}`,
              activity_kind: "visit" as const,
              place_name: resolved.destination,
              address: resolved.destination,
              start_time: "10:00",
              notes: "Propuesta automática — ajústala en Plan o con el asistente.",
            },
          ];
    days.push({ day: i + 1, date: addDaysIso(resolved.startDate, i), items });
  }
  return {
    ...itinerary,
    title: itinerary.title || `${resolved.destination} (${resolved.durationDays} días)`,
    days,
  };
}

function normalizeMustSeeTokens(raw: string[]): string[] {
  const out: string[] = [];
  for (const r of raw || []) {
    const s = String(r || "").trim();
    if (!s) continue;
    for (const part of s.split(/[,\/\n\r\-–—]+/g)) {
      const t = part.trim();
      if (t) out.push(t);
    }
  }
  return [...new Set(out.map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, 12);
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function optimizeMustSeeOrder(
  resolved: ResolvedTripCreation,
  tokens: string[],
  opts?: { skipHeavyGeo?: boolean }
): Promise<string[]> {
  if (!resolved.intent.wantsRouteOptimization) return tokens;
  if (tokens.length < 3) return tokens;
  // En previsualización serverless priorizamos latencia: el orden “perfecto” no compensa timeouts.
  if (opts?.skipHeavyGeo) return tokens;

  const regionHints = regionHintsFromDestination(resolved.destination);
  const anchor = await geocodeTripAnchor(resolved.destination);
  const cache = new Map<string, { lat: number; lng: number }>();

  const geocodeToken = async (label: string) => {
    const key = label.toLowerCase();
    if (cache.has(key)) return cache.get(key)!;
    const hit = await geocodePhotonPreferred(`${label}, ${resolved.destination}`, { anchor, regionHints }).catch(() => null);
    if (hit && typeof hit.lat === "number" && typeof hit.lng === "number") {
      cache.set(key, { lat: hit.lat, lng: hit.lng });
      return { lat: hit.lat, lng: hit.lng };
    }
    return null;
  };

  const startLabel = (resolved.intent.startLocation || "").trim();
  const endLabel = (resolved.intent.endLocation || "").trim();
  const [startPoint, endPoint] = await Promise.all([
    startLabel ? geocodeToken(startLabel) : Promise.resolve(null),
    endLabel ? geocodeToken(endLabel) : Promise.resolve(null),
  ]);

  const points: Array<{ token: string; lat: number; lng: number }> = [];
  const tokenCoords = await Promise.all(
    tokens.map(async (t) => {
      const p = await geocodeToken(t);
      return p ? { token: t, lat: p.lat, lng: p.lng } : null;
    })
  );
  for (const row of tokenCoords) {
    if (row) points.push(row);
  }
  if (points.length < 3) return tokens;

  const remaining = points.slice();
  const ordered: Array<{ token: string; lat: number; lng: number }> = [];

  // Elegimos punto inicial:
  // - si hay startPoint, el más cercano al origen
  // - si no, el más “extremo” respecto al ancla (para evitar centro→extremos→centro)
  let cur: { lat: number; lng: number } | null = null;
  if (startPoint) {
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(startPoint, remaining[i]!);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    const first = remaining.splice(bestIdx, 1)[0]!;
    ordered.push(first);
    cur = { lat: first.lat, lng: first.lng };
  } else if (anchor) {
    let bestIdx = 0;
    let bestD = -1;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(anchor, remaining[i]!);
      if (d > bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    const first = remaining.splice(bestIdx, 1)[0]!;
    ordered.push(first);
    cur = { lat: first.lat, lng: first.lng };
  } else {
    const first = remaining.shift()!;
    ordered.push(first);
    cur = { lat: first.lat, lng: first.lng };
  }

  while (remaining.length) {
    let bestIdx = 0;
    let bestScore = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i]!;
      const distFromCur = cur ? haversineKm(cur, cand) : 0;
      const distToEnd = endPoint ? haversineKm(endPoint, cand) : 0;
      // Bias hacia el destino si existe, para evitar ir y volver.
      const score = distFromCur + (endPoint ? distToEnd * 0.35 : 0);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0]!;
    ordered.push(next);
    cur = { lat: next.lat, lng: next.lng };
  }

  // Conservamos tokens sin geocódigo al final en orden original.
  const geocodedSet = new Set(ordered.map((x) => x.token));
  const leftovers = tokens.filter((t) => !geocodedSet.has(t));
  return [...ordered.map((x) => x.token), ...leftovers];
}

async function assignMustSeeToTransitions(params: {
  resolved: ResolvedTripCreation;
  baseCityByDay: string[];
  mustSeeTokens: string[];
  skipHeavyGeo?: boolean;
}): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (params.skipHeavyGeo) return out;
  if (!params.mustSeeTokens.length) return out;
  if (params.baseCityByDay.length < 2) return out;

  const clean = (s: string) => String(s || "").trim();
  const destination = clean(params.resolved.destination);
  const regionHints = regionHintsFromDestination(destination);
  const anchor = await geocodeTripAnchor(destination).catch(() => null);

  const lc = (s: string) => clean(s).toLowerCase();
  const baseSet = new Set(params.baseCityByDay.map((x) => lc(x)));

  // Solo tokens que NO son ciudades base (ej. "Lagos de Plitvice").
  const tokens = params.mustSeeTokens.map(clean).filter(Boolean).filter((t) => !baseSet.has(lc(t)));
  if (!tokens.length) return out;

  const cache = new Map<string, { lat: number; lng: number }>();
  const geocode = async (label: string) => {
    const key = lc(label);
    if (cache.has(key)) return cache.get(key)!;
    const q = `${label}, ${destination}`.trim();
    const hit = await geocodePhotonPreferred(q, { anchor, regionHints }).catch(() => null);
    if (hit && typeof hit.lat === "number" && typeof hit.lng === "number") {
      const pt = { lat: hit.lat, lng: hit.lng };
      cache.set(key, pt);
      return pt;
    }
    return null;
  };

  // Transiciones: día i (1-based) cuando cambia la ciudad base respecto al día anterior.
  const transitions: Array<{ dayNum: number; from: string; to: string }> = [];
  for (let i = 1; i < params.baseCityByDay.length; i++) {
    const prev = clean(params.baseCityByDay[i - 1]);
    const cur = clean(params.baseCityByDay[i]);
    if (prev && cur && lc(prev) !== lc(cur)) transitions.push({ dayNum: i + 1, from: prev, to: cur });
  }
  if (!transitions.length) return out;

  const cityPoints = await Promise.all(
    Array.from(new Set(transitions.flatMap((t) => [t.from, t.to]))).map(async (c) => [c, await geocode(c)] as const)
  );
  const cityMap = new Map<string, { lat: number; lng: number }>();
  for (const [c, pt] of cityPoints) if (pt) cityMap.set(c, pt);

  const tokPoints = await Promise.all(tokens.map(async (t) => [t, await geocode(t)] as const));
  const tokMap = new Map<string, { lat: number; lng: number }>();
  for (const [t, pt] of tokPoints) if (pt) tokMap.set(t, pt);
  if (!tokMap.size) return out;

  // Asignación greedy: cada token a la transición que minimiza el desvío.
  for (const token of tokens) {
    const p = tokMap.get(token);
    if (!p) continue;
    let best: { dayNum: number; score: number } | null = null;
    for (const tr of transitions) {
      const a = cityMap.get(tr.from);
      const b = cityMap.get(tr.to);
      if (!a || !b) continue;
      const direct = haversineKm(a, b);
      const via = haversineKm(a, p) + haversineKm(p, b);
      const detour = via - direct;
      // Filtros suaves para “paradas en ruta”: no absurdamente lejos y sin gran desvío.
      if (haversineKm(a, p) > 260) continue;
      if (haversineKm(p, b) > 260) continue;
      if (detour > 120) continue;
      const score = detour + direct * 0.05;
      if (!best || score < best.score) best = { dayNum: tr.dayNum, score };
    }
    if (best) {
      const list = out.get(best.dayNum) || [];
      if (!list.some((x) => lc(x) === lc(token))) list.push(token);
      out.set(best.dayNum, list);
    }
  }

  return out;
}

async function estimateTransfersByDay(params: {
  resolved: ResolvedTripCreation;
  baseCityByDay: string[];
  skipHeavyGeo?: boolean;
}): Promise<
  Map<
    number,
    {
      from: string;
      to: string;
      distanceKm: number;
      durationMin: number;
    }
  >
> {
  const out = new Map<number, { from: string; to: string; distanceKm: number; durationMin: number }>();
  if (params.skipHeavyGeo) return out;
  if (params.baseCityByDay.length < 2) return out;

  const clean = (s: string) => String(s || "").trim();
  const lc = (s: string) => clean(s).toLowerCase();
  const destination = clean(params.resolved.destination);
  const regionHints = regionHintsFromDestination(destination);
  const anchor = await geocodeTripAnchor(destination).catch(() => null);

  const uniqCities = Array.from(new Set(params.baseCityByDay.map((c) => clean(c)).filter(Boolean)));
  const coords = new Map<string, { lat: number; lng: number }>();
  await Promise.all(
    uniqCities.map(async (city) => {
      const q = `${city}, ${destination}`.trim();
      const hit = await geocodePhotonPreferred(q, { anchor, regionHints }).catch(() => null);
      if (hit && typeof hit.lat === "number" && typeof hit.lng === "number") coords.set(city, { lat: hit.lat, lng: hit.lng });
    })
  );

  const speedKmH = 65; // aproximación “coche/carretera”
  for (let i = 1; i < params.baseCityByDay.length; i++) {
    const from = clean(params.baseCityByDay[i - 1]);
    const to = clean(params.baseCityByDay[i]);
    if (!from || !to) continue;
    if (lc(from) === lc(to)) continue;
    const a = coords.get(from);
    const b = coords.get(to);
    if (!a || !b) continue;
    const km = haversineKm(a, b);
    const minutes = Math.max(20, Math.round((km / speedKmH) * 60));
    out.set(i + 1, { from, to, distanceKm: Math.round(km), durationMin: minutes });
  }
  return out;
}

function itineraryMentionsToken(dayText: string, token: string): boolean {
  const hay = dayText.toLowerCase();
  const t = token.toLowerCase();
  if (!t) return false;
  if (hay.includes(t)) return true;
  const first = t.split(/\s+/)[0] || t;
  return first.length >= 4 && hay.includes(first);
}

function enforceMustSee(itinerary: ExecutableItineraryPayload, resolved: ResolvedTripCreation): ExecutableItineraryPayload {
  const mustSee = normalizeMustSeeTokens(resolved.intent.mustSee || []);
  if (!mustSee.length) return itinerary;

  const countryHint = (resolved.destination || "").toLowerCase().includes("polonia") ? "Polonia" : resolved.destination;

  const days = (itinerary.days || []).map((d) => ({ ...d, items: [...(d.items || [])] }));
  const missing: string[] = [];

  for (const token of mustSee) {
    const blob = days
      .map((d) =>
        (d.items || [])
          .map((it) => `${it.title || ""} ${it.place_name || ""} ${it.address || ""} ${it.notes || ""}`)
          .join(" ")
      )
      .join(" ");
    if (!itineraryMentionsToken(blob, token)) missing.push(token);
  }
  if (!missing.length) return { ...itinerary, days };

  let mIdx = 0;
  for (let i = 0; i < days.length && mIdx < missing.length; i++) {
    const token = missing[mIdx]!;
    const items = days[i]!.items || [];
    const startTimes = items.map((it) => String(it.start_time || "")).filter(Boolean);
    const lastTime = startTimes.sort().slice(-1)[0] || "16:00";
    const bump = (hhmm: string) => {
      const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
      if (!m) return "17:00";
      let h = Number(m[1]);
      let min = Number(m[2]);
      min += 30;
      if (min >= 60) {
        h += 1;
        min -= 60;
      }
      if (h > 21) return "21:30";
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    };
    const t = bump(lastTime);
    items.push({
      title: `Visita: ${token}`,
      activity_kind: token.toLowerCase().includes("auschwitz") ? "museum" : "visit",
      place_name: token,
      address: `${token}, ${countryHint}`,
      start_time: t,
      notes: "Parada solicitada por el usuario (mustSee).",
    });
    days[i] = { ...days[i]!, items };
    mIdx += 1;
  }

  return { ...itinerary, days };
}

export async function generateExecutableItineraryFromIntent(
  resolved: ResolvedTripCreation,
  options?: { provider?: string | null; config?: TripAutoConfig | null; latencyMode?: "default" | "preview" }
): Promise<{ itinerary: ExecutableItineraryPayload; usage: TripAiUsage }> {
  const cfg = options?.config || DEFAULT_TRIP_AUTO_CONFIG;
  const generateDays = Math.max(1, resolved.durationDays);

  const baseCitySchedule = await buildBaseCitySchedule({
    durationDays: generateDays,
    destination: resolved.destination,
    startCity: (resolved.intent.startLocation || "").trim(),
    endCity: (resolved.intent.endLocation || "").trim(),
    mustSee: normalizeMustSeeTokens(resolved.intent.mustSee || []),
    lodgingBaseMode: cfg.lodging.baseCityMode,
    lodgingBaseCity: cfg.lodging.baseCity,
  });

  return await generateExecutableItineraryFromStructure(resolved, {
    provider: options?.provider ?? null,
    config: cfg,
    structure: { version: 1, baseCityByDay: baseCitySchedule, segments: [] },
    latencyMode: options?.latencyMode ?? "default",
  });
}

/**
 * Genera un itinerario usando una estructura de ruta "dura" (baseCityByDay).
 * Esto evita que el modelo invente ciudades/días y permite refinar sin perder la estructura.
 */
export async function generateExecutableItineraryFromStructure(
  resolved: ResolvedTripCreation,
  options: {
    provider?: string | null;
    config?: TripAutoConfig | null;
    structure: RouteStructure;
    latencyMode?: "default" | "preview";
    debug?: { prompts?: string[] };
  }
): Promise<{ itinerary: ExecutableItineraryPayload; usage: TripAiUsage }> {
  const baseCfg = options?.config || DEFAULT_TRIP_AUTO_CONFIG;
  const provider = options?.provider ?? null;
  const latencyMode = options.latencyMode ?? "default";
  const isPreviewLatency = latencyMode === "preview";
  const isTestEnv = Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";
  const skipHeavyGeo = isPreviewLatency || isTestEnv;
  const cfg: TripAutoConfig = isPreviewLatency
    ? {
        ...baseCfg,
        pace: {
          itemsPerDayMin: Math.max(1, Math.min(baseCfg.pace.itemsPerDayMin, 2)),
          itemsPerDayMax: Math.max(2, Math.min(baseCfg.pace.itemsPerDayMax, 3)),
        },
      }
    : baseCfg;
  const generateDays = Math.max(1, resolved.durationDays);
  const baseCitySchedule = Array.isArray(options.structure?.baseCityByDay)
    ? options.structure.baseCityByDay.slice(0, generateDays)
    : [];
  while (baseCitySchedule.length < generateDays) baseCitySchedule.push(resolved.destination);

  const distinctCities = new Set(baseCitySchedule.map((c) => String(c || "").trim().toLowerCase()).filter(Boolean)).size;
  const effectiveStrictness =
    cfg.geo.strictness === "auto" ? (cfg.lodging.baseCityMode === "single" || distinctCities <= 1 ? "strict" : "balanced") : cfg.geo.strictness;

  const mustSeeRaw = normalizeMustSeeTokens(resolved.intent.mustSee || []);
  const mustSeeOptimized = await optimizeMustSeeOrder(resolved, mustSeeRaw, { skipHeavyGeo });

  // Importante: mantenemos el intent original intacto salvo el orden de mustSee cuando el usuario lo pide.
  const resolvedForPrompt: ResolvedTripCreation = resolved.intent.wantsRouteOptimization
    ? { ...resolved, intent: { ...resolved.intent, mustSee: mustSeeOptimized } }
    : resolved;

  // Asignamos paradas “en ruta” a días de cambio de ciudad (ej. Plitvice entre Zagreb→Split).
  const enRouteByDay = await assignMustSeeToTransitions({
    resolved: resolvedForPrompt,
    baseCityByDay: baseCitySchedule,
    mustSeeTokens: mustSeeOptimized,
    skipHeavyGeo,
  });

  const transferByDay = await estimateTransfersByDay({
    resolved: resolvedForPrompt,
    baseCityByDay: baseCitySchedule,
    skipHeavyGeo,
  });

  const dayLines: string[] = [];
  for (let i = 0; i < generateDays; i++) {
    const date = addDaysIso(resolved.startDate, i);
    const base = baseCitySchedule[i] || resolved.destination;
    const dayNum = i + 1;
    const prevBase = i >= 1 ? String(baseCitySchedule[i - 1] || "").trim() : "";
    const isChange = i >= 1 && prevBase && String(prevBase).toLowerCase() !== String(base).toLowerCase();
    const enRoute = enRouteByDay.get(dayNum) || [];
    const tr = transferByDay.get(dayNum) || null;
    const extra =
      (isChange ? ` — Cambio: ${prevBase} → ${base}` : "") +
      (tr ? ` — Traslado aprox: ${Math.max(1, Math.round(tr.durationMin / 60))}h ${String(tr.durationMin % 60).padStart(2, "0")}m (${tr.distanceKm} km)` : "") +
      (enRoute.length ? ` — Parada en ruta (OBLIGATORIA si cabe): ${enRoute.join(" · ")}` : "");
    dayLines.push(`Día ${dayNum}: ${date} — Ciudad base: ${base}${extra}`);
  }

  const baseContext = {
    destination: resolvedForPrompt.destination,
    start: resolvedForPrompt.intent.startLocation || "—",
    end: resolvedForPrompt.intent.endLocation || "—",
    travelersType: resolvedForPrompt.intent.travelersType || "general",
    budget: resolvedForPrompt.intent.budgetLevel || "medium",
    interests: (resolvedForPrompt.intent.interests || []).join(", ") || "mixto",
    styles: (resolvedForPrompt.intent.travelStyle || []).join(", ") || "equilibrado",
    mustSee: mustSeeOptimized.join(" | ") || "—",
    optimizeHint: resolvedForPrompt.intent.wantsRouteOptimization
      ? "Si hay múltiples ciudades/regiones, organiza los días para minimizar idas y vueltas (progresión norte→sur, oeste→este, etc. si aplica) respetando origen y destino."
      : "",
  };

  // En preview mantenemos output moderado para evitar timeouts.
  const planningMaxOutputTokens = isPreviewLatency ? 5632 : undefined;
  const planningResponseMimeType = isPreviewLatency ? "application/json" : undefined;

  const runOnce = async (p: string) => {
    if (Array.isArray(options.debug?.prompts)) options.debug!.prompts!.push(p);
    const { text, usage } = await askTripAIWithUsage(p, "planning", {
      provider,
      maxOutputTokens: planningMaxOutputTokens,
      responseMimeType: planningResponseMimeType,
    });
    try {
      const parsed = validateItinerary(extractJsonObject(text));
      return { itinerary: parsed, usage };
    } catch (e1) {
      // Reintento: a veces el modelo devuelve texto sin JSON (p.ej. por formato).
      const retryPrompt =
        `${p}\n\n` +
        `IMPORTANTE: Debes responder con un ÚNICO objeto JSON válido. ` +
        `La respuesta debe empezar con "{" y terminar con "}". No incluyas texto adicional.`;
      if (Array.isArray(options.debug?.prompts)) options.debug!.prompts!.push(retryPrompt);
      const second = await askTripAIWithUsage(retryPrompt, "planning", {
        provider,
        maxOutputTokens: planningMaxOutputTokens,
        responseMimeType: planningResponseMimeType,
      });
      try {
        const parsed2 = validateItinerary(extractJsonObject(second.text));
        return {
          itinerary: parsed2,
          usage: {
            provider: usage.provider,
            model: second.usage.model ?? usage.model,
            inputTokens: (usage.inputTokens || 0) + (second.usage.inputTokens || 0),
            outputTokens: (usage.outputTokens || 0) + (second.usage.outputTokens || 0),
          },
        };
      } catch (e2) {
        const head = String(second.text || "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 220);
        const msg = e2 instanceof Error ? e2.message : "no se pudo parsear el JSON";
        throw new Error(`La IA devolvió una respuesta sin JSON parseable (${msg}). Inicio: "${head}"`);
      }
    }
  };

  // Estrategia de rendimiento:
  // - Para viajes “normales” (<= 26 días) intentamos 1 sola llamada (más rápido, similar a Gemini en chat).
  // - Si falla (JSON inválido/truncado) o el viaje es muy largo, caemos al modo chunked.
  // En preview (Vercel) evitamos la “mega llamada” de 20+ días: suele disparar timeouts aunque maxDuration sea alto.
  const SINGLE_CALL_DAYS_LIMIT = isPreviewLatency ? 7 : 26;
  const usageAgg: TripAiUsage = { provider: "gemini", model: null, inputTokens: 0, outputTokens: 0 };

  const singlePrompt = () => `${ITIN_PROMPT}

Destino principal: ${baseContext.destination}
Ciudad/punto inicio (si existe): ${baseContext.start}
Ciudad/punto fin (si existe): ${baseContext.end}
Ritmo: entre ${cfg.pace.itemsPerDayMin} y ${cfg.pace.itemsPerDayMax} items por día.
Coherencia geográfica: ${effectiveStrictness === "strict" ? "muy estricta" : effectiveStrictness === "loose" ? "flexible" : "equilibrada"}.
Preferencias de transporte: ${cfg.transport.notes || "—"}
Fechas por día (TODAS):
${dayLines.join("\n")}

Instrucciones:
- Devuelve EXACTAMENTE ${generateDays} objetos en "days" correspondientes a esas fechas.
- Los campos "day" deben coincidir con el número de Día mostrado arriba (no renumeres).
- Para cada día, respeta la "Ciudad base" indicada.
- Cada día debe tener entre ${cfg.pace.itemsPerDayMin} y ${cfg.pace.itemsPerDayMax} items (salvo días con traslado largo).
- Direcciones: siempre \"..., Ciudad, País\" (no uses solo el país).

Tipo viajeros: ${baseContext.travelersType}
Presupuesto: ${baseContext.budget}
Intereses: ${baseContext.interests}
Estilos: ${baseContext.styles}
Paradas obligatorias (mustSee, en este orden): ${baseContext.mustSee}
${baseContext.optimizeHint}
`;

  const chunkPrompt = (chunkLines: string, requiredCount: number) => `${ITIN_PROMPT}

Destino principal: ${baseContext.destination}
Ciudad/punto inicio (si existe): ${baseContext.start}
Ciudad/punto fin (si existe): ${baseContext.end}
Ritmo: entre ${cfg.pace.itemsPerDayMin} y ${cfg.pace.itemsPerDayMax} items por día.
Coherencia geográfica: ${effectiveStrictness === "strict" ? "muy estricta" : effectiveStrictness === "loose" ? "flexible" : "equilibrada"}.
Preferencias de transporte: ${cfg.transport.notes || "—"}
Fechas por día (SOLO estas fechas):
${chunkLines}

Instrucciones:
- Devuelve EXACTAMENTE ${requiredCount} objetos en "days" correspondientes a esas fechas.
- Los campos "day" deben coincidir con el número de Día mostrado arriba (no renumeres).
- Para cada día, respeta la "Ciudad base" indicada.
- Cada día debe tener entre ${cfg.pace.itemsPerDayMin} y ${cfg.pace.itemsPerDayMax} items.
- Direcciones: siempre \"..., Ciudad, País\" (no uses solo el país).

Tipo viajeros: ${baseContext.travelersType}
Presupuesto: ${baseContext.budget}
Intereses: ${baseContext.interests}
Estilos: ${baseContext.styles}
Paradas obligatorias (mustSee, en este orden): ${baseContext.mustSee}
${baseContext.optimizeHint}
`;

  const strictHint =
    `\n\nIMPORTANTE: Corrige estos problemas:\n` +
    `- NO mezcles ciudades en el mismo día.\n` +
    `- Si un día es Zagreb, NO incluyas Split/Hvar/Dubrovnik.\n` +
    `- start_time estrictamente creciente.\n` +
    `- NO uses placeholders tipo \"Explorar ...\".\n` +
    `Devuelve SOLO JSON válido.\n`;

  const processChunk = async (ch: { dayIdxs: number[]; baseCity: string }) => {
    const chunkLines = ch.dayIdxs.map((idx) => dayLines[idx]!).join("\n");
    const requiredDayNums = ch.dayIdxs.map((i) => i + 1);
    const prompt = chunkPrompt(chunkLines, requiredDayNums.length);

    const first = await runOnce(prompt);
    let normalized = normalizeChunkDays(first.itinerary, resolvedForPrompt, requiredDayNums);
    const sanity1 = sanityCheckItinerary(normalized, {
      destinationLabel: resolvedForPrompt.destination,
      baseCityByDay: baseCitySchedule,
    });
    const placeholders1 = sanityCheckPlaceholders(normalized, {
      generateDays: requiredDayNums.length,
      destinationLabel: resolvedForPrompt.destination,
    });
    let finalUsage = first.usage;

    if (!sanity1.ok || !placeholders1.ok) {
      const second = await runOnce(`${prompt}${strictHint}`);
      normalized = normalizeChunkDays(second.itinerary, resolvedForPrompt, requiredDayNums);
      finalUsage = second.usage;
    }

    const daysArr = Array.isArray(normalized.days) ? normalized.days : [];
    return { daysArr, requiredDayNums, usage: finalUsage };
  };

  let dayMap = new Map<number, ExecutableItineraryPayload["days"][number]>();

  const trySingle = async (): Promise<boolean> => {
    if (generateDays > SINGLE_CALL_DAYS_LIMIT) return false;
    try {
      const first = await runOnce(singlePrompt());
      let normalized = normalizeChunkDays(first.itinerary, resolvedForPrompt, Array.from({ length: generateDays }, (_, i) => i + 1));
      const sanity1 = sanityCheckItinerary(normalized, {
        destinationLabel: resolvedForPrompt.destination,
        baseCityByDay: baseCitySchedule,
      });
      const placeholders1 = sanityCheckPlaceholders(normalized, {
        generateDays,
        destinationLabel: resolvedForPrompt.destination,
      });
      let finalUsage = first.usage;
      if (!sanity1.ok || !placeholders1.ok) {
        const second = await runOnce(`${singlePrompt()}${strictHint}`);
        normalized = normalizeChunkDays(second.itinerary, resolvedForPrompt, Array.from({ length: generateDays }, (_, i) => i + 1));
        finalUsage = second.usage;
      }
      const daysArr = Array.isArray(normalized.days) ? normalized.days : [];
      for (const d of daysArr) if (typeof d?.day === "number") dayMap.set(d.day, d);

      usageAgg.model = finalUsage.model ?? usageAgg.model;
      usageAgg.inputTokens = (usageAgg.inputTokens || 0) + (finalUsage.inputTokens || 0);
      usageAgg.outputTokens = (usageAgg.outputTokens || 0) + (finalUsage.outputTokens || 0);
      return dayMap.size >= Math.max(1, Math.floor(generateDays * 0.85));
    } catch {
      return false;
    }
  };

  const singleOk = await trySingle();
  if (!singleOk) {
    // Generación por bloques: evita truncado de salida y mejora coherencia.
    const chunks = buildDayChunks(baseCitySchedule, { maxDaysPerChunk: isPreviewLatency ? 7 : 5 });
    const CONCURRENCY = 3;
    dayMap = new Map<number, ExecutableItineraryPayload["days"][number]>();
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const batch = chunks.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map((ch) => processChunk(ch)));
      for (const r of results) {
        for (const d of r.daysArr) {
          if (typeof d?.day === "number" && r.requiredDayNums.includes(d.day)) {
            dayMap.set(d.day, d);
          }
        }
        usageAgg.model = r.usage.model ?? usageAgg.model;
        usageAgg.inputTokens = (usageAgg.inputTokens || 0) + (r.usage.inputTokens || 0);
        usageAgg.outputTokens = (usageAgg.outputTokens || 0) + (r.usage.outputTokens || 0);
      }
    }
  }

  // Construimos itinerario final en orden, rellenando faltantes con placeholder.
  const daysOut: ExecutableItineraryPayload["days"] = [];
  for (let i = 0; i < generateDays; i++) {
    const dayNum = i + 1;
    const got = dayMap.get(dayNum);
    if (got && Array.isArray(got.items) && got.items.length) {
      daysOut.push({ day: dayNum, date: addDaysIso(resolvedForPrompt.startDate, i), items: got.items as any });
    } else {
      const baseCity = String(baseCitySchedule[i] || resolvedForPrompt.destination).trim() || resolvedForPrompt.destination;
      daysOut.push({
        day: dayNum,
        date: addDaysIso(resolvedForPrompt.startDate, i),
        items: fallbackDayItems({
          destination: resolvedForPrompt.destination,
          baseCity,
        }),
      });
    }
  }

  // Post-proceso: si hay cambio de ciudad base y falta un item de transporte, lo inyectamos con duración aproximada
  // para “liberar” el día y evitar que la IA lo llene de actividades como si no hubiera traslado.
  for (let i = 1; i < daysOut.length; i++) {
    const dayNum = i + 1;
    const prevBase = String(baseCitySchedule[i - 1] || "").trim();
    const curBase = String(baseCitySchedule[i] || "").trim();
    if (!prevBase || !curBase) continue;
    if (prevBase.toLowerCase() === curBase.toLowerCase()) continue;
    const tr = transferByDay.get(dayNum) || null;
    const day = daysOut[i]!;
    const items = Array.isArray(day.items) ? [...(day.items as any[])] : [];
    const hasTransport = items.some((it) => String((it as any)?.activity_kind || "").toLowerCase() === "transport");
    if (hasTransport) continue;

    const mins = tr?.durationMin ?? 180;
    const km = tr?.distanceKm ?? null;
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    const durTxt = `${hh}h ${String(mm).padStart(2, "0")}m`;
    const title = `Traslado ${prevBase} → ${curBase} (aprox. ${durTxt}${typeof km === "number" ? `, ${km} km` : ""})`;
    items.unshift({
      title,
      activity_kind: "transport",
      place_name: `${prevBase} → ${curBase}`,
      address: `${prevBase} → ${curBase}, ${resolvedForPrompt.destination}`,
      start_time: "08:30",
      notes: "Tiempo aproximado para ajustar el día. Puedes cambiar medio/hora según tu plan real.",
    });

    // Si el traslado es largo, recortamos el exceso de items para que el día no quede sobrecargado.
    const maxItems = mins >= 210 ? 3 : mins >= 150 ? 4 : 5;
    const minItems = 3;
    if (items.length > maxItems) items.splice(maxItems);
    if (items.length < minItems) {
      // si por alguna razón quedase corto, no rellenamos aquí: la UI ya permite editar/regenerar.
    }
    daysOut[i] = { ...day, items };
  }

  const finalItinerary = enforceMustSee(
    validateItinerary({ version: 1, title: `${resolvedForPrompt.destination} (${generateDays} días)`, travelMode: "driving", days: daysOut }),
    resolvedForPrompt
  );

  // Validación final: si aún quedan demasiados placeholders, dejamos el itinerario pero forzaremos al usuario a regenerar días concretos.
  return { itinerary: finalItinerary, usage: usageAgg };
}

/**
 * Generación rápida sin LLM (para evitar timeouts en despliegue).
 * Devuelve un itinerario válido con "Ciudad base" por día + items de fallback,
 * reforzando mustSee cuando sea posible.
 */
export async function generateExecutableItineraryFastFromIntent(
  resolved: ResolvedTripCreation,
  options?: { config?: TripAutoConfig | null; structure?: RouteStructure | null }
): Promise<{ itinerary: ExecutableItineraryPayload; usage: TripAiUsage }> {
  const cfg = options?.config || DEFAULT_TRIP_AUTO_CONFIG;
  const generateDays = Math.max(1, resolved.durationDays);

  const structure =
    options?.structure?.version === 1 && Array.isArray(options.structure.baseCityByDay) && options.structure.baseCityByDay.length
      ? options.structure
      : await deriveRouteStructure({ resolved, config: cfg });
  const baseCitySchedule = structure.baseCityByDay.slice(0, generateDays);
  const mustSeePool = normalizeMustSeeTokens(resolved.intent.mustSee || []);
  const styleHints = [
    ...((resolved.intent.travelStyle || []).map((x) => String(x || "").trim()).filter(Boolean)),
    ...((resolved.intent.constraints || [])
      .map((x) => String(x || "").trim())
      .filter((x) => /\btema:|\btemas:|aventur|relax|gastron|cultural|naturaleza|fiesta|shopping|rom[aá]ntic/iu.test(x))),
  ];

  const daysOut: ExecutableItineraryPayload["days"] = [];
  for (let i = 0; i < generateDays; i++) {
    const baseCity = String(baseCitySchedule[i] || resolved.destination).trim() || resolved.destination;
    const prevBase = i >= 1 ? String(baseCitySchedule[i - 1] || "").trim() : "";
    const isChange = i >= 1 && prevBase && prevBase.toLowerCase() !== baseCity.toLowerCase();
    const baseItems = fallbackDayItems({
      destination: resolved.destination,
      baseCity,
      dayIndex: i,
      totalDays: generateDays,
      mustSeePool,
      styleHints,
      minItems: cfg.pace.itemsPerDayMin,
      maxItems: cfg.pace.itemsPerDayMax,
    });
    const items = isChange
      ? [
          {
            title: `Traslado ${prevBase} → ${baseCity}`,
            activity_kind: "transport",
            place_name: `${prevBase} → ${baseCity}`,
            address: `${prevBase} → ${baseCity}, ${resolved.destination}`,
            start_time: "08:30",
            notes: (cfg.transport.notes || "").trim() ? `Preferencias: ${cfg.transport.notes.trim()}` : null,
          },
          ...baseItems.slice(0, Math.max(1, cfg.pace.itemsPerDayMax - 1)),
        ]
      : baseItems;
    daysOut.push({
      day: i + 1,
      date: addDaysIso(resolved.startDate, i),
      items,
    });
  }

  const itinerary = enforceMustSee(
    validateItinerary({
      version: 1,
      title: `${resolved.destination} (${generateDays} días)`,
      travelMode: "driving",
      days: daysOut,
    }),
    resolved
  );

  return {
    itinerary,
    usage: { provider: "gemini", model: null, inputTokens: 0, outputTokens: 0 },
  };
}

function fallbackDayItems(params: {
  destination: string;
  baseCity: string;
  dayIndex?: number;
  totalDays?: number;
  mustSeePool?: string[];
  styleHints?: string[];
  minItems?: number;
  maxItems?: number;
}) {
  const city = params.baseCity || params.destination;
  const country = params.destination;
  const dayIndex = typeof params.dayIndex === "number" ? params.dayIndex : 0;
  const styleText = (params.styleHints || []).join(" · ").toLowerCase();
  const mustSeePool = (params.mustSeePool || []).map((x) => String(x || "").trim()).filter(Boolean);
  const cityLc = city.toLowerCase();

  const cityMatches = mustSeePool.filter((token) => {
    const t = token.toLowerCase();
    if (!t) return false;
    if (t === cityLc) return false;
    return t.includes(cityLc) || cityLc.includes(t) || t.split(/\s+/)[0] === cityLc.split(/\s+/)[0];
  });
  const genericMatches = mustSeePool.filter((token) => {
    const t = token.toLowerCase();
    if (!t) return false;
    if (cityMatches.includes(token)) return false;
    return !mustSeePool.some((x) => x.toLowerCase() === cityLc) && token.length >= 4;
  });
  const featured = cityMatches[0] || genericMatches[dayIndex % Math.max(1, genericMatches.length)] || null;

  const isAdventure = /aventur|naturaleza|trek|sender|monta[ñn]/.test(styleText);
  const isRelax = /relax|spa|tranquil|slow/.test(styleText);
  const isGastro = /gastron|vino|bodega|food|comida/.test(styleText);
  const isCultural = /cultural|museo|historia|arte/.test(styleText);
  const isNight = /fiesta|noche|bar|copas/.test(styleText);
  const isShopping = /shopping|compras|mercad/.test(styleText);
  const isRomantic = /rom[aá]ntic/.test(styleText);

  const morningVariants = [
    {
      title: featured ? `Visita principal: ${featured}` : `Paseo por el centro histórico de ${city}`,
      activity_kind: isCultural ? "museum" : "visit",
      place_name: featured || city,
      address: `${featured || city}, ${country}`,
      start_time: "09:30",
      notes: featured ? "Imprescindible priorizado en el borrador inicial." : "Bloque principal de la mañana.",
    },
    {
      title: isAdventure ? `Ruta escénica / miradores en ${city}` : `Barrio emblemático y paseo urbano en ${city}`,
      activity_kind: "visit",
      place_name: city,
      address: `${city}, ${country}`,
      start_time: "10:00",
      notes: null,
    },
    {
      title: isRelax ? `Mañana tranquila en cafés y plazas de ${city}` : `Mercado y calles con ambiente local en ${city}`,
      activity_kind: isGastro ? "food" : "visit",
      place_name: city,
      address: `${city}, ${country}`,
      start_time: "10:30",
      notes: null,
    },
  ];

  const middayVariants = [
    {
      title: isGastro ? `Almuerzo gastronómico típico en ${city}` : `Almuerzo local en ${city}`,
      activity_kind: "food",
      place_name: `Restaurante típico (${city})`,
      address: `${city}, ${country}`,
      start_time: "13:00",
      notes: isGastro ? "Prioridad a cocina regional." : null,
    },
    {
      title: isCultural ? `Museo / centro cultural destacado en ${city}` : `Visita panorámica por ${city}`,
      activity_kind: isCultural ? "museum" : "visit",
      place_name: city,
      address: `${city}, ${country}`,
      start_time: "14:30",
      notes: null,
    },
    {
      title: isAdventure ? `Excursión corta de naturaleza desde ${city}` : `Tiempo libre para explorar ${city}`,
      activity_kind: "activity",
      place_name: city,
      address: `${city}, ${country}`,
      start_time: "15:00",
      notes: null,
    },
  ];

  const eveningVariants = [
    {
      title: isRomantic ? `Atardecer romántico y cena en ${city}` : `Atardecer en mirador / paseo final por ${city}`,
      activity_kind: "visit",
      place_name: city,
      address: `${city}, ${country}`,
      start_time: "18:30",
      notes: null,
    },
    {
      title: isNight ? `Noche de bares / ambiente en ${city}` : `Cena tradicional en ${city}`,
      activity_kind: isNight ? "nightlife" : "food",
      place_name: city,
      address: `${city}, ${country}`,
      start_time: "20:30",
      notes: null,
    },
    {
      title: isShopping ? `Compras y paseo nocturno en ${city}` : `Paseo nocturno por zona animada de ${city}`,
      activity_kind: isShopping ? "shopping" : "visit",
      place_name: city,
      address: `${city}, ${country}`,
      start_time: "21:00",
      notes: null,
    },
  ];

  const base = [
    morningVariants[dayIndex % morningVariants.length]!,
    middayVariants[(dayIndex + 1) % middayVariants.length]!,
    eveningVariants[(dayIndex + 2) % eveningVariants.length]!,
    {
      title: isRelax ? `Tiempo tranquilo / descanso en ${city}` : `Rincón local para seguir descubriendo ${city}`,
      activity_kind: isRelax ? "visit" : "activity",
      place_name: city,
      address: `${city}, ${country}`,
      start_time: "17:00",
      notes: null,
    },
  ];
  const min = typeof params.minItems === "number" ? Math.max(1, Math.round(params.minItems)) : 3;
  const max = typeof params.maxItems === "number" ? Math.max(min, Math.round(params.maxItems)) : 5;
  const sliced = base.slice(0, Math.min(base.length, max));
  while (sliced.length < min) {
    sliced.push({
      title: `Explorar una zona distinta de ${city}`,
      activity_kind: isShopping ? "shopping" : "visit",
      place_name: city,
      address: `${city}, ${country}`,
      start_time: sliced.length === 4 ? "21:00" : "18:00",
      notes: null,
    } as any);
  }
  return sliced as any[];
}

function normalizeChunkDays(
  itinerary: ExecutableItineraryPayload,
  resolved: ResolvedTripCreation,
  requiredDayNums: number[]
): ExecutableItineraryPayload {
  const wanted = new Set(requiredDayNums.map((x) => Math.round(x)));
  const rawDays = Array.isArray(itinerary?.days) ? itinerary.days : [];
  const outDays: ExecutableItineraryPayload["days"] = [];
  for (const d of rawDays) {
    const dayNum = typeof (d as any)?.day === "number" ? Math.round((d as any).day) : null;
    if (!dayNum || !wanted.has(dayNum)) continue;
    const idx = dayNum - 1;
    outDays.push({
      day: dayNum,
      date: addDaysIso(resolved.startDate, idx),
      items: Array.isArray((d as any)?.items) ? ((d as any).items as any[]) : [],
    });
  }
  outDays.sort((a, b) => a.day - b.day);
  return {
    version: 1,
    title: itinerary.title,
    travelMode: itinerary.travelMode,
    days: outDays,
  };
}

function buildDayChunks(baseCityByDay: string[], opts: { maxDaysPerChunk: number }) {
  const max = Math.max(2, Math.min(7, Math.round(opts.maxDaysPerChunk)));
  const chunks: Array<{ dayIdxs: number[]; baseCity: string }> = [];
  let cur: { dayIdxs: number[]; baseCity: string } | null = null;
  for (let i = 0; i < baseCityByDay.length; i++) {
    const base = String(baseCityByDay[i] || "").trim() || "Destino";
    if (!cur || cur.baseCity !== base || cur.dayIdxs.length >= max) {
      if (cur) chunks.push(cur);
      cur = { baseCity: base, dayIdxs: [i] };
    } else {
      cur.dayIdxs.push(i);
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function orderCitiesByDistance(params: {
  destination: string;
  startCity: string;
  endCity: string;
  candidates: string[];
}): Promise<string[]> {
  const clean = (s: string) => String(s || "").trim();
  const start = clean(params.startCity);
  const end = clean(params.endCity);

  const uniq: string[] = [];
  const pushUniq = (s: string) => {
    const t = clean(s);
    if (!t) return;
    const k = t.toLowerCase();
    if (uniq.some((x) => x.toLowerCase() === k)) return;
    uniq.push(t);
  };

  // Fuerza start/end presentes.
  if (start) pushUniq(start);
  for (const c of params.candidates) pushUniq(c);
  if (end) pushUniq(end);

  if (uniq.length <= 2) return uniq;

  const anchor = await geocodeTripAnchor(params.destination).catch(() => null);
  const regionHints = regionHintsFromDestination(params.destination);

  const coords = new Map<string, { lat: number; lng: number }>();
  await Promise.all(
    uniq.map(async (label) => {
      const q = `${label}, ${params.destination}`.trim();
      const hit = await geocodePhotonPreferred(q, { anchor, regionHints }).catch(() => null);
      if (hit) coords.set(label, { lat: hit.lat, lng: hit.lng });
    })
  );

  const hasStart = start && coords.has(start);
  const hasEnd = end && coords.has(end);
  if (!hasStart || !hasEnd) {
    // Sin coordenadas fiables: mantenemos el orden (start ... end).
    const middle = uniq.filter((x) => x !== start && x !== end);
    return [start, ...middle, end].filter(Boolean);
  }

  const havKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const s1 = Math.sin(dLat / 2);
    const s2 = Math.sin(dLon / 2);
    const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  };

  // Greedy desde start con sesgo hacia end para evitar saltos tontos (p.ej. ir al sur y volver al norte).
  const remaining = uniq.filter((x) => x !== start && x !== end);
  const ordered: string[] = [start];
  let cur = coords.get(start)!;
  const endPt = coords.get(end)!;

  while (remaining.length) {
    let bestIdx = 0;
    let bestScore = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const lab = remaining[i]!;
      const pt = coords.get(lab);
      if (!pt) continue;
      const dCur = havKm(cur, pt);
      const dEnd = havKm(pt, endPt);
      const score = dCur + dEnd * 0.25;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0]!;
    ordered.push(next);
    const nextPt = coords.get(next);
    if (nextPt) cur = nextPt;
  }

  ordered.push(end);
  return ordered.filter(Boolean);
}

async function buildBaseCitySchedule(params: {
  durationDays: number;
  destination: string;
  startCity: string;
  endCity: string;
  mustSee: string[];
  lodgingBaseMode: "rotate" | "single";
  lodgingBaseCity: string;
}): Promise<string[]> {
  const n = Math.max(1, Math.round(params.durationDays));
  const clean = (s: string) => String(s || "").trim();
  const baseCity = clean(params.lodgingBaseCity);
  if (params.lodgingBaseMode === "single" && baseCity) {
    return Array.from({ length: n }, () => baseCity);
  }

  const candidates: string[] = [];
  const push = (s: string) => {
    const t = clean(s);
    if (!t) return;
    const k = t.toLowerCase();
    if (candidates.some((x) => x.toLowerCase() === k)) return;
    candidates.push(t);
  };

  // Priorizamos inicio/fin
  push(params.startCity);
  // Extraemos posibles ciudades de mustSee (una palabra suele ser ciudad/isla: Split, Hvar, Dubrovnik…)
  for (const t of params.mustSee) {
    const tok = clean(t);
    if (!tok) continue;
    const oneWord = tok.split(/\s+/).length === 1;
    if (oneWord && tok.length >= 3 && tok.length <= 22) push(tok);
  }
  push(params.endCity);

  if (!candidates.length) return Array.from({ length: n }, () => clean(params.destination) || "Destino");
  if (candidates.length === 1) return Array.from({ length: n }, () => candidates[0]!);

  const orderedCities = await orderCitiesByDistance({
    destination: params.destination,
    startCity: params.startCity,
    endCity: params.endCity,
    candidates,
  });

  // Reparto en segmentos: mínimo 2 noches por ciudad si hay margen.
  // Bias: si sobran días, damos algo más a origen y destino.
  const cityCount = orderedCities.length;
  const minSeg = n >= cityCount * 2 ? 2 : 1;
  const segDays = new Array<number>(cityCount).fill(minSeg);
  let remaining = n - segDays.reduce((a, b) => a + b, 0);
  const biasOrder = [0, cityCount - 1, ...Array.from({ length: cityCount }, (_, i) => i).filter((i) => i !== 0 && i !== cityCount - 1)];
  let idx = 0;
  while (remaining > 0) {
    const target = biasOrder[idx % biasOrder.length]!;
    segDays[target] = (segDays[target] || 0) + 1;
    remaining -= 1;
    idx += 1;
  }

  const schedule: string[] = [];
  for (let i = 0; i < orderedCities.length; i++) {
    for (let d = 0; d < (segDays[i] || 0); d++) schedule.push(orderedCities[i]!);
  }
  return schedule.slice(0, n);
}

/**
 * Itinerario ya generado en cliente (p. ej. previsualización del asistente): valida, alinea fechas al viaje y refuerza mustSee.
 */
export function normalizeClientExecutableItinerary(
  raw: unknown,
  resolved: ResolvedTripCreation
): ExecutableItineraryPayload {
  const parsed = validateItinerary(raw);
  const aligned = alignItineraryDates(parsed, resolved);
  return enforceMustSee(aligned, resolved);
}
