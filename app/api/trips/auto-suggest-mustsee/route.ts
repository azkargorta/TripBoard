import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceAiMonthlyBudgetOrThrow, trackAiUsage } from "@/lib/ai-budget";
import { monthKeyUtc } from "@/lib/ai-usage";
import { askTripAIWithUsage, type TripAiUsage } from "@/lib/trip-ai/providers";
import { extractJsonObject } from "@/lib/trip-ai/tripCreationJson";

export const runtime = "nodejs";
export const maxDuration = 60;

function normalizeSuggestions(list: unknown): string[] {
  const arr = Array.isArray(list) ? list : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of arr) {
    const s = typeof x === "string" ? x.trim() : typeof (x as any)?.label === "string" ? String((x as any).label).trim() : "";
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out.slice(0, 16);
}

async function trackIfCountable(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  monthKey: string;
  usage: TripAiUsage;
}) {
  if (typeof params.usage.inputTokens === "number" && typeof params.usage.outputTokens === "number") {
    await trackAiUsage({
      supabase: params.supabase,
      userId: params.userId,
      provider: "gemini",
      monthKey: params.monthKey,
      usage: params.usage,
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const destination = typeof body?.destination === "string" ? body.destination.trim() : "";
    if (!destination) return NextResponse.json({ error: "Falta destination." }, { status: 400 });

    const monthKey = monthKeyUtc();
    let supabase: Awaited<ReturnType<typeof createClient>>;
    let userId: string;

    try {
      const res = await enforceAiMonthlyBudgetOrThrow({ providerId: "gemini" });
      supabase = res.supabase;
      userId = res.userId;
    } catch (e) {
      const err: any = e;
      const status =
        typeof err?.httpStatus === "number" ? err.httpStatus : err?.code === "AI_BUDGET_EXCEEDED" ? 402 : 401;
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "No autenticado.", code: err?.code || null, budget: err?.budget || null },
        { status }
      );
    }

    // Auth + Premium (misma lógica que otros endpoints del asistente).
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay sesión activa." }, { status: 401 });
    const { data: profileRow } = await supabase.from("profiles").select("is_premium").eq("id", userId).maybeSingle();
    if (!Boolean((profileRow as { is_premium?: boolean } | null)?.is_premium)) {
      return NextResponse.json(
        { error: "Necesitas cuenta Premium para sugerencias automáticas.", code: "PREMIUM_REQUIRED" },
        { status: 402 }
      );
    }

    const prompt = `Devuelve SOLO JSON válido (sin markdown).
Quiero una lista de 12 a 16 lugares turísticos y ciudades ESPECÍFICOS, muy visitados, para viajar a: ${destination}.
Reglas:
- No uses categorías genéricas (NO: "museo", "mercado", "centro histórico").
- Sí usa nombres propios (SÍ: "Buenos Aires", "Cataratas del Iguazú", "Glaciar Perito Moreno", "El Calafate").
- Mezcla ciudades y atracciones icónicas.
- No inventes. Mantente en el país/zona de ${destination}.
Esquema exacto:
{ "items": [ "Lugar 1", "Lugar 2", ... ] }`;

    const { text, usage } = await askTripAIWithUsage(prompt, "planning", { provider: "gemini" });
    await trackIfCountable({ supabase, userId, monthKey, usage });

    const parsed = extractJsonObject(text) as any;
    const items = normalizeSuggestions(parsed?.items);
    if (!items.length) {
      return NextResponse.json({ status: "ok", items: [] });
    }
    return NextResponse.json({ status: "ok", items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron sugerir imprescindibles." },
      { status: 500 }
    );
  }
}

