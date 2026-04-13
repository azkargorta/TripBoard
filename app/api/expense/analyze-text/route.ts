import { NextResponse } from "next/server";
import { buildExpenseAnalyzerResult } from "@/lib/expense-analyzer";
import { askTripAIWithUsage } from "@/lib/trip-ai/providers";
import { extractFirstJsonObject } from "@/lib/ai/llmJson";
import { enforceAiMonthlyBudgetOrThrow, trackAiUsage } from "@/lib/ai-budget";
import { monthKeyUtc } from "@/lib/ai-usage";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    // Premium required: IA = coste.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("is_premium")
      .eq("id", user.id)
      .maybeSingle();
    if (!Boolean((profileRow as any)?.is_premium)) {
      return NextResponse.json(
        { error: "Necesitas Premium para usar la IA.", code: "PREMIUM_REQUIRED" },
        { status: 402 }
      );
    }

    const body = await req.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text : "";
    const fileName = typeof body?.fileName === "string" ? body.fileName : "documento";
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";
    const provider = typeof body?.provider === "string" ? String(body.provider) : null;
    const enhance = Boolean(body?.enhance);
    const monthKey = monthKeyUtc();

    if (!text.trim()) {
      return NextResponse.json({ error: "No hay texto para analizar." }, { status: 400 });
    }

    const expense = buildExpenseAnalyzerResult({
      text,
      fileName,
      mimeType,
      extractionMethod: "pdf-parse",
    });

    let llmExpense: any = null;
    let llmError: string | null = null;
    if (enhance && text.trim()) {
      const prompt = [
        "Eres un extractor de datos de gastos a partir de tickets/facturas.",
        "Devuelve SOLO un JSON con este esquema:",
        "{ title, category, amount, currency, expenseDate, merchantName, confidence }",
        "category debe ser una de: lodging, transport, food, tickets, shopping, general.",
        "expenseDate en formato YYYY-MM-DD si es posible. confidence entre 0 y 1.",
        "Si no sabes un campo, pon null.",
        "",
        `Nombre de archivo: ${fileName}`,
        "TEXTO EXTRAÍDO:",
        text.slice(0, 12000),
      ].join("\n");
      try {
        const { supabase, userId } = await enforceAiMonthlyBudgetOrThrow({ providerId: provider });
        const { text: answer, usage } = await askTripAIWithUsage(prompt, "general" as any, { provider });
        await trackAiUsage({
          supabase,
          userId,
          provider: (provider || process.env.AI_PROVIDER || "ollama").toLowerCase(),
          monthKey,
          usage,
        });
        llmExpense = extractFirstJsonObject(answer);
      } catch (e) {
        llmError = e instanceof Error ? e.message : "Error al llamar a la IA.";
      }
    }

    return NextResponse.json({
      ...expense,
      extractedText: text,
      extractedTextLength: text.length,
      llmExpense,
      llmError,
      sharedWarnings: [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo analizar el texto." },
      { status: 500 }
    );
  }
}

