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

const ITIN_PROMPT = `Genera un itinerario JSON para la app Kaviro. Devuelve SOLO JSON válido (sin markdown).
Esquema exacto:
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
          "start_time": "HH:MM",
          "notes": string|null
        }
      ]
    }
  ]
}

Reglas:
- Cada día: entre 3 y 5 items, start_time en orden creciente.
- Debes devolver SIEMPRE el array "days" con todos los días solicitados (ver sección "Fechas por día"). No omitas días.
- Lugares realistas para el destino indicado.
- Coherencia geográfica (CRÍTICO): en un mismo día, todos los items deben estar en la MISMA ciudad/área (o a <~30 km). No “teletransportes” entre ciudades lejanas o islas.
- Si cambias de ciudad/región, hazlo como máximo 1 vez por día e incluye un item con activity_kind="transport" (tren/coche/ferry) con origen→destino y una address acorde.
- **address (MUY IMPORTANTE):** en cada item debe figurar la **ciudad y el país del viaje** del "Destino principal" (ej. comercio en Venecia → "…, Venecia, Italia"). No uses solo nombres de calle o de establecimiento que puedan existir en otro país (ej. evita "Calle Venecia" sin ciudad/país si el viaje es Italia).
- **place_name:** el nombre visible del sitio en la zona del destino (no inventes sucursales en países distintos al del viaje).
- version siempre 1.
- travelMode "walking" si el usuario prefiere andar o ciudad compacta; si no, "driving".
- Si el usuario ha pedido paradas obligatorias (mustSee), DEBES incluirlas como items (title/place_name) repartiéndolas por los días disponibles.
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

async function optimizeMustSeeOrder(resolved: ResolvedTripCreation, tokens: string[]): Promise<string[]> {
  if (!resolved.intent.wantsRouteOptimization) return tokens;
  if (tokens.length < 3) return tokens;

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
  options?: { provider?: string | null; config?: TripAutoConfig | null }
): Promise<{ itinerary: ExecutableItineraryPayload; usage: TripAiUsage }> {
  const cfg = options?.config || DEFAULT_TRIP_AUTO_CONFIG;
  const generateDays = Math.max(1, resolved.durationDays);

  const baseCitySchedule = buildBaseCitySchedule({
    durationDays: generateDays,
    destination: resolved.destination,
    startCity: (resolved.intent.startLocation || "").trim(),
    endCity: (resolved.intent.endLocation || "").trim(),
    mustSee: normalizeMustSeeTokens(resolved.intent.mustSee || []),
    lodgingBaseMode: cfg.lodging.baseCityMode,
    lodgingBaseCity: cfg.lodging.baseCity,
  });

  const dayLines: string[] = [];
  for (let i = 0; i < generateDays; i++) {
    const date = addDaysIso(resolved.startDate, i);
    const base = baseCitySchedule[i] || resolved.destination;
    dayLines.push(`Día ${i + 1}: ${date} — Ciudad base: ${base}`);
  }

  const mustSeeRaw = normalizeMustSeeTokens(resolved.intent.mustSee || []);
  const mustSeeOptimized = await optimizeMustSeeOrder(resolved, mustSeeRaw);

  // Importante: mantenemos el intent original intacto salvo el orden de mustSee cuando el usuario lo pide.
  const resolvedForPrompt: ResolvedTripCreation = resolved.intent.wantsRouteOptimization
    ? { ...resolved, intent: { ...resolved.intent, mustSee: mustSeeOptimized } }
    : resolved;

  const provider = options?.provider ?? null;
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

  const runOnce = async (p: string) => {
    const { text, usage } = await askTripAIWithUsage(p, "planning", { provider });
    const parsed = validateItinerary(extractJsonObject(text));
    return { itinerary: parsed, usage };
  };

  // Generación por bloques: evita truncado de salida y mejora coherencia.
  const chunks = buildDayChunks(baseCitySchedule, { maxDaysPerChunk: 5 });
  const dayMap = new Map<number, ExecutableItineraryPayload["days"][number]>();
  const usageAgg: TripAiUsage = { provider: "gemini", model: null, inputTokens: 0, outputTokens: 0 };

  for (const ch of chunks) {
    const chunkLines = ch.dayIdxs.map((idx) => dayLines[idx]!).join("\n");
    const chunkPrompt = `${ITIN_PROMPT}

