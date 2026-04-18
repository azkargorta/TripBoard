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
Fechas por día:
${dayLines.join("\n")}
Duración: ${resolved.durationDays} días.
Tipo viajeros: ${resolved.intent.travelersType || "general"}
Presupuesto: ${resolved.intent.budgetLevel || "medium"}
Intereses: ${(resolved.intent.interests || []).join(", ") || "mixto"}
Estilos: ${(resolved.intent.travelStyle || []).join(", ") || "equilibrado"}
${resolved.intent.wantsRouteOptimization ? "Prioriza orden geográfico razonable dentro de cada día." : ""}
`;

  const { text, usage } = await askTripAIWithUsage(prompt, "planning", { provider: options?.provider ?? null });
  const parsed = validateItinerary(extractJsonObject(text));
  return { itinerary: alignItineraryDates(parsed, resolved), usage };
}
