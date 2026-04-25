import { NextResponse } from "next/server";
import { enforceAiMonthlyBudgetOrThrow, trackAiUsage } from "@/lib/ai-budget";
import { monthKeyUtc } from "@/lib/ai-usage";
import { askTripAIWithUsage } from "@/lib/trip-ai/providers";
import { extractJsonObject } from "@/lib/trip-ai/tripCreationJson";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const destination = typeof body?.destination === "string" ? body.destination.trim() : "";
    if (!destination) return NextResponse.json({ error: "Falta destination." }, { status: 400 });

    const provider = "gemini";
    const monthKey = monthKeyUtc();
    const { supabase, userId, shouldTrack } = await enforceAiMonthlyBudgetOrThrow({ providerId: provider });

    const { data: profileRow } = await supabase.from("profiles").select("is_premium").eq("id", userId).maybeSingle();
    if (!Boolean((profileRow as any)?.is_premium)) {
      return NextResponse.json({ error: "Necesitas cuenta Premium para usar sugerencias.", code: "PREMIUM_REQUIRED" }, { status: 402 });
    }

    const prompt =
      `Devuelve SOLO JSON válido.\n` +
      `Quiero una lista de lugares típicos para visitar en: ${destination}.\n` +
      `Formato exacto:\n` +
      `{"suggestions":[string,string,...]}\n` +
      `Reglas:\n` +
      `- 12 a 18 sugerencias\n` +
      `- mezcla: imprescindibles, barrios, miradores, mercados, museos, gastronomía\n` +
      `- usa nombres concretos (no genérico "Centro histórico")\n` +
      `- no incluyas explicaciones, SOLO JSON.\n`;

    const { text, usage } = await askTripAIWithUsage(prompt, "planning", { provider, responseMimeType: "application/json", maxOutputTokens: 1024 });
    const parsed = extractJsonObject(text) as any;
    const list = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
    const suggestions = list.map((x: any) => String(x || "").trim()).filter(Boolean).slice(0, 24);

    if (shouldTrack) {
      await trackAiUsage({ supabase, userId, monthKey, provider, usage });
    }

    return NextResponse.json({ suggestions });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudieron cargar sugerencias." }, { status: 500 });
  }
}

