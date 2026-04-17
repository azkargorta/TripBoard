import { NextResponse } from "next/server";
import { buildTripSummaryForAi } from "@/lib/trip-ai/buildTripSummary";
import { buildTripPrompt, type TripAiMode } from "@/lib/trip-ai/buildPrompt";
import { askTripAIWithUsage } from "@/lib/trip-ai/providers";
import { appendMessage, createConversation, getConversation } from "@/lib/trip-ai/chatStore";
import { inferAIActionFromQuestion, parseClientAIAction, resolveEffectiveTripAiMode, type AIActionId } from "@/lib/trip-ai/aiActions";
import { actionPromptHint, handleAIAction } from "@/lib/trip-ai/handleAIAction";
import { enforceAiMonthlyBudgetOrThrow, trackAiUsage } from "@/lib/ai-budget";
import { monthKeyUtc } from "@/lib/ai-usage";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";

export const runtime = "nodejs";
export const maxDuration = 60;

function clampDialogHint(input: unknown) {
  if (typeof input !== "string") return "";
  const t = input.trim();
  if (!t) return "";
  return t.length > 900 ? `${t.slice(0, 900)}…` : t;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const tripId = typeof body?.tripId === "string" ? body.tripId : "";
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    const clientMode = (typeof body?.mode === "string" ? body.mode : "general") as TripAiMode;
    const modeSource = typeof body?.modeSource === "string" ? body.modeSource : "auto";
    const provider = typeof body?.provider === "string" ? body.provider : null;
    let conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
    const dialogHint = clampDialogHint(body?.dialogHint);

    if (!tripId) {
      return NextResponse.json({ error: "Falta el ID del viaje." }, { status: 400 });
    }

    if (!question) {
      return NextResponse.json({ error: "Pregunta vacía" }, { status: 400 });
    }

    // Auth + presupuesto IA (global por usuario/mes)
    const monthKey = monthKeyUtc();
    let supabase: any;
    let userId = "";
    try {
      const res = await enforceAiMonthlyBudgetOrThrow({ providerId: provider });
      supabase = res.supabase;
      userId = res.userId;
    } catch (e) {
      const err: any = e;
      const status = typeof err?.httpStatus === "number" ? err.httpStatus : err?.code === "AI_BUDGET_EXCEEDED" ? 402 : 401;
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "No autenticado.", code: err?.code || null, budget: err?.budget || null },
        { status }
      );
    }

    const { data: participant, error: participantError } = await supabase
      .from("trip_participants")
      .select("id")
      .eq("trip_id", tripId)
      .eq("user_id", userId)
      .neq("status", "removed")
      .maybeSingle();
    if (participantError) throw participantError;
    if (!participant) return NextResponse.json({ error: "No tienes acceso a este viaje." }, { status: 403 });

    // Premium requerido (por viaje): si hay alguien premium en el viaje, se permite a todos en ese viaje.
    const isPremium = await isPremiumEnabledForTrip({ supabase, userId, tripId });
    if (!isPremium) {
      return NextResponse.json(
        { error: "Necesitas Premium (o un participante Premium en este viaje) para usar la IA.", code: "PREMIUM_REQUIRED" },
        { status: 402 }
      );
    }

    const parsedClientAction = parseClientAIAction(body?.aiAction);
    const aiAction: AIActionId = parsedClientAction ?? inferAIActionFromQuestion(question);
    const effectiveMode = resolveEffectiveTripAiMode({
      clientMode: clientMode === "day_planner" ? "general" : clientMode,
      aiAction,
      respectExplicitMode: modeSource === "manual",
    });

    if (!conversationId) {
      const conversation = await createConversation(tripId, effectiveMode, question.slice(0, 60));
      conversationId = conversation.id;
    } else {
      await getConversation(conversationId);
    }

    await appendMessage({
      conversationId,
      tripId,
      role: "user",
      content: question,
      metadata: { mode: effectiveMode, clientMode, aiAction, modeSource },
    });

    const { executedMessage: actionResult, parsedAction: action } = await handleAIAction(tripId, aiAction, question, effectiveMode);

    const tripSummary = await buildTripSummaryForAi(tripId);
    const actionHintLine = actionPromptHint(aiAction);

    const optimizerHint =
      effectiveMode === "optimizer"
        ? "\nDebes proponer mejoras concretas del viaje, huecos, conflictos, y una mini hoja de ruta priorizada."
        : "";

    const actionHint =
      actionResult
        ? `\nAcción ejecutada en la app: ${actionResult}\nExplícale al usuario qué has hecho y qué conviene revisar ahora.`
        : "";

    const hintBlock = [actionHintLine && `Guía de intención: ${actionHintLine}`, dialogHint && `Último intercambio (opcional, breve):\n${dialogHint}`]
      .filter(Boolean)
      .join("\n\n");

    const prompt = buildTripPrompt(
      `${tripSummary}${hintBlock ? `\n\n${hintBlock}` : ""}${optimizerHint}${actionHint}`,
      question,
      effectiveMode
    );

    const { text: answer, usage } = await askTripAIWithUsage(prompt, effectiveMode, { provider });

    await trackAiUsage({ supabase, userId, provider: (provider || process.env.AI_PROVIDER || "gemini").toLowerCase(), monthKey, usage });

    await appendMessage({
      conversationId,
      tripId,
      role: "assistant",
      content: answer,
      metadata: {
        mode: effectiveMode,
        clientMode,
        aiAction,
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
      aiAction,
      effectiveMode,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo generar la respuesta del asistente del viaje.",
      },
      { status: 500 }
    );
  }
}