Destino principal: ${baseContext.destination}
Ciudad/punto inicio (si existe): ${baseContext.start}
Ciudad/punto fin (si existe): ${baseContext.end}
Ritmo: entre ${cfg.pace.itemsPerDayMin} y ${cfg.pace.itemsPerDayMax} items por día.
Coherencia geográfica: ${cfg.geo.strictness === "strict" ? "muy estricta" : cfg.geo.strictness === "loose" ? "flexible" : "equilibrada"}.
Preferencias de transporte: ${cfg.transport.notes || "—"}
Fechas por día (SOLO estas fechas):
${chunkLines}

Instrucciones:
- Devuelve EXACTAMENTE ${ch.dayIdxs.length} objetos en "days" correspondientes a esas fechas.
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

    const first = await runOnce(chunkPrompt);
    const aligned1 = alignItineraryDates(first.itinerary, resolvedForPrompt);
    const sanity1 = sanityCheckItinerary(aligned1, { destinationLabel: resolvedForPrompt.destination, baseCityByDay: baseCitySchedule });
    const placeholders1 = sanityCheckPlaceholders(aligned1, { generateDays, destinationLabel: resolvedForPrompt.destination });

    let final = first;
    let alignedFinal = aligned1;
    if (!sanity1.ok || !placeholders1.ok) {
      const strictHint = `\n\nIMPORTANTE: Corrige estos problemas:\n- NO mezcles ciudades en el mismo día.\n- Si un día es Zagreb, NO incluyas Split/Hvar/Dubrovnik.\n- start_time estrictamente creciente.\n- NO uses placeholders tipo \"Explorar ...\".\nDevuelve SOLO JSON válido.\n`;
      final = await runOnce(`${chunkPrompt}${strictHint}`);
      alignedFinal = alignItineraryDates(final.itinerary, resolvedForPrompt);
    }

    const daysArr = Array.isArray(alignedFinal.days) ? alignedFinal.days : [];
    for (const d of daysArr) {
      if (typeof d?.day === "number" && ch.dayIdxs.includes(d.day - 1)) {
        dayMap.set(d.day, d);
      }
    }

    usageAgg.model = final.usage.model ?? usageAgg.model;
    usageAgg.inputTokens = (usageAgg.inputTokens || 0) + (final.usage.inputTokens || 0);
    usageAgg.outputTokens = (usageAgg.outputTokens || 0) + (final.usage.outputTokens || 0);
  }

  // Construimos itinerario final en orden, rellenando faltantes con placeholder.
  const daysOut: ExecutableItineraryPayload["days"] = [];
  for (let i = 0; i < generateDays; i++) {
    const dayNum = i + 1;
    const got = dayMap.get(dayNum);
    if (got && Array.isArray(got.items) && got.items.length) {
      daysOut.push({ day: dayNum, date: addDaysIso(resolvedForPrompt.startDate, i), items: got.items as any });
    } else {
      daysOut.push({
        day: dayNum,
        date: addDaysIso(resolvedForPrompt.startDate, i),
        items: [
          {
            title: `Explorar ${resolvedForPrompt.destination}`,
            activity_kind: "visit",
            place_name: resolvedForPrompt.destination,
            address: resolvedForPrompt.destination,
            start_time: "10:00",
            notes: "Propuesta automática — ajústala en Plan o con el asistente.",
          },
        ],
      });
    }
  }

  const finalItinerary = enforceMustSee(
    validateItinerary({ version: 1, title: `${resolvedForPrompt.destination} (${generateDays} días)`, travelMode: "driving", days: daysOut }),
    resolvedForPrompt
  );

  // Validación final: si aún quedan demasiados placeholders, dejamos el itinerario pero forzaremos al usuario a regenerar días concretos.
  return { itinerary: finalItinerary, usage: usageAgg };
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

function buildBaseCitySchedule(params: {
  durationDays: number;
  destination: string;
  startCity: string;
  endCity: string;
  mustSee: string[];
  lodgingBaseMode: "rotate" | "single";
  lodgingBaseCity: string;
}): string[] {
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

  // Reparto simple en segmentos: mínimo 2 días por ciudad cuando sea posible, inicio al principio y fin al final.
  const minSeg = n >= candidates.length * 2 ? 2 : 1;
  const segDays = new Array<number>(candidates.length).fill(minSeg);
  let remaining = n - segDays.reduce((a, b) => a + b, 0);
  let idx = 0;
  while (remaining > 0) {
    segDays[idx] = (segDays[idx] || 0) + 1;
    remaining -= 1;
    idx = (idx + 1) % segDays.length;
  }

  const schedule: string[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let d = 0; d < (segDays[i] || 0); d++) schedule.push(candidates[i]!);
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
