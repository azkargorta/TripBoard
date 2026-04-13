import { NextResponse } from "next/server";
import { buildTripContext } from "@/lib/trip-ai/buildTripContext";
import { buildTripPrompt, type TripAiMode } from "@/lib/trip-ai/buildPrompt";
import { askTripAIWithUsage } from "@/lib/trip-ai/providers";
import { appendMessage, createConversation, getConversation, listMessages } from "@/lib/trip-ai/chatStore";
import { detectAction, executeAction } from "@/lib/trip-ai/actions";
import { enforceAiMonthlyBudgetOrThrow, trackAiUsage } from "@/lib/ai-budget";
import { monthKeyUtc } from "@/lib/ai-usage";

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

    // Premium required: sin premium no se consume IA (0 gasto).
    const { data: profileRow, error: profileErr } = await supabase
      .from("profiles")
      .select("is_premium")
      .eq("id", userId)
      .maybeSingle();
    const isPremium = !profileErr && Boolean((profileRow as any)?.is_premium);
    if (!isPremium) {
      return NextResponse.json(
        { error: "Necesitas Premium para usar la IA.", code: "PREMIUM_REQUIRED" },
        { status: 402 }
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

    const { text: answer, usage } = await askTripAIWithUsage(prompt, mode, { provider });

    await trackAiUsage({ supabase, userId, provider: (provider || process.env.AI_PROVIDER || "ollama").toLowerCase(), monthKey, usage });

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
        error: error instanceof Error ? error.message : "No se pudo generar la respuesta del asistente del viaje.",
      },
      { status: 500 }
    );
  }
}
