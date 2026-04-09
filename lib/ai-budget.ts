import { createClient } from "@/lib/supabase/server";
import { estimateGemini25FlashCostEur, getMonthlyAiBudgetEur, monthKeyUtc } from "@/lib/ai-usage";
import type { TripAiUsage } from "@/lib/trip-ai/providers";

type BudgetInfo = {
  monthKey: string;
  monthlyBudgetEur: number;
  currentEstimatedEur: number;
};

export async function enforceAiMonthlyBudgetOrThrow(params: {
  providerId: string | null;
}): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; userId: string; budget: BudgetInfo; shouldTrack: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!user) throw new Error("No hay sesión activa.");

  const requestedProvider = (params.providerId || process.env.AI_PROVIDER || "ollama").toLowerCase();
  const usesGemini = requestedProvider === "gemini";

  const monthKey = monthKeyUtc();
  const monthlyBudgetEur = getMonthlyAiBudgetEur();

  let currentEstimatedEur = 0;
  if (usesGemini) {
    const { data: usageRow, error: usageErr } = await supabase
      .from("user_ai_usage_monthly")
      .select("estimated_cost_eur")
      .eq("user_id", user.id)
      .eq("month_key", monthKey)
      .eq("provider", "gemini")
      .maybeSingle();
    if (usageErr) throw usageErr;
    currentEstimatedEur = usageRow?.estimated_cost_eur != null ? Number(usageRow.estimated_cost_eur) : 0;
    if (Number.isFinite(currentEstimatedEur) && currentEstimatedEur >= monthlyBudgetEur) {
      const err: any = new Error(
        `Has alcanzado tu límite mensual de IA (${monthlyBudgetEur.toFixed(2)}€). ` +
          `Para seguir usando IA este mes, sube el límite o espera al próximo mes.`
      );
      err.code = "AI_BUDGET_EXCEEDED";
      err.httpStatus = 402;
      err.budget = { monthKey, monthlyBudgetEur, currentEstimatedEur };
      throw err;
    }
  }

  return {
    supabase,
    userId: user.id,
    budget: { monthKey, monthlyBudgetEur, currentEstimatedEur },
    shouldTrack: usesGemini,
  };
}

export async function trackAiUsage(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  provider: "gemini" | "ollama" | string;
  monthKey?: string;
  usage: TripAiUsage;
}): Promise<void> {
  if (params.provider !== "gemini") return;
  if (params.usage.provider !== "gemini") return;
  if (typeof params.usage.inputTokens !== "number" || typeof params.usage.outputTokens !== "number") return;

  const monthKey = params.monthKey || monthKeyUtc();
  const deltaEur = estimateGemini25FlashCostEur({
    inputTokens: params.usage.inputTokens,
    outputTokens: params.usage.outputTokens,
  });

  const { data: prevRow, error: prevErr } = await params.supabase
    .from("user_ai_usage_monthly")
    .select("requests_count, input_tokens, output_tokens, estimated_cost_eur")
    .eq("user_id", params.userId)
    .eq("month_key", monthKey)
    .eq("provider", "gemini")
    .maybeSingle();
  if (prevErr) throw prevErr;

  const nextRequests = (prevRow?.requests_count ?? 0) + 1;
  const nextInput = Number(prevRow?.input_tokens ?? 0) + params.usage.inputTokens;
  const nextOutput = Number(prevRow?.output_tokens ?? 0) + params.usage.outputTokens;
  const nextCost = Number(prevRow?.estimated_cost_eur ?? 0) + deltaEur;

  const { error: upsertErr } = await params.supabase.from("user_ai_usage_monthly").upsert(
    {
      user_id: params.userId,
      month_key: monthKey,
      provider: "gemini",
      model: params.usage.model,
      requests_count: nextRequests,
      input_tokens: nextInput,
      output_tokens: nextOutput,
      estimated_cost_eur: nextCost,
      last_request_at: new Date().toISOString(),
    },
    { onConflict: "user_id,month_key,provider" }
  );
  if (upsertErr) throw upsertErr;
}

