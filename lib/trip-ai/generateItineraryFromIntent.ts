import { askTripAIWithUsage } from "@/lib/trip-ai/providers";
import type { TripAiUsage } from "@/lib/trip-ai/providers";
import type { ExecutableItineraryPayload } from "@/lib/trip-ai/tripCreationTypes";
import type { ResolvedTripCreation } from "@/lib/trip-ai/tripCreationResolve";
import { extractJsonObject } from "@/lib/trip-ai/tripCreationJson";
import { addDaysIso } from "@/lib/trip-ai/tripCreationDates";
import { geocodePhotonPreferred, geocodeTripAnchor, regionHintsFromDestination } from "@/lib/geocoding/photonGeocode";

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
- Lugares realistas para el destino indicado.
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
  const startPoint = startLabel ? await geocodeToken(startLabel) : null;
  const endPoint = endLabel ? await geocodeToken(endLabel) : null;

  const points: Array<{ token: string; lat: number; lng: number }> = [];
  for (const t of tokens) {
    const p = await geocodeToken(t);
    if (p) points.push({ token: t, lat: p.lat, lng: p.lng });
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
  options?: { provider?: string | null }
): Promise<{ itinerary: ExecutableItineraryPayload; usage: TripAiUsage }> {
  const dayLines: string[] = [];
  for (let i = 0; i < resolved.durationDays; i++) {
    const date = addDaysIso(resolved.startDate, i);
    dayLines.push(`Día ${i + 1}: ${date}`);
  }

  const mustSeeRaw = normalizeMustSeeTokens(resolved.intent.mustSee || []);
  const mustSeeOptimized = await optimizeMustSeeOrder(resolved, mustSeeRaw);

  // Importante: mantenemos el intent original intacto salvo el orden de mustSee cuando el usuario lo pide.
  const resolvedForPrompt: ResolvedTripCreation = resolved.intent.wantsRouteOptimization
    ? { ...resolved, intent: { ...resolved.intent, mustSee: mustSeeOptimized } }
    : resolved;

  const prompt = `${ITIN_PROMPT}

Destino principal: ${resolvedForPrompt.destination}
Ciudad/punto inicio (si existe): ${resolvedForPrompt.intent.startLocation || "—"}
Ciudad/punto fin (si existe): ${resolvedForPrompt.intent.endLocation || "—"}
Fechas por día:
${dayLines.join("\n")}
Duración: ${resolvedForPrompt.durationDays} días.
Tipo viajeros: ${resolvedForPrompt.intent.travelersType || "general"}
Presupuesto: ${resolvedForPrompt.intent.budgetLevel || "medium"}
Intereses: ${(resolvedForPrompt.intent.interests || []).join(", ") || "mixto"}
Estilos: ${(resolvedForPrompt.intent.travelStyle || []).join(", ") || "equilibrado"}
Paradas obligatorias (mustSee, en este orden): ${mustSeeOptimized.join(" | ") || "—"}
${resolvedForPrompt.intent.wantsRouteOptimization ? "Si hay múltiples ciudades/regiones, organiza los días para minimizar idas y vueltas (progresión norte→sur, oeste→este, etc. si aplica) respetando origen y destino." : ""}
`;

  const { text, usage } = await askTripAIWithUsage(prompt, "planning", { provider: options?.provider ?? null });
  const parsed = validateItinerary(extractJsonObject(text));
  const aligned = alignItineraryDates(parsed, resolvedForPrompt);
  return { itinerary: enforceMustSee(aligned, resolvedForPrompt), usage };
}
