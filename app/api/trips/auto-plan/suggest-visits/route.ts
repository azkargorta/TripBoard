import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceAiMonthlyBudgetOrThrow, trackAiUsage } from "@/lib/ai-budget";
import { monthKeyUtc } from "@/lib/ai-usage";
import { askGeminiWithUsage } from "@/lib/trip-ai/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

// Cache en memoria por proceso (se limpia con cada cold start en Vercel).
// Evita llamar a Gemini si alguien pide sugerencias para el mismo destino dos veces
// en la misma sesión de servidor.
const suggestionsCache = new Map<string, { suggestions: string[]; ts: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

function cacheKey(destination: string) {
  return destination.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 80);
}

function getCached(destination: string): string[] | null {
  const key = cacheKey(destination);
  const entry = suggestionsCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    suggestionsCache.delete(key);
    return null;
  }
  return entry.suggestions;
}

function setCache(destination: string, suggestions: string[]) {
  const key = cacheKey(destination);
  // Limitar tamaño del cache en memoria (máx 100 entradas)
  if (suggestionsCache.size >= 100) {
    const oldestKey = suggestionsCache.keys().next().value;
    if (oldestKey) suggestionsCache.delete(oldestKey);
  }
  suggestionsCache.set(key, { suggestions, ts: Date.now() });
}

function buildSuggestPrompt(destination: string, limit: number): string {
  return `Eres un experto en viajes. El usuario quiere visitar: "${destination}".

Genera una lista de las ciudades, regiones y paradas más relevantes e imprescindibles para un viaje a ese destino.

Reglas:
- Devuelve SOLO un array JSON válido de strings. Sin markdown, sin explicaciones, sin texto extra.
- Cada string es el nombre de una ciudad, región o parada concreta (ej: "Kioto", "Hokkaido", "Cinque Terre").
- NO incluyas nombres de países, solo subdestinos dentro del destino solicitado.
- NO incluyas descripciones ni paréntesis aclaratorios largos — solo el nombre o nombre + contexto corto (ej: "Mendoza (bodegas)" está bien, "Mendoza (una ciudad preciosa llena de bodegas y montañas)" no).
- Ordena de más a menos importante/popular para un viajero típico.
- Máximo ${limit} items. Mínimo 8 si el destino es grande.
- Si el destino es una ciudad (no un país/región grande), devuelve barrios, zonas y excursiones de día cercanas relevantes.
- Si el destino es un país o región grande, devuelve las ciudades y zonas principales.

Ejemplos de formato correcto:
["Tokio", "Kioto", "Osaka", "Nara", "Hakone (Monte Fuji)", "Hiroshima", "Kanazawa"]

Responde ÚNICAMENTE con el array JSON.`;
}

function parseAiSuggestions(raw: string, limit: number): string[] | null {
  const trimmed = raw.trim();
  // Extraer el array JSON aunque venga con texto alrededor
  const match = trimmed.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map((x: unknown) => String(x || "").trim())
      .filter((x) => x.length > 0 && x.length < 120)
      .slice(0, limit);
  } catch {
    return null;
  }
}

