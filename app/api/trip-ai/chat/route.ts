import { NextResponse } from "next/server";
import { buildTripContext } from "@/lib/trip-ai/buildTripContext";
import { buildTripPrompt, type TripAiMode } from "@/lib/trip-ai/buildPrompt";
import { askOllama } from "@/lib/trip-ai/providers";
import { appendMessage, createConversation, getConversation, listMessages } from "@/lib/trip-ai/chatStore";
import { detectAction, executeAction } from "@/lib/trip-ai/actions";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const tripId = typeof body?.tripId === "string" ? body.tripId : "";
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    const mode = (typeof body?.mode === "string" ? body.mode : "general") as TripAiMode;
    let conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";

    if (!tripId) {
      return NextResponse.json({ error: "Falta el ID del viaje." }, { status: 400 });
    }

    if (!question) {
      return NextResponse.json({ error: "Pregunta vacía" }, { status: 400 });
    }

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

    const answer = await askOllama(prompt, mode);

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
