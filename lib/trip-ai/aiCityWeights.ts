import { askGeminiWithUsage } from "@/lib/trip-ai/providers";

// In-process cache (cleared on cold start). Keyed by sorted city list + total days.
const cache = new Map<string, { weights: Map<string, number>; ts: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

function normalize(s: unknown): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function cacheKey(cities: string[], durationDays: number): string {
  return [...cities].map(normalize).sort().join("|") + "_d" + durationDays;
}

function buildPrompt(cities: string[], durationDays: number): string {
  const list = cities.join(", ");
  return `Eres un experto en planificación de viajes. Un viajero tiene ${durationDays} días en total para visitar: ${list}.

¿Cuántos días mínimos recomiendas dedicar a cada destino para aprovecharlo bien? Ten en cuenta el tamaño de cada lugar, sus principales atractivos y el tiempo mínimo necesario para una visita digna.

Devuelve SOLO un objeto JSON. Las claves son los nombres de los destinos exactamente como aparecen en la lista; los valores son números enteros de días mínimos recomendados.
Sin markdown, sin texto extra.

Ejemplo para "París, Lyon, Burdeos": {"París": 3, "Lyon": 2, "Burdeos": 2}

Responde ÚNICAMENTE con el objeto JSON.`;
}

function parseWeightsFromAi(raw: string, cities: string[]): Map<string, number> {
  const match = raw.trim().match(/\{[\s\S]*\}/);
  if (!match) return new Map();
  try {
    const parsed = JSON.parse(match[0]);
    if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) return new Map();
    const out = new Map<string, number>();
    for (const [key, val] of Object.entries(parsed)) {
      const days = typeof val === "number" ? Math.max(1, Math.min(20, Math.round(val as number))) : null;
      if (!days) continue;
      // Match AI key back to the original city name by normalized comparison
      const nKey = normalize(key);
      const matched = cities.find((c) => normalize(c) === nKey || normalize(c).includes(nKey) || nKey.includes(normalize(c)));
      if (matched) out.set(normalize(matched), days);
    }
    return out;
  } catch {
    return new Map();
  }
}

/**
 * Fetches AI-recommended minimum days for each city in `unknownCities`, using those as
 * relative weights in the night-allocation algorithm. Results are cached 30 min per process.
 *
 * Returns a Map keyed by normalize(city) → recommended days (treated as weight value).
 * Silently returns an empty Map on any failure so callers degrade gracefully.
 */
export async function fetchAiCityWeights(
  unknownCities: string[],
  durationDays: number
): Promise<Map<string, number>> {
  if (!unknownCities.length) return new Map();

  const key = cacheKey(unknownCities, durationDays);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.weights;

  try {
    const prompt = buildPrompt(unknownCities, durationDays);
    const { text } = await askGeminiWithUsage(prompt, "planning", {
      maxOutputTokens: 256,
      responseMimeType: "application/json",
    });
    const weights = parseWeightsFromAi(text, unknownCities);

    if (weights.size > 0) {
      if (cache.size >= 300) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      cache.set(key, { weights, ts: Date.now() });
    }
    return weights;
  } catch {
    // Graceful degradation: caller will use hardcoded weights / equal distribution
    return new Map();
  }
}
