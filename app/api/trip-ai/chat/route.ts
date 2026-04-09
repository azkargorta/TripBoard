import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildTripContext } from "@/lib/trip-ai/buildTripContext";
import { buildTripPrompt, type TripAiMode } from "@/lib/trip-ai/buildPrompt";
import { askTripAIWithUsage } from "@/lib/trip-ai/providers";
import { appendMessage, createConversation, getConversation, listMessages } from "@/lib/trip-ai/chatStore";
import { detectAction, executeAction } from "@/lib/trip-ai/actions";
import { estimateGemini25FlashCostEur, getMonthlyAiBudgetEur, monthKeyUtc } from "@/lib/ai-usage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const tripId = typeof body?.tripId === "string" ? body.tripId : "";
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    const mode = (typeof body?.mode === "string" ? body.mode : "general") as TripAiMode;
    const provider = typeof body?.provider === "string" ? body.provider : null;
    let conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";

    if (!tripId) {
      return NextResponse.json({ error: "Falta el ID del viaje." }, { status: 400 });
    }

    if (!question) {
      return NextResponse.json({ error: "Pregunta vacía" }, { status: 400 });
    }

    // Auth + acceso al viaje
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) return NextResponse.json({ error: userError.message }, { status: 401 });
    if (!user) return NextResponse.json({ error: "No hay sesión activa." }, { status: 401 });

    const { data: participant, error: participantError } = await supabase
      .from("trip_participants")
      .select("id")
      .eq("trip_id", tripId)
      .eq("user_id", user.id)
      .neq("status", "removed")
      .maybeSingle();
    if (participantError) throw participantError;
    if (!participant) return NextResponse.json({ error: "No tienes acceso a este viaje." }, { status: 403 });

    if (!conversationId) {
      const conversation = await createConversation(tripId, mode, question.slice(0, 60));
      conversationId = conversation.id;
    } else {
      await getConversation(conversationId);
    }

    await appendMessage({
      conversationId,
      tripId,
      role: "user",
      content: question,
      metadata: { mode },
    });

    const action = detectAction(question, mode);
    const actionResult = await executeAction(tripId, action);

    const context = await buildTripContext(tripId);
    const history = await listMessages(conversationId);
    const compactHistory = history
      .slice(-10)
      .map((item) => `${item.role === "user" ? "Usuario" : "Asistente"}: ${item.content}`)
      .join("\n");

    const optimizerHint =
      mode === "optimizer"
        ? "\nDebes proponer mejoras concretas del viaje, huecos, conflictos, y una mini hoja de ruta priorizada."
        : "";

    const actionHint =
      actionResult
        ? `\nAcción ejecutada en la app: ${actionResult}\nExplícale al usuario qué has hecho y qué conviene revisar ahora.`
        : "";

    const prompt = buildTripPrompt(
      `${context}\n\nHISTORIAL RECIENTE:\n${compactHistory}${optimizerHint}${actionHint}`,
      question,
      mode
    );

    // Límite de gasto mensual por usuario (solo aplica cuando usas Gemini).
    const monthKey = monthKeyUtc();
    const monthlyBudgetEur = getMonthlyAiBudgetEur();
    const requestedProvider = (provider || process.env.AI_PROVIDER || "ollama").toLowerCase();
    const usesGemini = requestedProvider === "gemini";
    if (usesGemini) {
      const { data: usageRow, error: usageErr } = await supabase
        .from("user_ai_usage_monthly")
        .select("estimated_cost_eur")
        .eq("user_id", user.id)
        .eq("month_key", monthKey)
        .eq("provider", "gemini")
        .maybeSingle();
      if (usageErr) throw usageErr;

      const current = usageRow?.estimated_cost_eur != null ? Number(usageRow.estimated_cost_eur) : 0;
      if (Number.isFinite(current) && current >= monthlyBudgetEur) {
        return NextResponse.json(
          {
            error:
              `Has alcanzado tu límite mensual de IA (${monthlyBudgetEur.toFixed(2)}€). ` +
              `Para seguir usando IA este mes, sube el límite o espera al próximo mes.`,
            code: "AI_BUDGET_EXCEEDED",
            budget: { monthKey, monthlyBudgetEur, currentEstimatedEur: current },
          },
          { status: 402 }
        );
      }
    }

    const { text: answer, usage } = await askTripAIWithUsage(prompt, mode, { provider });

    // Registrar consumo (si tenemos tokens). Esto permite estimar gasto y limitar.
    if (usesGemini && usage.provider === "gemini" && typeof usage.inputTokens === "number" && typeof usage.outputTokens === "number") {
      const deltaEur = estimateGemini25FlashCostEur({ inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });

      // Upsert + acumulado (read-modify-write). Para un MVP es suficiente; si quieres 100% exactitud con concurrencia,
      // lo ideal es una función SQL `increment`.
      const { data: prevRow, error: prevErr } = await supabase
        .from("user_ai_usage_monthly")
        .select("requests_count, input_tokens, output_tokens, estimated_cost_eur")
        .eq("user_id", user.id)
        .eq("month_key", monthKey)
        .eq("provider", "gemini")
        .maybeSingle();
      if (prevErr) throw prevErr;

      const nextRequests = (prevRow?.requests_count ?? 0) + 1;
      const nextInput = Number(prevRow?.input_tokens ?? 0) + usage.inputTokens;
      const nextOutput = Number(prevRow?.output_tokens ?? 0) + usage.outputTokens;
      const nextCost = Number(prevRow?.estimated_cost_eur ?? 0) + deltaEur;

      const { error: upsertErr } = await supabase.from("user_ai_usage_monthly").upsert(
        {
          user_id: user.id,
          month_key: monthKey,
          provider: "gemini",
          model: usage.model,
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

    await appendMessage({
      conversationId,
      tripId,
      role: "assistant",
      content: answer,
      metadata: {
        mode,
        actionType: action.type,
        actionExecuted: Boolean(actionResult),
        actionResult: actionResult || null,
      },
    });

    return NextResponse.json({
      answer,
      conversationId,
      contextUsed: true,
      actionExecuted: Boolean(actionResult),
      actionResult,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo generar la respuesta del asistente del viaje.",
      },
      { status: 500 }
    );
  }
}
