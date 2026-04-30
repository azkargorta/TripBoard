import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceAiMonthlyBudgetOrThrow, trackAiUsage } from "@/lib/ai-budget";
import { monthKeyUtc } from "@/lib/ai-usage";
import { askGeminiWithUsage } from "@/lib/trip-ai/providers";

export const runtime = "nodejs";
export const maxDuration = 30;

function buildParsePrompt(text: string): string {
  return `Eres un asistente que extrae preferencias de viaje de texto libre en español.

El usuario ha escrito: "${text.slice(0, 400)}"

Extrae ÚNICAMENTE los campos que puedas inferir con alta confianza. Si un campo no se menciona de forma clara, NO lo incluyas.

Devuelve SOLO un objeto JSON válido. Sin markdown, sin explicaciones.

Campos disponibles:
- "travelersType": "solo" | "couple" | "friends" | "family"
- "travelersCount": número entero (personas totales)
- "budgetLevel": "low" | "medium" | "high"
- "pace": "relajado" | "equilibrado" | "intenso"
- "travelStyle": array de strings. Valores válidos: "aventura", "relax", "gastronómico", "cultural", "naturaleza", "fiesta", "shopping", "romántico"
- "avoidKeywords": array de strings, cosas que el usuario quiere evitar
- "maxItemsPerDay": número entero 1-12, actividades máximas por día
- "mustSee": array de strings, lugares concretos que el usuario quiere visitar sí o sí
- "notes": string, restricciones o preferencias no capturadas por otros campos

Ejemplos:
- "somos 3 amigos que queremos algo tranquilo con gastronomía" → {"travelersType":"friends","travelersCount":3,"pace":"relajado","travelStyle":["gastronómico"]}
- "viaje romántico de presupuesto alto, sin museos" → {"travelersType":"couple","budgetLevel":"high","avoidKeywords":["museos"],"travelStyle":["romántico"]}
- "voy solo y quiero ver el coliseo y los museos del vaticano" → {"travelersType":"solo","mustSee":["Coliseo","Museos Vaticanos"]}
- "máximo 4 actividades al día, prefiero no madrugar" → {"maxItemsPerDay":4,"notes":"prefiero no madrugar"}

Responde ÚNICAMENTE con el objeto JSON (puede ser {} si no hay nada que extraer con confianza).`;
}

type ParsedFields = {
  travelersType?: "solo" | "couple" | "friends" | "family";
  travelersCount?: number;
  budgetLevel?: "low" | "medium" | "high";
  pace?: "relajado" | "equilibrado" | "intenso";
  travelStyle?: string[];
  avoidKeywords?: string[];
  maxItemsPerDay?: number;
  mustSee?: string[];
  notes?: string;
};

function safeParseFields(raw: string): ParsedFields {
  const match = raw.trim().match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[0]);
    if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) return {};

    const out: ParsedFields = {};
    const TRAVELER_TYPES = ["solo", "couple", "friends", "family"];
    const BUDGETS = ["low", "medium", "high"];
    const PACES = ["relajado", "equilibrado", "intenso"];
    const STYLES = ["aventura", "relax", "gastronómico", "cultural", "naturaleza", "fiesta", "shopping", "romántico"];

    if (TRAVELER_TYPES.includes(parsed.travelersType)) out.travelersType = parsed.travelersType;
    if (typeof parsed.travelersCount === "number" && parsed.travelersCount >= 1 && parsed.travelersCount <= 50) {
      out.travelersCount = Math.round(parsed.travelersCount);
    }
    if (BUDGETS.includes(parsed.budgetLevel)) out.budgetLevel = parsed.budgetLevel;
    if (PACES.includes(parsed.pace)) out.pace = parsed.pace;
    if (Array.isArray(parsed.travelStyle)) {
      const styles = (parsed.travelStyle as unknown[]).filter((s) => STYLES.includes(s as string)) as string[];
      if (styles.length) out.travelStyle = styles;
    }
    if (Array.isArray(parsed.avoidKeywords)) {
      const kws = (parsed.avoidKeywords as unknown[]).map((k) => String(k || "").trim()).filter(Boolean);
      if (kws.length) out.avoidKeywords = kws;
    }
    if (typeof parsed.maxItemsPerDay === "number" && parsed.maxItemsPerDay >= 1 && parsed.maxItemsPerDay <= 12) {
      out.maxItemsPerDay = Math.round(parsed.maxItemsPerDay);
    }
    if (Array.isArray(parsed.mustSee)) {
      const ms = (parsed.mustSee as unknown[]).map((m) => String(m || "").trim()).filter(Boolean);
      if (ms.length) out.mustSee = ms;
    }
    if (typeof parsed.notes === "string" && parsed.notes.trim()) {
      out.notes = parsed.notes.trim();
    }

    return out;
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text || text.length < 4) return NextResponse.json({ fields: {} });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay sesión activa." }, { status: 401 });

    const { data: profileRow } = await supabase.from("profiles").select("is_premium").eq("id", user.id).maybeSingle();
    if (!Boolean((profileRow as any)?.is_premium)) {
      // Silent fallback: keyword parser still works without premium
      return NextResponse.json({ fields: {} });
    }

    const provider = "gemini";
    const monthKey = monthKeyUtc();
    const { supabase: sb, userId, shouldTrack } = await enforceAiMonthlyBudgetOrThrow({ providerId: provider });

    const prompt = buildParsePrompt(text);
    const { text: aiText, usage } = await askGeminiWithUsage(prompt, "planning", {
      maxOutputTokens: 256,
      responseMimeType: "application/json",
    });

    const fields = safeParseFields(aiText);

    if (shouldTrack && Object.keys(fields).length > 0) {
      await trackAiUsage({ supabase: sb, userId, monthKey, provider, usage });
    }

    return NextResponse.json({ fields });
  } catch {
    // Silent: UI falls back to keyword parser
    return NextResponse.json({ fields: {} });
  }
}
