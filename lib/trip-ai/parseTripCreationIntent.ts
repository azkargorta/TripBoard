import { askTripAIWithUsage } from "@/lib/trip-ai/providers";
import type { TripCreationIntent } from "@/lib/trip-ai/tripCreationTypes";
import { extractJsonObject } from "@/lib/trip-ai/tripCreationJson";
import type { TripAiUsage } from "@/lib/trip-ai/providers";
import { mergeTripCreationIntent } from "@/lib/trip-ai/tripCreationResolve";

function normalizeIntent(raw: Record<string, unknown>): TripCreationIntent {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const arr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean) : []);

  const travelersType = str(raw.travelersType);
  const tt =
    travelersType === "solo" || travelersType === "couple" || travelersType === "friends" || travelersType === "family"
      ? travelersType
      : null;

  const budgetLevel = str(raw.budgetLevel);
  const bl = budgetLevel === "low" || budgetLevel === "medium" || budgetLevel === "high" ? budgetLevel : null;

  return {
    destination: str(raw.destination) || null,
    startLocation: str(raw.startLocation) || null,
    endLocation: str(raw.endLocation) || null,
    durationDays: num(raw.durationDays) != null ? Math.round(num(raw.durationDays) as number) : null,
    startDate: str(raw.startDate) || null,
    endDate: str(raw.endDate) || null,
    travelersCount: num(raw.travelersCount) != null ? Math.max(1, Math.round(num(raw.travelersCount) as number)) : null,
    travelersType: tt,
    budgetLevel: bl,
    interests: arr(raw.interests),
    travelStyle: arr(raw.travelStyle),
    constraints: arr(raw.constraints),
    mustSee: arr(raw.mustSee),
    wantsRouteOptimization: Boolean(raw.wantsRouteOptimization),
    wantsBudgetPlan: Boolean(raw.wantsBudgetPlan),
    suggestedTripName: str(raw.suggestedTripName) || null,
  };
}

const PARSE_PROMPT = `Eres un extractor de datos para la app de viajes Kaviro.
Devuelve SOLO un objeto JSON (sin markdown, sin texto adicional) con estas claves exactas:
{
  "destination": string|null,
  "startLocation": string|null,
  "endLocation": string|null,
  "durationDays": number|null,
  "startDate": "YYYY-MM-DD"|null,
  "endDate": "YYYY-MM-DD"|null,
  "travelersCount": number|null,
  "travelersType": "solo"|"couple"|"friends"|"family"|null,
  "budgetLevel": "low"|"medium"|"high"|null,
  "interests": string[],
  "travelStyle": string[],
  "constraints": string[],
  "mustSee": string[],
  "wantsRouteOptimization": boolean,
  "wantsBudgetPlan": boolean,
  "suggestedTripName": string|null
}

Reglas:
- destination: ciudad o región principal en español o nombre propio local.
- startLocation/endLocation: si el usuario menciona “empiezo en…” o “termino en…”, o es un viaje multi-ciudad, rellena estos campos.
- Si el usuario da fechas explícitas, rellena startDate/endDate y calcula durationDays.
- Si solo da duración (ej. "4 días"), durationDays numérico y startDate/endDate null.
- budgetLevel: si no se menciona presupuesto, usa "medium".
- wantsRouteOptimization: true si pide ruta optimizada, menos desplazamientos, orden geográfico, "ruta optimizada".
- wantsBudgetPlan: true si habla de presupuesto, barato, caro, ahorrar.
- interests/travelStyle: palabras clave cortas (ej. monumentos, gastronomía, museos, relax).
- mustSee: lista de sitios/paradas obligatorias que el usuario menciona (máx. 8), nombres cortos.
`;

export async function parseTripCreationIntentLLM(
  userText: string,
  options?: { provider?: string | null }
): Promise<{ intent: TripCreationIntent; usage: TripAiUsage }> {
  const prompt = `${PARSE_PROMPT}

Texto del usuario:
"""${userText.replace(/"""/g, '"').slice(0, 4000)}"""`;

  const { text, usage } = await askTripAIWithUsage(prompt, "planning", { provider: options?.provider ?? null });
  const raw = extractJsonObject(text) as Record<string, unknown>;
  return { intent: normalizeIntent(raw), usage };
}

export async function mergeTripCreationIntentLLM(
  draft: TripCreationIntent,
  followUp: string,
  options?: { provider?: string | null }
): Promise<{ intent: TripCreationIntent; usage: TripAiUsage }> {
  const prompt = `${PARSE_PROMPT}

Ya tienes este borrador (JSON). El usuario responde con una aclaración corta. Devuelve SOLO el JSON fusionado (actualiza solo lo que la respuesta aclara; conserva el resto).

BORRADOR:
${JSON.stringify(draft)}

ACLARACIÓN:
"""${followUp.replace(/"""/g, '"').slice(0, 2000)}"""`;

  const { text, usage } = await askTripAIWithUsage(prompt, "planning", { provider: options?.provider ?? null });
  const raw = extractJsonObject(text) as Record<string, unknown>;
  return { intent: mergeTripCreationIntent(draft, normalizeIntent(raw)), usage };
}