// Fallback estático mejorado: solo se usa si la IA falla completamente.
// Mantiene las listas conocidas pero ya no es el camino principal.
function staticFallback(destination: string, limit: number): string[] {
  const d = destination.toLowerCase();
  const has = (s: string) => d.includes(s.toLowerCase());

  if (has("argentina")) {
    return [
      "Buenos Aires", "Cataratas del Iguazú", "Salta y Jujuy (Quebrada de Humahuaca)",
      "Mendoza (bodegas)", "Bariloche y Ruta de los 7 Lagos", "El Calafate (Glaciar Perito Moreno)",
      "El Chaltén (Fitz Roy)", "Ushuaia (Tierra del Fuego)", "Puerto Madryn y Península Valdés",
      "Córdoba (Sierras)", "Rosario", "Mar del Plata",
    ].slice(0, limit);
  }
  if (has("españa") || has("espana") || has("spain")) {
    return [
      "Madrid", "Barcelona", "Sevilla", "Granada", "Valencia", "San Sebastián",
      "Bilbao", "Córdoba", "Málaga y Costa del Sol", "Mallorca", "Tenerife", "Santiago de Compostela",
    ].slice(0, limit);
  }
  if (has("italia") || has("italy")) {
    return [
      "Roma", "Florencia", "Venecia", "Milán", "Nápoles y Costa Amalfitana",
      "Cinque Terre", "Toscana", "Sicilia", "Lago di Como", "Turín",
    ].slice(0, limit);
  }
  if (has("japón") || has("japon") || has("japan")) {
    return [
      "Tokio", "Kioto", "Osaka", "Nara", "Hakone (Monte Fuji)",
      "Hiroshima y Miyajima", "Kanazawa", "Takayama", "Sapporo (Hokkaido)",
    ].slice(0, limit);
  }
  if (has("francia") || has("france")) {
    return [
      "París", "Provenza", "Costa Azul (Niza, Cannes)", "Lyon", "Burdeos (bodegas)",
      "Mont Saint-Michel", "Bretaña", "Alsacia (Estrasburgo)", "Dordoña",
    ].slice(0, limit);
  }
  if (has("grecia") || has("greece")) {
    return [
      "Atenas", "Santorini", "Mykonos", "Creta", "Rodas",
      "Meteora", "Tesalónica", "Corfu", "Naxos",
    ].slice(0, limit);
  }
  if (has("tailandia") || has("thailand")) {
    return [
      "Bangkok", "Chiang Mai", "Phuket", "Koh Samui", "Krabi y Railay",
      "Pai", "Ayutthaya", "Koh Phi Phi", "Sukhothai",
    ].slice(0, limit);
  }
  if (has("croacia") || has("croatia")) {
    return [
      "Dubrovnik", "Split", "Zagreb", "Plitvice (Parque Nacional)", "Hvar",
      "Kotor (Montenegro, si encaja)", "Zadar", "Rovinj (Istria)", "Korčula",
    ].slice(0, limit);
  }
  if (has("portugal")) {
    return [
      "Lisboa", "Oporto", "Algarve", "Sintra", "Évora",
      "Douro (bodegas)", "Madeira", "Azores", "Braga",
    ].slice(0, limit);
  }
  if (has("marruecos") || has("morocco")) {
    return [
      "Marrakech", "Fez", "Chefchaouen", "Casablanca", "Sahara (Merzouga)",
      "Essaouira", "Rabat", "Agadir", "Atlas (Toubkal)",
    ].slice(0, limit);
  }

  // Fallback genérico final — indica que la IA debería haberlo cubierto
  return [
    "Capital y centro histórico",
    "Ciudad histórica principal",
    "Parque nacional o zona de naturaleza",
    "Zona de montaña o miradores",
    "Costa o playas (si aplica)",
    "Región gastronómica o de vino",
    "Ciudad secundaria con ambiente local",
    "Excursión de día imprescindible",
  ].slice(0, limit);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const destination = typeof body?.destination === "string" ? body.destination.trim() : "";
    if (!destination) return NextResponse.json({ error: "Falta destination." }, { status: 400 });

    const limitRaw = body?.limit;
    const limit =
      typeof limitRaw === "number" && Number.isFinite(limitRaw)
        ? Math.max(8, Math.min(42, Math.round(limitRaw)))
        : 24;

    // Autenticación y premium check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay sesión activa." }, { status: 401 });

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("is_premium")
      .eq("id", user.id)
      .maybeSingle();
    if (!Boolean((profileRow as any)?.is_premium)) {
      return NextResponse.json(
        { error: "Necesitas cuenta Premium para usar sugerencias.", code: "PREMIUM_REQUIRED" },
        { status: 402 }
      );
    }

    // 1. Revisar cache antes de llamar a la IA
    const cached = getCached(destination);
    if (cached) {
      return NextResponse.json({ suggestions: cached.slice(0, limit), fromCache: true });
    }

    // 2. Intentar generar con IA (Gemini)
    let suggestions: string[] | null = null;
    let aiError: string | null = null;

    try {
      const provider = "gemini";
      const monthKey = monthKeyUtc();
      const { supabase: sb, userId, shouldTrack } = await enforceAiMonthlyBudgetOrThrow({ providerId: provider });

      const prompt = buildSuggestPrompt(destination, Math.min(limit + 4, 30));
      const { text, usage } = await askGeminiWithUsage(prompt, "planning", {
        maxOutputTokens: 512,
        responseMimeType: "application/json",
      });

      suggestions = parseAiSuggestions(text, limit);

      if (shouldTrack && suggestions) {
        await trackAiUsage({ supabase: sb, userId, monthKey, provider, usage });
      }
    } catch (e) {
      aiError = e instanceof Error ? e.message : "Error al generar sugerencias con IA.";
      console.error("[suggest-visits] AI error:", aiError);
    }

    // 3. Si la IA falló o devolvió algo inválido, usar fallback estático
    if (!suggestions || suggestions.length === 0) {
      suggestions = staticFallback(destination, limit);
      return NextResponse.json({
        suggestions,
        fromCache: false,
        fallback: true,
        ...(aiError ? { aiError } : {}),
      });
    }

    // 4. Guardar en cache y devolver
    setCache(destination, suggestions);
    return NextResponse.json({ suggestions, fromCache: false });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudieron cargar sugerencias." },
      { status: 500 }
    );
  }
}
