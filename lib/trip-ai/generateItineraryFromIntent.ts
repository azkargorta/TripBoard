import { askTripAIWithUsage } from "@/lib/trip-ai/providers";
import type { TripAiUsage } from "@/lib/trip-ai/providers";
import type { ExecutableItineraryPayload } from "@/lib/trip-ai/tripCreationTypes";
import type { ResolvedTripCreation } from "@/lib/trip-ai/tripCreationResolve";
import { extractJsonObject } from "@/lib/trip-ai/tripCreationJson";
import { addDaysIso } from "@/lib/trip-ai/tripCreationDates";

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

  const prompt = `${ITIN_PROMPT}

Destino principal: ${resolved.destination}
Ciudad/punto inicio (si existe): ${resolved.intent.startLocation || "—"}
Ciudad/punto fin (si existe): ${resolved.intent.endLocation || "—"}
Fechas por día:
${dayLines.join("\n")}
Duración: ${resolved.durationDays} días.
Tipo viajeros: ${resolved.intent.travelersType || "general"}
Presupuesto: ${resolved.intent.budgetLevel || "medium"}
Intereses: ${(resolved.intent.interests || []).join(", ") || "mixto"}
Estilos: ${(resolved.intent.travelStyle || []).join(", ") || "equilibrado"}
Paradas obligatorias (mustSee): ${normalizeMustSeeTokens(resolved.intent.mustSee || []).join(" | ") || "—"}
${resolved.intent.wantsRouteOptimization ? "Prioriza orden geográfico razonable dentro de cada día." : ""}
`;

  const { text, usage } = await askTripAIWithUsage(prompt, "planning", { provider: options?.provider ?? null });
  const parsed = validateItinerary(extractJsonObject(text));
  const aligned = alignItineraryDates(parsed, resolved);
  return { itinerary: enforceMustSee(aligned, resolved), usage };
}
